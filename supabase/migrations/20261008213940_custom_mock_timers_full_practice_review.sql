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
	select question.id, answer.selected_option, answer.is_correct,
		question.correct_option, question.explanation, coalesce(answer.marked_for_review, false)
	from public.practice_sessions session
	cross join unnest(session.question_ids) as session_question(question_id)
	join public.questions question on question.id = session_question.question_id
	left join public.student_answers answer
		on answer.practice_session_id = session.id
		and answer.student_id = current_user_id
		and answer.question_id = question.id
	where session.id = p_practice_session_id;
end;
$$;

revoke all on function public.start_mock_exam(integer) from public, anon;
grant execute on function public.start_mock_exam(integer) to authenticated;
revoke all on function public.get_practice_session_answers(uuid) from public, anon;
grant execute on function public.get_practice_session_answers(uuid) to authenticated;
