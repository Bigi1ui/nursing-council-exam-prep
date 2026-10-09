create or replace function private.evaluate_student_gamification(
	p_student_id uuid,
	p_session_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	session_row record;
	base_xp integer := 0;
	session_correct integer := 0;
	session_answered integer := 0;
	score numeric := 0;
	practice_sessions integer := 0;
	practice_questions integer := 0;
	full_mocks integer := 0;
	current_streak integer := 0;
	course_id uuid;
	active_courses integer := 0;
	covered_courses integer := 0;
	course_specialist boolean := false;
	all_round boolean := false;
	accuracy_expert boolean := false;
	exam_finisher boolean := false;
	comeback boolean := false;
	mistakes_corrected integer := 0;
	readiness jsonb;
begin
	select * into session_row
	from public.practice_sessions session
	where session.id = p_session_id
		and session.student_id = p_student_id
		and session.status = 'completed';
	if not found then return; end if;

	select count(*) filter (where answer.is_correct)::integer,
		count(*) filter (where answer.selected_option is not null)::integer
	into session_correct, session_answered
	from public.student_answers answer
	where answer.practice_session_id = p_session_id;
	score := session_correct::numeric / greatest(session_row.question_count, 1) * 100;

	if session_row.question_set = 'mock_exam' then
		if session_row.question_count >= 250 and session_answered = session_row.question_count then base_xp := 150; end if;
	elsif session_row.question_set <> 'mock_exam' then
		base_xp := case
			when session_answered >= 100 then 70
			when session_answered >= 50 then 40
			when session_answered >= 20 then 20
			when session_answered >= 10 then 10
			else 0
		end;
	end if;

	if base_xp > 0 then
		perform private.award_student_xp(p_student_id, 'session:' || p_session_id || ':completion', 'Completed study session', base_xp, true);
	end if;

	if session_answered = session_row.question_count
		and session_row.question_set = 'mock_exam'
		and session_row.question_count >= 250 and score >= 90 then
		perform private.award_student_xp(p_student_id, 'session:' || p_session_id || ':high-score', '90% or higher mock exam', 30, true);
	elsif session_answered = session_row.question_count
		and session_row.question_set <> 'mock_exam' and score >= 80 then
		perform private.award_student_xp(p_student_id, 'session:' || p_session_id || ':high-score', '80% or higher practice', 10, true);
	end if;

	if session_row.question_set <> 'mock_exam' and session_row.course_id is not null then
		select count(*)::integer into practice_questions
		from public.student_answers answer
		join public.practice_sessions practice on practice.id = answer.practice_session_id
		join public.questions question on question.id = answer.question_id
		where answer.student_id = p_student_id
			and practice.status = 'completed'
			and practice.question_set <> 'mock_exam'
			and answer.selected_option is not null
			and question.course_id = session_row.course_id;
		if practice_questions >= 50 then
			perform private.award_student_xp(p_student_id, 'course:' || session_row.course_id || ':first-completion', 'First course completion', 25);
		end if;
	end if;

	select count(*)::integer into practice_sessions
	from (
		select session.id
		from public.practice_sessions session
		join public.student_answers answer on answer.practice_session_id = session.id
		where session.student_id = p_student_id
			and session.status = 'completed'
			and session.question_set <> 'mock_exam'
		group by session.id, session.question_count
		having count(*) filter (where answer.selected_option is not null) >= 10
	) qualifying_practice;

	select count(*)::integer into practice_questions
	from public.student_answers answer
	join public.practice_sessions session on session.id = answer.practice_session_id
	where answer.student_id = p_student_id and session.status = 'completed'
		and session.question_set <> 'mock_exam' and answer.selected_option is not null;

	select count(*)::integer into full_mocks
	from (
		select session.id
		from public.practice_sessions session
		join public.student_answers answer on answer.practice_session_id = session.id
		where session.student_id = p_student_id and session.status = 'completed'
			and session.question_set = 'mock_exam' and session.question_count >= 250
		group by session.id, session.question_count
		having count(*) filter (where answer.selected_option is not null) = session.question_count
	) qualifying_mocks;

	select coalesce(streak.current_streak, 0) into current_streak
	from (select 1) as seed
	left join private.student_streaks streak on streak.student_id = p_student_id;
	if current_streak >= 7 and current_streak % 7 = 0 then
		perform private.award_student_xp(p_student_id, 'streak:' || current_streak, 'Seven-day study streak milestone', 50);
	end if;

	for course_id in
		select question.course_id
		from public.student_answers answer
		join public.practice_sessions session on session.id = answer.practice_session_id
		join public.questions question on question.id = answer.question_id
		where answer.student_id = p_student_id and session.status = 'completed'
			and session.question_set <> 'mock_exam' and answer.selected_option is not null
		group by question.course_id having count(*) >= 50
	loop
		perform private.award_student_xp(p_student_id, 'course:' || course_id || ':first-completion', 'First course completion', 25);
	end loop;

	select count(*)::integer into active_courses from public.courses course where course.is_active;
	select count(*)::integer into covered_courses from (
		select question.course_id
		from public.student_answers answer
		join public.practice_sessions session on session.id = answer.practice_session_id
		join public.questions question on question.id = answer.question_id
		join public.courses course on course.id = question.course_id and course.is_active
		where answer.student_id = p_student_id and session.status = 'completed'
			and session.question_set <> 'mock_exam' and answer.selected_option is not null
		group by question.course_id having count(*) >= 10
	) coverage;

	select exists (
		select 1 from (
			select question.course_id, count(*) as answered,
				avg(case when answer.is_correct then 100.0 else 0 end) as accuracy
			from public.student_answers answer
			join public.practice_sessions session on session.id = answer.practice_session_id
			join public.questions question on question.id = answer.question_id
			where answer.student_id = p_student_id and session.status = 'completed'
				and session.question_set <> 'mock_exam' and answer.selected_option is not null
			group by question.course_id
		) course_result where answered >= 50 and accuracy >= 85
	) into course_specialist;

	all_round := active_courses > 0 and covered_courses = active_courses;

	select exists (
		select 1 from public.practice_sessions session
		join public.student_answers answer on answer.practice_session_id = session.id
		where session.student_id = p_student_id and session.id = p_session_id
			and session.status = 'completed' and session.question_set <> 'mock_exam'
			and session.question_count >= 50
		group by session.id, session.question_count
		having count(*) filter (where answer.selected_option is not null) = session.question_count
			and count(*) filter (where answer.is_correct)::numeric / session.question_count >= 0.90
	) into accuracy_expert;

	exam_finisher := session_row.question_set = 'mock_exam'
		and session_row.question_count >= 250
		and session_answered = session_row.question_count
		and session_row.time_limit_seconds is not null
		and session_row.completed_at <= session_row.started_at + session_row.time_limit_seconds * interval '1 second';

	select exists (
		select 1 from public.practice_sessions previous
		join public.student_answers previous_answer on previous_answer.practice_session_id = previous.id
		where previous.student_id = p_student_id and previous.id <> p_session_id
			and previous.status = 'completed'
			and previous.completed_at <= session_row.started_at - interval '7 days'
		group by previous.id, previous.question_count
		having count(*) filter (where previous_answer.selected_option is not null) >= 10
	) into comeback;

	select count(distinct current_answer.question_id)::integer into mistakes_corrected
	from public.student_answers current_answer
	join public.practice_sessions current_session on current_session.id = current_answer.practice_session_id
	where current_session.id = p_session_id and current_session.status = 'completed'
		and current_answer.is_correct is true
		and exists (
			select 1 from public.student_answers previous_answer
			join public.practice_sessions previous_session on previous_session.id = previous_answer.practice_session_id
			where previous_answer.student_id = p_student_id
				and previous_answer.question_id = current_answer.question_id
				and previous_answer.is_correct is false
				and previous_session.status = 'completed'
				and previous_session.completed_at < current_session.started_at
		);

	if practice_sessions >= 1 then perform private.unlock_student_achievement(p_student_id, 'first-steps'); end if;
	if practice_questions >= 100 then perform private.unlock_student_achievement(p_student_id, 'century-club'); end if;
	if current_streak >= 7 then perform private.unlock_student_achievement(p_student_id, 'consistency-champion'); end if;
	if full_mocks >= 5 then perform private.unlock_student_achievement(p_student_id, 'mock-exam-veteran'); end if;
	if course_specialist then perform private.unlock_student_achievement(p_student_id, 'course-specialist'); end if;
	if all_round then perform private.unlock_student_achievement(p_student_id, 'all-round-learner'); end if;
	if accuracy_expert then perform private.unlock_student_achievement(p_student_id, 'accuracy-expert'); end if;
	if exam_finisher then perform private.unlock_student_achievement(p_student_id, 'exam-finisher'); end if;
	if comeback then perform private.unlock_student_achievement(p_student_id, 'comeback-learner'); end if;
	if mistakes_corrected >= 25 then perform private.unlock_student_achievement(p_student_id, 'mistake-master'); end if;

	readiness := private.calculate_student_readiness(p_student_id);
	if readiness ->> 'score' is not null then
		insert into private.readiness_history (student_id, readiness_date, readiness_score, components)
		values (
			p_student_id,
			(pg_catalog.now() at time zone 'UTC')::date,
			(readiness ->> 'score')::smallint,
			readiness -> 'components'
		)
		on conflict (student_id, readiness_date) do update set
			readiness_score = excluded.readiness_score,
			components = excluded.components,
			created_at = pg_catalog.now();
	end if;
end;
$$;

revoke all on function private.evaluate_student_gamification(uuid, uuid) from public, anon, authenticated;
