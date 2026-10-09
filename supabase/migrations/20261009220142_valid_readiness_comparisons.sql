create or replace function private.calculate_student_readiness(p_student_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
	practice_answered integer := 0;
	practice_courses integer := 0;
	active_courses integer := 0;
	courses_covered integer := 0;
	accuracy_all numeric;
	accuracy_recent numeric;
	mock_count integer := 0;
	mock_all numeric;
	mock_recent numeric;
	consistency numeric := 0;
	improvement numeric;
	comparison_count integer := 0;
	weak_courses jsonb := '[]'::jsonb;
	accuracy_score numeric;
	mock_score numeric;
	coverage_score numeric;
	readiness_score integer;
	readiness_label text := 'Building your baseline';
	components jsonb;
	minimum_courses integer;
begin
	select count(*)::integer into active_courses from public.courses course where course.is_active;

	with practice_answers as (
		select answer.is_correct, answer.answered_at, question.course_id,
			row_number() over (order by answer.answered_at desc, answer.question_id) as recent_rank
		from public.student_answers answer
		join public.practice_sessions session on session.id = answer.practice_session_id
		join public.questions question on question.id = answer.question_id
		join public.courses course on course.id = question.course_id and course.is_active
		where answer.student_id = p_student_id and session.status = 'completed'
			and session.question_set <> 'mock_exam'
			and answer.selected_option is not null and answer.is_correct is not null
	)
	select count(*)::integer, count(distinct course_id)::integer,
		avg(case when is_correct then 100.0 else 0.0 end),
		avg(case when recent_rank <= 50 then case when is_correct then 100.0 else 0.0 end end)
	into practice_answered, practice_courses, accuracy_all, accuracy_recent
	from practice_answers;

	select count(*)::integer into courses_covered
	from (
		select question.course_id
		from public.student_answers answer
		join public.practice_sessions session on session.id = answer.practice_session_id
		join public.questions question on question.id = answer.question_id
		join public.courses course on course.id = question.course_id and course.is_active
		where answer.student_id = p_student_id and session.status = 'completed'
			and session.question_set <> 'mock_exam' and answer.selected_option is not null
		group by question.course_id having count(*) >= 10
	) covered;

	select coalesce(jsonb_agg(jsonb_build_object(
		'courseName', course_stats.name,
		'answered', course_stats.answered,
		'accuracy', round(course_stats.accuracy)::integer
	) order by course_stats.accuracy), '[]'::jsonb)
	into weak_courses
	from (
		select course.name, count(*)::integer as answered,
			avg(case when answer.is_correct then 100.0 else 0.0 end) as accuracy
		from public.student_answers answer
		join public.practice_sessions session on session.id = answer.practice_session_id
		join public.questions question on question.id = answer.question_id
		join public.courses course on course.id = question.course_id and course.is_active
		where answer.student_id = p_student_id and session.status = 'completed'
			and session.question_set <> 'mock_exam'
			and answer.selected_option is not null and answer.is_correct is not null
		group by course.id, course.name
		having count(*) >= 10 and avg(case when answer.is_correct then 100.0 else 0.0 end) < 60
	) course_stats;

	with mocks as (
		select session.id,
			coalesce(count(*) filter (where answer.is_correct)::numeric / nullif(session.question_count, 0) * 100, 0) as score,
			session.completed_at,
			row_number() over (order by session.completed_at desc, session.id) as recent_rank
		from public.practice_sessions session
		join public.student_answers answer on answer.practice_session_id = session.id
		where session.student_id = p_student_id and session.question_set = 'mock_exam'
			and session.status = 'completed' and session.question_count >= 250
		group by session.id, session.question_count
		having count(*) filter (where answer.selected_option is not null) = session.question_count
	)
	select count(*)::integer, avg(score), avg(score) filter (where recent_rank <= 5)
	into mock_count, mock_all, mock_recent
	from mocks;

	select count(distinct (answer.answered_at at time zone 'UTC')::date)::numeric / 14 * 100
	into consistency
	from public.student_answers answer
	join public.practice_sessions session on session.id = answer.practice_session_id
	where answer.student_id = p_student_id and session.status = 'completed'
		and answer.selected_option is not null
		and answer.answered_at >= pg_catalog.now() - interval '14 days';

	with assessments as (
		select session.question_set, session.question_count, session.completed_at,
			coalesce(count(*) filter (where answer.is_correct)::numeric / nullif(session.question_count, 0), 0) as score
		from public.practice_sessions session
		join public.student_answers answer on answer.practice_session_id = session.id
		where session.student_id = p_student_id and session.status = 'completed'
		group by session.id, session.question_count
		having count(*) filter (where answer.selected_option is not null) = session.question_count
	), comparisons as (
		select score - lag(score) over (partition by question_set, question_count order by completed_at) as change
		from assessments
	)
	select count(*) filter (where change is not null)::integer,
		least(100, greatest(0, 50 + coalesce(avg(change), 0) * 500))
	into comparison_count, improvement
	from comparisons;

	accuracy_score := case when accuracy_all is null then null else (accuracy_all + coalesce(accuracy_recent, accuracy_all)) / 2 end;
	mock_score := case when mock_all is null then null else (mock_all + coalesce(mock_recent, mock_all)) / 2 end;
	coverage_score := case when active_courses = 0 then null else courses_covered::numeric / active_courses * 100 end;
	minimum_courses := least(3, active_courses);

	if accuracy_score is not null and mock_score is not null and comparison_count > 0
		and practice_answered >= 100 and practice_courses >= 2
		and courses_covered >= minimum_courses and mock_count >= 1 then
		readiness_score := round(
			0.30 * accuracy_score + 0.30 * mock_score + 0.15 * coverage_score
			+ 0.10 * least(100, coalesce(consistency, 0)) + 0.15 * improvement
		)::integer;
		readiness_label := case
			when readiness_score <= 20 then 'Getting Started'
			when readiness_score <= 40 then 'Building Your Foundation'
			when readiness_score <= 60 then 'Making Progress'
			when readiness_score <= 75 then 'Strong Progress'
			when readiness_score <= 90 then 'Well Prepared'
			else 'Excellent Preparation'
		end;
	end if;

	components := jsonb_build_object(
		'accuracy', case when accuracy_score is null then null else round(accuracy_score)::integer end,
		'mockPerformance', case when mock_score is null then null else round(mock_score)::integer end,
		'courseCoverage', case when coverage_score is null then null else round(coverage_score)::integer end,
		'consistency', least(100, round(coalesce(consistency, 0))::integer),
		'improvement', case when comparison_count = 0 then null else round(improvement)::integer end
	);

	return jsonb_build_object(
		'score', readiness_score,
		'label', readiness_label,
		'components', components,
		'weakCourses', weak_courses,
		'evidence', jsonb_build_object(
			'practiceQuestions', practice_answered,
			'coursesAnswered', practice_courses,
			'coursesCovered', courses_covered,
			'activeCourses', active_courses,
			'fullMockExams', mock_count,
			'comparableAssessments', comparison_count
		)
	);
end;
$$;

create or replace function private.award_comparable_improvement_after_completion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
	improved boolean;
begin
	if old.status = 'completed' or new.status <> 'completed' then return new; end if;

	with scores as (
		select session.id, session.question_set, session.question_count, session.started_at, session.completed_at,
			coalesce(count(*) filter (where answer.is_correct)::numeric / nullif(session.question_count, 0), 0) as score
		from public.practice_sessions session
		join public.student_answers answer on answer.practice_session_id = session.id
		where session.student_id = new.student_id and session.status = 'completed'
		group by session.id, session.question_count
		having count(*) filter (where answer.selected_option is not null) = session.question_count
	)
	select exists (
		select 1
		from scores current_score
		join lateral (
			select previous_score.score
			from scores previous_score
			where previous_score.question_set = current_score.question_set
				and previous_score.question_count = current_score.question_count
				and previous_score.completed_at < current_score.started_at
			order by previous_score.completed_at desc limit 1
		) previous_score on true
		where current_score.id = new.id
			and current_score.score - previous_score.score >= 0.10
	) into improved;

	if improved then
		perform private.award_student_xp(new.student_id,'session:' || new.id || ':improvement','Improved comparable assessment score',25,true);
		perform private.unlock_student_achievement(new.student_id,'big-improvement');
	end if;

	return new;
end;
$$;

revoke all on function private.calculate_student_readiness(uuid) from public, anon, authenticated;
revoke all on function private.award_comparable_improvement_after_completion() from public, anon, authenticated;

drop trigger if exists award_comparable_improvement_after_completion on public.practice_sessions;
create trigger award_comparable_improvement_after_completion
after update of status on public.practice_sessions
for each row
when (old.status is distinct from new.status and new.status = 'completed')
execute function private.award_comparable_improvement_after_completion();
