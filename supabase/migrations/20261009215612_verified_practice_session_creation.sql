create or replace function public.start_practice_session(
	p_course_id uuid,
	p_question_set text,
	p_question_ids uuid[],
	p_time_limit_seconds integer default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
	current_user_id uuid := auth.uid();
	new_session_id uuid;
	selected_question_count integer;
begin
	if current_user_id is null or not exists (
		select 1 from public.profiles profile
		where profile.id = current_user_id and profile.role = 'student'::public.user_role
	) then
		raise exception 'Student authentication required.' using errcode = '42501';
	end if;

	if p_question_set not in ('all', 'random', 'weak', 'mistakes', 'bookmarks') then
		raise exception 'Choose a supported practice question set.' using errcode = '22023';
	end if;

	if p_question_ids is null or pg_catalog.array_ndims(p_question_ids) <> 1
		or pg_catalog.cardinality(p_question_ids) not between 1 and 100 then
		raise exception 'Choose between 1 and 100 practice questions.' using errcode = '22023';
	end if;

	if p_time_limit_seconds is not null
		and (p_time_limit_seconds < 60 or p_time_limit_seconds > 14400 or p_time_limit_seconds % 60 <> 0) then
		raise exception 'Choose a whole-minute timer between 1 and 240 minutes.' using errcode = '22023';
	end if;

	if p_course_id is not null and not exists (
		select 1 from public.courses course
		where course.id = p_course_id and course.is_active
	) then
		raise exception 'The selected course is not active.' using errcode = '22023';
	end if;

	select count(*)::integer into selected_question_count
	from public.questions question
	where question.id = any(p_question_ids)
		and question.review_status = 'approved'
		and (p_course_id is null or question.course_id = p_course_id);

	if selected_question_count <> pg_catalog.cardinality(p_question_ids)
		or (select count(distinct item.question_id) from unnest(p_question_ids) item(question_id)) <> pg_catalog.cardinality(p_question_ids) then
		raise exception 'Every practice question must be unique, approved, and match the selected course.' using errcode = '22023';
	end if;

	insert into public.practice_sessions (
		student_id, course_id, question_set, question_count, question_ids, time_limit_seconds
	) values (
		current_user_id, p_course_id, p_question_set, selected_question_count::smallint, p_question_ids, p_time_limit_seconds
	)
	returning id into new_session_id;

	return new_session_id;
end;
$$;

revoke all on function public.start_practice_session(uuid, text, uuid[], integer) from public, anon;
grant execute on function public.start_practice_session(uuid, text, uuid[], integer) to authenticated;

drop policy if exists "Students create own practice sessions" on public.practice_sessions;
drop policy if exists "Students update own practice sessions" on public.practice_sessions;
drop policy if exists "Students insert answers in own sessions" on public.student_answers;
drop policy if exists "Students update answers in own sessions" on public.student_answers;

revoke insert, update, delete on public.practice_sessions from authenticated;
revoke insert, update, delete on public.student_answers from authenticated;
