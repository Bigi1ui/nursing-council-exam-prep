alter table public.practice_sessions
	drop constraint if exists practice_sessions_mock_exam_time_limit_check;

alter table public.practice_sessions
	add constraint practice_sessions_mock_exam_time_limit_check
	check (
		question_set <> 'mock_exam'
		or (
			time_limit_seconds is not null
			and time_limit_seconds between 60 and 14400
			and time_limit_seconds % 60 = 0
		)
	);

alter table public.practice_sessions
	drop constraint if exists practice_sessions_optional_time_limit_check;

alter table public.practice_sessions
	add constraint practice_sessions_optional_time_limit_check
	check (
		time_limit_seconds is null
		or (time_limit_seconds between 60 and 14400 and time_limit_seconds % 60 = 0)
	);

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

	if p_time_limit_seconds is null
		or p_time_limit_seconds not between 60 and 14400
		or p_time_limit_seconds % 60 <> 0 then
		raise exception 'Choose a whole-minute exam duration between 1 and 240 minutes.' using errcode = '22023';
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
		student_id, course_id, question_set, question_count, question_ids, time_limit_seconds
	) values (
		current_user_id, null, 'mock_exam', session_question_count::smallint, session_question_ids, p_time_limit_seconds
	)
	returning id into new_session_id;

	return new_session_id;
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
		where id = p_practice_session_id;
	elsif session_state <> 'completed' then
		raise exception 'Practice session is not active.' using errcode = '42501';
	end if;

	return true;
end;
$$;

drop function if exists public.submit_practice_answer(uuid, uuid, smallint, boolean);
create function public.submit_practice_answer(
	p_practice_session_id uuid,
	p_question_id uuid,
	p_selected_option smallint,
	p_marked_for_review boolean default false
)
returns table (
	is_correct boolean,
	correct_option smallint,
	explanation text,
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
	session_question_set text;
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
		raise exception 'Student account required.' using errcode = '42501';
	end if;

	select session.student_id, session.status, session.question_set, session.question_ids,
		session.started_at, session.time_limit_seconds
	into session_student_id, session_state, session_question_set, session_question_ids,
		session_started_at, session_time_limit
	from public.practice_sessions session
	where session.id = p_practice_session_id
	for update;

	if not found or session_student_id <> current_user_id or session_state <> 'in_progress'
		or session_question_set = 'mock_exam' or not (p_question_id = any(session_question_ids)) then
		raise exception 'Question is not part of your active practice session.' using errcode = '42501';
	end if;

	if session_time_limit is not null
		and pg_catalog.clock_timestamp() >= session_started_at + session_time_limit * interval '1 second' then
		perform public.finish_practice_session(p_practice_session_id);
		return query select null::boolean, null::smallint, null::text, true;
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
		practice_session_id, student_id, question_id, selected_option, is_correct, marked_for_review
	) values (
		p_practice_session_id, current_user_id, p_question_id, p_selected_option, null, p_marked_for_review
	)
	on conflict (practice_session_id, question_id) do update
	set selected_option = excluded.selected_option,
		is_correct = null,
		marked_for_review = excluded.marked_for_review,
		answered_at = pg_catalog.now();

	return query select null::boolean, null::smallint, null::text, false;
end;
$$;

create or replace function public.get_practice_session_answers(p_practice_session_id uuid)
returns table (
	question_id uuid,
	selected_option smallint,
	is_correct boolean,
	correct_option smallint,
	explanation text,
	marked_for_review boolean
)
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
	current_user_id uuid := auth.uid();
begin
	if current_user_id is null or not exists (
		select 1 from public.profiles profile
		where profile.id = current_user_id
			and profile.role = 'student'::public.user_role
	) then
		raise exception 'Student authentication required.' using errcode = '42501';
	end if;

	if not exists (
		select 1 from public.practice_sessions session
		where session.id = p_practice_session_id
			and session.student_id = current_user_id
			and session.status = 'completed'
			and session.question_set <> 'mock_exam'
	) then
		raise exception 'Completed practice session not found.' using errcode = '42501';
	end if;

	return query
	select answer.question_id, answer.selected_option, answer.is_correct,
		question.correct_option, question.explanation, answer.marked_for_review
	from public.student_answers answer
	join public.questions question on question.id = answer.question_id
	where answer.practice_session_id = p_practice_session_id
		and answer.student_id = current_user_id;
end;
$$;

create or replace function public.get_my_practice_mistakes()
returns table (
	question_id uuid,
	prompt text,
	options jsonb,
	selected_option smallint,
	correct_option smallint,
	explanation text,
	course_name text,
	source_title text,
	source_year smallint,
	attempted_at timestamptz
)
language plpgsql
security definer
stable
set search_path = ''
as $$
begin
	if auth.uid() is null or not exists (
		select 1 from public.profiles profile
		where profile.id = auth.uid()
			and profile.role = 'student'::public.user_role
	) then
		raise exception 'Student authentication required.' using errcode = '42501';
	end if;

	return query
	with latest_answers as (
		select distinct on (answer.question_id)
			answer.question_id, answer.selected_option, answer.is_correct, answer.answered_at
		from public.student_answers answer
		join public.practice_sessions session on session.id = answer.practice_session_id
		where answer.student_id = auth.uid()
			and session.status = 'completed'
		order by answer.question_id, answer.answered_at desc
	)
	select question.id, question.prompt, question.options, latest_answers.selected_option,
		question.correct_option, question.explanation, course.name, source.title,
		source.source_year, latest_answers.answered_at
	from latest_answers
	join public.questions question on question.id = latest_answers.question_id
	join public.courses course on course.id = question.course_id
	join public.question_sources source on source.id = question.source_id
	where question.review_status = 'approved'
		and (latest_answers.selected_option is null or latest_answers.is_correct is false)
	order by latest_answers.answered_at desc;
end;
$$;

revoke all on function public.submit_practice_answer(uuid, uuid, smallint, boolean) from public, anon;
grant execute on function public.submit_practice_answer(uuid, uuid, smallint, boolean) to authenticated;
revoke all on function public.get_practice_session_answers(uuid) from public, anon;
grant execute on function public.get_practice_session_answers(uuid) to authenticated;
revoke all on function public.get_my_practice_mistakes() from public, anon;
grant execute on function public.get_my_practice_mistakes() to authenticated;

update public.student_answers answer
set is_correct = null
where answer.practice_session_id in (
	select session.id
	from public.practice_sessions session
	where session.status = 'in_progress'
		and session.question_set <> 'mock_exam'
);
