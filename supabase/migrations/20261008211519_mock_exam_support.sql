alter table public.practice_sessions
	add column if not exists time_limit_seconds integer;

alter table public.practice_sessions
	drop constraint if exists practice_sessions_question_set_check;

alter table public.practice_sessions
	add constraint practice_sessions_question_set_check
	check (question_set in ('all', 'random', 'weak', 'mistakes', 'bookmarks', 'mock_exam'));

alter table public.practice_sessions
	add constraint practice_sessions_mock_exam_time_limit_check
	check (
		question_set <> 'mock_exam'
		or time_limit_seconds in (3600, 5400, 7200, 10800, 14400)
	);

drop policy if exists "Students manage own practice sessions" on public.practice_sessions;
create policy "Students read own practice sessions"
on public.practice_sessions for select to authenticated
using (student_id = (select auth.uid()));

create policy "Students create own practice sessions"
on public.practice_sessions for insert to authenticated
with check (
	student_id = (select auth.uid())
	and question_set <> 'mock_exam'
);

create policy "Students update own practice sessions"
on public.practice_sessions for update to authenticated
using (
	student_id = (select auth.uid())
	and question_set <> 'mock_exam'
)
with check (
	student_id = (select auth.uid())
	and question_set <> 'mock_exam'
);

revoke update (status, completed_at) on table public.practice_sessions from authenticated;

create or replace function public.submit_practice_answer(
	p_practice_session_id uuid,
	p_question_id uuid,
	p_selected_option smallint,
	p_marked_for_review boolean default false
)
returns table (
	is_correct boolean,
	correct_option smallint,
	explanation text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
	current_user_id uuid := auth.uid();
	session_student_id uuid;
	session_state text;
	session_question_set text;
	session_question_ids uuid[];
	question_options jsonb;
	question_correct_option smallint;
	question_explanation text;
	answer_is_correct boolean;
begin
	if current_user_id is null then
		raise exception 'Authentication required.' using errcode = '42501';
	end if;

	if not exists (
		select 1 from public.profiles profile
		where profile.id = current_user_id
			and profile.role = 'student'::public.user_role
	) then
		raise exception 'Student account required.' using errcode = '42501';
	end if;

	select session.student_id, session.status, session.question_set, session.question_ids
	into session_student_id, session_state, session_question_set, session_question_ids
	from public.practice_sessions session
	where session.id = p_practice_session_id;

	if not found
		or session_student_id <> current_user_id
		or session_state <> 'in_progress'
		or session_question_set = 'mock_exam'
		or not (p_question_id = any(session_question_ids)) then
		raise exception 'Question is not part of your active practice session.' using errcode = '42501';
	end if;

	select question.options, question.correct_option, question.explanation
	into question_options, question_correct_option, question_explanation
	from public.questions question
	where question.id = p_question_id
		and question.review_status = 'approved';

	if not found then
		raise exception 'Approved question not found.' using errcode = 'P0002';
	end if;

	if p_selected_option is not null
		and (p_selected_option < 0 or p_selected_option >= jsonb_array_length(question_options)) then
		raise exception 'Selected option is outside the question choices.' using errcode = '22023';
	end if;

	answer_is_correct := case
		when p_selected_option is null then null
		else p_selected_option = question_correct_option
	end;

	insert into public.student_answers (
		practice_session_id,
		student_id,
		question_id,
		selected_option,
		is_correct,
		marked_for_review
	) values (
		p_practice_session_id,
		current_user_id,
		p_question_id,
		p_selected_option,
		answer_is_correct,
		p_marked_for_review
	)
	on conflict (practice_session_id, question_id) do update
	set
		selected_option = excluded.selected_option,
		is_correct = excluded.is_correct,
		marked_for_review = excluded.marked_for_review,
		answered_at = pg_catalog.now();

	return query select
		answer_is_correct,
		case when p_selected_option is null then null else question_correct_option end,
		case when p_selected_option is null then null else question_explanation end;
end;
$$;

create or replace function public.finish_practice_session(p_practice_session_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
	current_user_id uuid := auth.uid();
	session_student_id uuid;
	session_state text;
	session_question_set text;
begin
	if current_user_id is null or not exists (
		select 1 from public.profiles profile
		where profile.id = current_user_id
			and profile.role = 'student'::public.user_role
	) then
		raise exception 'Student authentication required.' using errcode = '42501';
	end if;

	select session.student_id, session.status, session.question_set
	into session_student_id, session_state, session_question_set
	from public.practice_sessions session
	where session.id = p_practice_session_id
	for update;

	if not found or session_student_id <> current_user_id or session_question_set = 'mock_exam' then
		raise exception 'Practice session not found.' using errcode = '42501';
	end if;

	if session_state = 'in_progress' then
		update public.practice_sessions
		set status = 'completed', completed_at = pg_catalog.clock_timestamp()
		where id = p_practice_session_id;
	elsif session_state <> 'completed' then
		raise exception 'Practice session is not active.' using errcode = '42501';
	end if;

	return true;
end;
$$;

create or replace function public.start_mock_exam(p_time_limit_seconds integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
	current_user_id uuid := auth.uid();
	session_question_ids uuid[];
	session_question_count integer;
	new_session_id uuid;
begin
	if current_user_id is null or not exists (
		select 1 from public.profiles profile
		where profile.id = current_user_id
			and profile.role = 'student'::public.user_role
	) then
		raise exception 'Student authentication required.' using errcode = '42501';
	end if;

	if p_time_limit_seconds not in (3600, 5400, 7200, 10800, 14400) then
		raise exception 'Choose a supported mock exam duration.' using errcode = '22023';
	end if;

	select
		pg_catalog.array_agg(question.id order by question.created_at, question.id),
		pg_catalog.count(*)::integer
	into session_question_ids, session_question_count
	from public.questions question
	where question.review_status = 'approved';

	if session_question_count = 0 then
		raise exception 'No approved questions are available.' using errcode = 'P0002';
	end if;

	if session_question_count > 32767 then
		raise exception 'The approved question bank exceeds the supported exam size.' using errcode = '22003';
	end if;

	insert into public.practice_sessions (
		student_id,
		course_id,
		question_set,
		question_count,
		question_ids,
		time_limit_seconds
	) values (
		current_user_id,
		null,
		'mock_exam',
		session_question_count::smallint,
		session_question_ids,
		p_time_limit_seconds
	)
	returning id into new_session_id;

	return new_session_id;
end;
$$;

create or replace function public.finish_mock_exam(p_practice_session_id uuid)
returns table (
	correct_count integer,
	answered_count integer,
	question_count integer,
	exam_completed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
	current_user_id uuid := auth.uid();
	session_student_id uuid;
	session_state text;
	session_total integer;
	completion_time timestamptz;
begin
	if current_user_id is null or not exists (
		select 1 from public.profiles profile
		where profile.id = current_user_id
			and profile.role = 'student'::public.user_role
	) then
		raise exception 'Student authentication required.' using errcode = '42501';
	end if;

	select session.student_id, session.status, session.question_count
	into session_student_id, session_state, session_total
	from public.practice_sessions session
	where session.id = p_practice_session_id
		and session.question_set = 'mock_exam'
	for update;

	if not found or session_student_id <> current_user_id then
		raise exception 'Mock exam not found.' using errcode = '42501';
	end if;

	if session_state = 'in_progress' then
		update public.student_answers answer
		set is_correct = case
			when answer.selected_option is null then null
			else answer.selected_option = question.correct_option
		end
		from public.questions question
		where answer.practice_session_id = p_practice_session_id
			and question.id = answer.question_id;

		update public.practice_sessions
		set status = 'completed', completed_at = pg_catalog.clock_timestamp()
		where id = p_practice_session_id
		returning completed_at into completion_time;
	elsif session_state <> 'completed' then
		raise exception 'Mock exam is not active.' using errcode = '42501';
	else
		select session.completed_at
		into completion_time
		from public.practice_sessions session
		where session.id = p_practice_session_id;
	end if;

	return query
	select
		pg_catalog.count(*) filter (where answer.is_correct is true)::integer,
		pg_catalog.count(*) filter (where answer.selected_option is not null)::integer,
		session_total,
		completion_time
	from public.student_answers answer
	where answer.practice_session_id = p_practice_session_id;
end;
$$;

create or replace function public.submit_mock_exam_answer(
	p_practice_session_id uuid,
	p_question_id uuid,
	p_selected_option smallint,
	p_marked_for_review boolean default false
)
returns table (
	saved boolean,
	expired boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
	current_user_id uuid := auth.uid();
	session_student_id uuid;
	session_state text;
	session_question_ids uuid[];
	session_started_at timestamptz;
	session_time_limit integer;
	question_options jsonb;
begin
	if current_user_id is null or not exists (
		select 1 from public.profiles profile
		where profile.id = current_user_id
			and profile.role = 'student'::public.user_role
	) then
		raise exception 'Student authentication required.' using errcode = '42501';
	end if;

	select session.student_id, session.status, session.question_ids, session.started_at, session.time_limit_seconds
	into session_student_id, session_state, session_question_ids, session_started_at, session_time_limit
	from public.practice_sessions session
	where session.id = p_practice_session_id
		and session.question_set = 'mock_exam'
	for update;

	if not found or session_student_id <> current_user_id or session_state <> 'in_progress'
		or not (p_question_id = any(session_question_ids)) then
		raise exception 'Question is not part of your active mock exam.' using errcode = '42501';
	end if;

	if pg_catalog.clock_timestamp() >= session_started_at + session_time_limit * interval '1 second' then
		perform public.finish_mock_exam(p_practice_session_id);
		return query select false, true;
		return;
	end if;

	select question.options
	into question_options
	from public.questions question
	where question.id = p_question_id
		and question.review_status = 'approved';

	if not found then
		raise exception 'Approved question not found.' using errcode = 'P0002';
	end if;

	if p_selected_option is not null
		and (p_selected_option < 0 or p_selected_option >= jsonb_array_length(question_options)) then
		raise exception 'Selected option is outside the question choices.' using errcode = '22023';
	end if;

	insert into public.student_answers (
		practice_session_id,
		student_id,
		question_id,
		selected_option,
		is_correct,
		marked_for_review
	) values (
		p_practice_session_id,
		current_user_id,
		p_question_id,
		p_selected_option,
		null,
		p_marked_for_review
	)
	on conflict (practice_session_id, question_id) do update
	set
		selected_option = excluded.selected_option,
		is_correct = null,
		marked_for_review = excluded.marked_for_review,
		answered_at = pg_catalog.now();

	return query select true, false;
end;
$$;

revoke all on function public.submit_practice_answer(uuid, uuid, smallint, boolean) from public, anon;
grant execute on function public.submit_practice_answer(uuid, uuid, smallint, boolean) to authenticated;
revoke all on function public.finish_practice_session(uuid) from public, anon;
grant execute on function public.finish_practice_session(uuid) to authenticated;
revoke all on function public.start_mock_exam(integer) from public, anon;
grant execute on function public.start_mock_exam(integer) to authenticated;
revoke all on function public.finish_mock_exam(uuid) from public, anon;
grant execute on function public.finish_mock_exam(uuid) to authenticated;
revoke all on function public.submit_mock_exam_answer(uuid, uuid, smallint, boolean) from public, anon;
grant execute on function public.submit_mock_exam_answer(uuid, uuid, smallint, boolean) to authenticated;
