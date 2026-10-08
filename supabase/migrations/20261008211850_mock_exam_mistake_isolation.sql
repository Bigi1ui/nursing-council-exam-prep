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
			answer.question_id,
			answer.selected_option,
			answer.is_correct,
			answer.answered_at
		from public.student_answers answer
		join public.practice_sessions session on session.id = answer.practice_session_id
		where answer.student_id = auth.uid()
			and (session.question_set <> 'mock_exam' or session.status = 'completed')
		order by answer.question_id, answer.answered_at desc
	)
	select
		question.id,
		question.prompt,
		question.options,
		latest_answers.selected_option,
		question.correct_option,
		question.explanation,
		course.name,
		source.title,
		source.source_year,
		latest_answers.answered_at
	from latest_answers
	join public.questions question on question.id = latest_answers.question_id
	join public.courses course on course.id = question.course_id
	join public.question_sources source on source.id = question.source_id
	where question.review_status = 'approved'
		and (latest_answers.selected_option is null or latest_answers.is_correct is false)
	order by latest_answers.answered_at desc;
end;
$$;

revoke all on function public.get_my_practice_mistakes() from public, anon;
grant execute on function public.get_my_practice_mistakes() to authenticated;
