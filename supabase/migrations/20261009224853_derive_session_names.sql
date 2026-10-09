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

	if new.session_name is null or pg_catalog.btrim(new.session_name) in ('', 'Practice session') then
		new.session_name := case when course_name is null then set_name else course_name || ' - ' || set_name end;
	end if;
	return new;
end;
$$;

revoke all on function private.assign_practice_session_name() from public, anon, authenticated;
