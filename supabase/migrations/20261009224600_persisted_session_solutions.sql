alter table public.practice_sessions
	add column if not exists session_name text;

create or replace function private.assign_practice_session_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
	course_name text;
	set_name text;
begin
	select course.name into course_name
	from public.courses course where course.id = new.course_id;

	set_name := case new.question_set
		when 'mock_exam' then 'Full mock exam'
		when 'all' then 'All questions practice'
		when 'random' then 'Random practice'
		when 'weak' then 'Weak areas practice'
		when 'mistakes' then 'Previously missed questions'
		when 'bookmarks' then 'Bookmarked questions practice'
		else 'Practice session'
	end;

	new.session_name := coalesce(nullif(pg_catalog.btrim(new.session_name), ''),
		case when course_name is null then set_name else course_name || ' - ' || set_name end);
	return new;
end;
$$;

revoke all on function private.assign_practice_session_name() from public, anon, authenticated;
drop trigger if exists assign_practice_session_name on public.practice_sessions;
create trigger assign_practice_session_name
before insert on public.practice_sessions
for each row execute function private.assign_practice_session_name();

update public.practice_sessions session
set session_name = case
	when session.course_id is not null then course.name || ' - ' ||
		case session.question_set
			when 'mock_exam' then 'Full mock exam'
			when 'all' then 'All questions practice'
			when 'random' then 'Random practice'
			when 'weak' then 'Weak areas practice'
			when 'mistakes' then 'Previously missed questions'
			when 'bookmarks' then 'Bookmarked questions practice'
			else 'Practice session'
		end
	else case session.question_set
		when 'mock_exam' then 'Full mock exam'
		when 'all' then 'All questions practice'
		when 'random' then 'Random practice'
		when 'weak' then 'Weak areas practice'
		when 'mistakes' then 'Previously missed questions'
		when 'bookmarks' then 'Bookmarked questions practice'
		else 'Practice session'
	end
end
from public.courses course
where session.session_name is null and course.id = session.course_id;

update public.practice_sessions session
set session_name = case session.question_set
	when 'mock_exam' then 'Full mock exam'
	when 'all' then 'All questions practice'
	when 'random' then 'Random practice'
	when 'weak' then 'Weak areas practice'
	when 'mistakes' then 'Previously missed questions'
	when 'bookmarks' then 'Bookmarked questions practice'
	else 'Practice session'
end
where session.session_name is null;

alter table public.practice_sessions
	alter column session_name set default 'Practice session',
	alter column session_name set not null;

create or replace function public.get_my_completed_solution_sessions()
returns table (
	session_id uuid,
	session_name text,
	question_set text,
	question_count integer,
	time_limit_seconds integer,
	started_at timestamptz,
	completed_at timestamptz,
	answered_count integer,
	correct_count integer
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
		where profile.id = current_user_id and profile.role = 'student'::public.user_role
	) then
		raise exception 'Student authentication required.' using errcode = '42501';
	end if;

	return query
	select session.id, session.session_name, session.question_set,
		session.question_count::integer, session.time_limit_seconds,
		session.started_at, session.completed_at,
		count(*) filter (where answer.selected_option is not null)::integer,
		count(*) filter (where answer.is_correct is true)::integer
	from public.practice_sessions session
	left join public.student_answers answer on answer.practice_session_id = session.id
	where session.student_id = current_user_id and session.status = 'completed'
	group by session.id
	order by session.completed_at desc nulls last, session.started_at desc;
end;
$$;

create or replace function public.get_my_completed_session_solutions(p_practice_session_id uuid)
returns table (
	question_id uuid,
	question_order integer,
	prompt text,
	options jsonb,
	selected_option smallint,
	correct_option smallint,
	is_correct boolean,
	explanation text,
	course_name text,
	source_title text,
	source_year smallint,
	source_question_number integer
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
		where profile.id = current_user_id and profile.role = 'student'::public.user_role
	) then
		raise exception 'Student authentication required.' using errcode = '42501';
	end if;

	if not exists (
		select 1 from public.practice_sessions session
		where session.id = p_practice_session_id
			and session.student_id = current_user_id
			and session.status = 'completed'
	) then
		raise exception 'Completed solution session not found.' using errcode = '42501';
	end if;

	return query
	select question.id, selected.question_order::integer,
		question.prompt, question.options, answer.selected_option,
		question.correct_option, answer.is_correct, question.explanation,
		course.name, source.title, source.source_year, question.source_question_number
	from public.practice_sessions session
	cross join unnest(session.question_ids) with ordinality as selected(question_id, question_order)
	join public.questions question on question.id = selected.question_id
	join public.courses course on course.id = question.course_id
	join public.question_sources source on source.id = question.source_id
	join public.student_answers answer
		on answer.practice_session_id = session.id
		and answer.student_id = current_user_id
		and answer.question_id = question.id
	where session.id = p_practice_session_id
		and answer.selected_option is not null
	order by selected.question_order;
end;
$$;

revoke all on function public.get_my_completed_solution_sessions() from public, anon;
grant execute on function public.get_my_completed_solution_sessions() to authenticated;
revoke all on function public.get_my_completed_session_solutions(uuid) from public, anon;
grant execute on function public.get_my_completed_session_solutions(uuid) to authenticated;
