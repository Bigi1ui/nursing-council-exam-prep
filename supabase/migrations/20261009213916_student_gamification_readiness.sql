create table private.student_xp_transactions (
	student_id uuid not null references public.profiles(id) on delete cascade,
	activity_key text not null,
	reason text not null,
	xp_amount integer not null check (xp_amount >= 0),
	daily_capped boolean not null default false,
	created_at timestamptz not null default pg_catalog.now(),
	primary key (student_id, activity_key)
);

create index student_xp_transactions_student_created_idx
	on private.student_xp_transactions (student_id, created_at desc);

create table private.achievement_definitions (
	achievement_key text primary key,
	name text not null,
	description text not null,
	icon_path text not null,
	xp_reward integer not null default 0 check (xp_reward >= 0),
	sort_order smallint not null unique
);

create table private.student_achievements (
	student_id uuid not null references public.profiles(id) on delete cascade,
	achievement_key text not null references private.achievement_definitions(achievement_key) on delete restrict,
	unlocked_at timestamptz not null default pg_catalog.now(),
	primary key (student_id, achievement_key)
);

create table private.readiness_history (
	student_id uuid not null references public.profiles(id) on delete cascade,
	readiness_date date not null,
	readiness_score smallint not null check (readiness_score between 0 and 100),
	components jsonb not null,
	created_at timestamptz not null default pg_catalog.now(),
	primary key (student_id, readiness_date)
);

alter table private.student_xp_transactions enable row level security;
alter table private.achievement_definitions enable row level security;
alter table private.student_achievements enable row level security;
alter table private.readiness_history enable row level security;

revoke all on private.student_xp_transactions, private.achievement_definitions,
	private.student_achievements, private.readiness_history
from public, anon, authenticated;

insert into private.achievement_definitions
	(achievement_key, name, description, icon_path, xp_reward, sort_order)
values
	('first-steps', 'First Steps', 'Complete your first practice session.', '/achievements/first-steps.svg', 20, 1),
	('century-club', 'Century Club', 'Answer 100 questions across completed practice sessions.', '/achievements/century-club.svg', 30, 2),
	('consistency-champion', 'Consistency Champion', 'Study on seven consecutive calendar days.', '/achievements/consistency-champion.svg', 50, 3),
	('big-improvement', 'Big Improvement', 'Improve by at least 10 percentage points on a comparable assessment.', '/achievements/big-improvement.svg', 50, 4),
	('mock-exam-veteran', 'Mock Exam Veteran', 'Complete five full mock examinations.', '/achievements/mock-exam-veteran.svg', 75, 5),
	('course-specialist', 'Course Specialist', 'Reach 85% accuracy across at least 50 practice questions in one course.', '/achievements/course-specialist.svg', 40, 6),
	('all-round-learner', 'All-Round Learner', 'Answer at least 10 practice questions in every active course.', '/achievements/all-round-learner.svg', 40, 7),
	('accuracy-expert', 'Accuracy Expert', 'Score at least 90% on a practice session of 50 or more questions.', '/achievements/accuracy-expert.svg', 30, 8),
	('exam-finisher', 'Exam Finisher', 'Complete a full mock examination within its time limit.', '/achievements/exam-finisher.svg', 30, 9),
	('comeback-learner', 'Comeback Learner', 'Return to studying after at least seven inactive days.', '/achievements/comeback-learner.svg', 25, 10),
	('mistake-master', 'Mistake Master', 'Correctly answer 25 questions previously answered incorrectly.', '/achievements/mistake-master.svg', 40, 11)
on conflict (achievement_key) do update set
	name = excluded.name,
	description = excluded.description,
	icon_path = excluded.icon_path,
	xp_reward = excluded.xp_reward,
	sort_order = excluded.sort_order;

create or replace function private.award_student_xp(
	p_student_id uuid,
	p_activity_key text,
	p_reason text,
	p_amount integer,
	p_daily_capped boolean default false,
	p_daily_limit integer default 250
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
	awarded integer;
	daily_total integer := 0;
	eligible_amount integer;
begin
	if p_amount < 0 or p_daily_limit < 0 then
		raise exception 'XP amounts and limits must not be negative.' using errcode = '22023';
	end if;

	if p_daily_capped then
		select coalesce(sum(transaction.xp_amount), 0)::integer
		into daily_total
		from private.student_xp_transactions transaction
		where transaction.student_id = p_student_id
			and transaction.daily_capped
			and transaction.created_at >= pg_catalog.date_trunc('day', pg_catalog.now() at time zone 'UTC') at time zone 'UTC';
		eligible_amount := least(p_amount, greatest(0, p_daily_limit - daily_total));
	else
		eligible_amount := p_amount;
	end if;

	insert into private.student_xp_transactions
		(student_id, activity_key, reason, xp_amount, daily_capped)
	values
		(p_student_id, p_activity_key, p_reason, eligible_amount, p_daily_capped)
	on conflict (student_id, activity_key) do nothing
	returning xp_amount into awarded;

	return coalesce(awarded, 0);
end;
$$;

create or replace function private.unlock_student_achievement(
	p_student_id uuid,
	p_achievement_key text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
	reward integer;
	inserted_student uuid;
begin
	select definition.xp_reward into reward
	from private.achievement_definitions definition
	where definition.achievement_key = p_achievement_key;
	if not found then return false; end if;

	insert into private.student_achievements (student_id, achievement_key)
	values (p_student_id, p_achievement_key)
	on conflict (student_id, achievement_key) do nothing
	returning student_id into inserted_student;

	if inserted_student is null then return false; end if;

	perform private.award_student_xp(
		p_student_id,
		'achievement:' || p_achievement_key,
		'Achievement: ' || p_achievement_key,
		reward
	);
	return true;
end;
$$;

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
	select count(*)::integer into active_courses
	from public.courses course where course.is_active;

	with practice_answers as (
		select answer.is_correct, answer.answered_at, question.course_id,
			row_number() over (order by answer.answered_at desc, answer.question_id) as recent_rank
		from public.student_answers answer
		join public.practice_sessions session on session.id = answer.practice_session_id
		join public.questions question on question.id = answer.question_id
		join public.courses course on course.id = question.course_id and course.is_active
		where answer.student_id = p_student_id
			and session.status = 'completed'
			and session.question_set <> 'mock_exam'
			and answer.selected_option is not null
			and answer.is_correct is not null
	)
	select count(*)::integer,
		count(distinct course_id)::integer,
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
		where answer.student_id = p_student_id
			and session.status = 'completed'
			and session.question_set <> 'mock_exam'
			and answer.selected_option is not null
		group by question.course_id
		having count(*) >= 10
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
		where answer.student_id = p_student_id
			and session.status = 'completed'
			and session.question_set <> 'mock_exam'
			and answer.selected_option is not null
			and answer.is_correct is not null
		group by course.id, course.name
		having count(*) >= 10 and avg(case when answer.is_correct then 100.0 else 0.0 end) < 60
	) course_stats;

	with mocks as (
		select session.id,
			coalesce(count(*) filter (where answer.is_correct)::numeric / nullif(session.question_count, 0) * 100, 0) as score,
			session.completed_at,
			row_number() over (order by session.completed_at desc, session.id) as recent_rank
		from public.practice_sessions session
		left join public.student_answers answer on answer.practice_session_id = session.id
		where session.student_id = p_student_id
			and session.question_set = 'mock_exam'
			and session.status = 'completed'
			and session.question_count >= 250
		group by session.id
	)
	select count(*)::integer, avg(score), avg(score) filter (where recent_rank <= 5)
	into mock_count, mock_all, mock_recent
	from mocks;

	select count(distinct (answer.answered_at at time zone 'UTC')::date)::numeric / 14 * 100
	into consistency
	from public.student_answers answer
	join public.practice_sessions session on session.id = answer.practice_session_id
	where answer.student_id = p_student_id
		and session.status = 'completed'
		and answer.selected_option is not null
		and answer.answered_at >= pg_catalog.now() - interval '14 days';

	with assessments as (
		select session.question_set, session.question_count, session.completed_at,
			coalesce(count(*) filter (where answer.is_correct)::numeric / nullif(session.question_count, 0), 0) as score
		from public.practice_sessions session
		left join public.student_answers answer on answer.practice_session_id = session.id
		where session.student_id = p_student_id and session.status = 'completed'
		group by session.id
	), comparisons as (
		select score - lag(score) over (
			partition by question_set, question_count order by completed_at
		) as change
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
			0.30 * accuracy_score
			+ 0.30 * mock_score
			+ 0.15 * coverage_score
			+ 0.10 * least(100, coalesce(consistency, 0))
			+ 0.15 * improvement
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

create or replace function private.rebuild_student_streak(p_student_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	current_days integer;
	longest_days integer;
	last_day date;
begin
	with activity_days as (
		select distinct (answer.answered_at at time zone 'UTC')::date as study_day
		from public.student_answers answer
		join public.practice_sessions session on session.id = answer.practice_session_id
		where answer.student_id = p_student_id
			and answer.selected_option is not null
			and session.status = 'completed'
	), numbered_days as (
		select study_day, study_day - row_number() over (order by study_day)::integer as streak_group
		from activity_days
	), streak_runs as (
		select streak_group, min(study_day) as start_date, max(study_day) as end_date, count(*)::integer as day_count
		from numbered_days group by streak_group
	), latest_run as (
		select * from streak_runs order by end_date desc limit 1
	)
	select case when latest_run.end_date >= (pg_catalog.now() at time zone 'UTC')::date - 1 then latest_run.day_count else 0 end,
		(select coalesce(max(day_count), 0)::integer from streak_runs),
		latest_run.end_date
	into current_days, longest_days, last_day
	from latest_run;

	if last_day is null then
		delete from private.student_streaks where student_id = p_student_id;
		return;
	end if;

	insert into private.student_streaks (student_id, current_streak, longest_streak, last_study_date)
	values (p_student_id, current_days, greatest(current_days, longest_days), last_day)
	on conflict (student_id) do update set
		current_streak = excluded.current_streak,
		longest_streak = greatest(private.student_streaks.longest_streak, excluded.longest_streak),
		last_study_date = excluded.last_study_date,
		updated_at = pg_catalog.now();
end;
$$;

create or replace function private.refresh_student_streak_after_completion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	if old.status <> 'completed' and new.status = 'completed' then
		perform private.rebuild_student_streak(new.student_id);
	end if;
	return new;
end;
$$;

drop trigger if exists record_student_answer_streak on public.student_answers;
drop trigger if exists refresh_student_streak_after_completion on public.practice_sessions;
create trigger refresh_student_streak_after_completion
after update of status on public.practice_sessions
for each row
when (old.status is distinct from new.status and new.status = 'completed')
execute function private.refresh_student_streak_after_completion();

revoke all on function private.award_student_xp(uuid, text, text, integer, boolean, integer) from public, anon, authenticated;
revoke all on function private.unlock_student_achievement(uuid, text) from public, anon, authenticated;
revoke all on function private.calculate_student_readiness(uuid) from public, anon, authenticated;
revoke all on function private.rebuild_student_streak(uuid) from public, anon, authenticated;
revoke all on function private.refresh_student_streak_after_completion() from public, anon, authenticated;

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
	score numeric := 0;
	practice_sessions integer := 0;
	practice_questions integer := 0;
	full_mocks integer := 0;
	current_streak integer := 0;
	course_id uuid;
	active_courses integer := 0;
	covered_courses integer := 0;
	comeback boolean := false;
	big_improvement boolean := false;
	course_specialist boolean := false;
	all_round boolean := false;
	accuracy_expert boolean := false;
	exam_finisher boolean := false;
	mistakes_corrected integer := 0;
	readiness jsonb;
begin
	select * into session_row from public.practice_sessions
	where id = p_session_id and student_id = p_student_id and status = 'completed';
	if not found then return; end if;

	select count(*) filter (where answer.is_correct)::integer
	into session_correct
	from public.student_answers answer
	where answer.practice_session_id = p_session_id;
	score := session_correct::numeric / greatest(session_row.question_count, 1) * 100;

	if session_row.question_set = 'mock_exam' then
		if session_row.question_count >= 250 then base_xp := 150; end if;
	else
		base_xp := case
			when session_row.question_count >= 100 then 70
			when session_row.question_count >= 50 then 40
			when session_row.question_count >= 20 then 20
			when session_row.question_count >= 10 then 10
			else 0
		end;
	end if;

	if base_xp > 0 then
		perform private.award_student_xp(p_student_id, 'session:' || p_session_id || ':completion', 'Completed study session', base_xp, true);
	end if;

	if session_row.question_set = 'mock_exam' and session_row.question_count >= 250 and score >= 90 then
		perform private.award_student_xp(p_student_id, 'session:' || p_session_id || ':high-score', '90% or higher mock exam', 30, true);
	elsif session_row.question_set <> 'mock_exam' and score >= 80 then
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

	if session_row.question_set <> 'mock_exam' then
		with comparable as (
			select session.id, session.question_set, session.question_count, session.started_at, session.completed_at,
				coalesce(count(*) filter (where answer.is_correct)::numeric / nullif(session.question_count, 0), 0) as result
			from public.practice_sessions session
			left join public.student_answers answer on answer.practice_session_id = session.id
			where session.student_id = p_student_id and session.status = 'completed'
			group by session.id
		)
		select exists (
			select 1 from comparable current_session
			join comparable previous on previous.question_set = current_session.question_set
				and previous.question_count = current_session.question_count
				and previous.completed_at < current_session.started_at
			where current_session.id = p_session_id
				and current_session.result - previous.result >= 0.10
			order by previous.completed_at desc limit 1
		) into big_improvement;

		if big_improvement then
			perform private.award_student_xp(p_student_id, 'session:' || p_session_id || ':improvement', 'Improved comparable practice score', 25, true);
		end if;
	end if;

	select count(*)::integer into practice_sessions
	from public.practice_sessions session
	where session.student_id = p_student_id and session.status = 'completed' and session.question_set <> 'mock_exam';

	select count(*)::integer into practice_questions
	from public.student_answers answer
	join public.practice_sessions session on session.id = answer.practice_session_id
	where answer.student_id = p_student_id and session.status = 'completed'
		and session.question_set <> 'mock_exam' and answer.selected_option is not null;

	select count(*)::integer into full_mocks
	from public.practice_sessions session
	where session.student_id = p_student_id and session.status = 'completed'
		and session.question_set = 'mock_exam' and session.question_count >= 250;

	select coalesce(streak.current_streak, 0) into current_streak
	from private.student_streaks streak where streak.student_id = p_student_id;
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
		having count(*) filter (where answer.is_correct)::numeric / session.question_count >= 0.90
	) into accuracy_expert;

	exam_finisher := session_row.question_set = 'mock_exam'
		and session_row.question_count >= 250
		and session_row.time_limit_seconds is not null
		and session_row.completed_at <= session_row.started_at + session_row.time_limit_seconds * interval '1 second';

	select exists (
		select 1 from public.practice_sessions previous
		where previous.student_id = p_student_id and previous.id <> p_session_id
			and previous.status = 'completed'
			and previous.completed_at <= session_row.started_at - interval '7 days'
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
	if big_improvement then perform private.unlock_student_achievement(p_student_id, 'big-improvement'); end if;
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
		where profile.id = current_user_id and profile.role = 'student'::public.user_role
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
		set is_correct = case when answer.selected_option is null then null else answer.selected_option = question.correct_option end
		from public.questions question
		where answer.practice_session_id = p_practice_session_id and question.id = answer.question_id;

		update public.practice_sessions
		set status = 'completed', completed_at = pg_catalog.clock_timestamp()
		where id = p_practice_session_id;
		perform private.evaluate_student_gamification(current_user_id, p_practice_session_id);
	elsif session_state <> 'completed' then
		raise exception 'Practice session is not active.' using errcode = '42501';
	end if;

	return true;
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
		where profile.id = current_user_id and profile.role = 'student'::public.user_role
	) then
		raise exception 'Student authentication required.' using errcode = '42501';
	end if;

	select session.student_id, session.status, session.question_count
	into session_student_id, session_state, session_total
	from public.practice_sessions session
	where session.id = p_practice_session_id and session.question_set = 'mock_exam'
	for update;

	if not found or session_student_id <> current_user_id then
		raise exception 'Mock exam not found.' using errcode = '42501';
	end if;

	if session_state = 'in_progress' then
		update public.student_answers answer
		set is_correct = case when answer.selected_option is null then null else answer.selected_option = question.correct_option end
		from public.questions question
		where answer.practice_session_id = p_practice_session_id and question.id = answer.question_id;

		update public.practice_sessions
		set status = 'completed', completed_at = pg_catalog.clock_timestamp()
		where id = p_practice_session_id
		returning completed_at into completion_time;

		perform private.evaluate_student_gamification(current_user_id, p_practice_session_id);
	elsif session_state = 'completed' then
		select session.completed_at into completion_time
		from public.practice_sessions session where session.id = p_practice_session_id;
	else
		raise exception 'Mock exam is not active.' using errcode = '42501';
	end if;

	return query
	select
		count(*) filter (where answer.is_correct is true)::integer,
		count(*) filter (where answer.selected_option is not null)::integer,
		session_total,
		completion_time
	from public.student_answers answer
	where answer.practice_session_id = p_practice_session_id;
end;
$$;

create or replace function public.claim_attempt_review_xp(p_practice_session_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
	current_user_id uuid := auth.uid();
	eligible boolean;
begin
	if current_user_id is null or not exists (
		select 1 from public.profiles profile
		where profile.id = current_user_id and profile.role = 'student'::public.user_role
	) then
		raise exception 'Student authentication required.' using errcode = '42501';
	end if;

	select exists (
		select 1
		from public.practice_sessions session
		cross join unnest(session.question_ids) as item(question_id)
		left join public.student_answers answer
			on answer.practice_session_id = session.id and answer.question_id = item.question_id
		where session.id = p_practice_session_id
			and session.student_id = current_user_id
			and session.status = 'completed'
			and (answer.selected_option is null or answer.is_correct is false)
	) into eligible;

	if not eligible then return 0; end if;
	return private.award_student_xp(
		current_user_id,
		'review:' || p_practice_session_id,
		'Reviewed incorrect answers',
		5,
		true
	);
end;
$$;

create or replace function public.get_my_gamification_summary()
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
	current_user_id uuid := auth.uid();
	total_xp integer := 0;
	level_number smallint;
	level_title text;
	level_floor integer;
	next_level_xp integer;
	level_progress integer;
	readiness jsonb;
	achievements jsonb;
	history jsonb;
begin
	if current_user_id is null or not exists (
		select 1 from public.profiles profile
		where profile.id = current_user_id and profile.role = 'student'::public.user_role
	) then
		raise exception 'Student authentication required.' using errcode = '42501';
	end if;

	select coalesce(sum(transaction.xp_amount), 0)::integer into total_xp
	from private.student_xp_transactions transaction
	where transaction.student_id = current_user_id;

	level_number := case
		when total_xp < 100 then 1 when total_xp < 300 then 2 when total_xp < 600 then 3
		when total_xp < 1000 then 4 when total_xp < 1500 then 5 when total_xp < 2500 then 6
		when total_xp < 4000 then 7 else 8 end;
	level_title := case level_number
		when 1 then 'Beginner' when 2 then 'Learner' when 3 then 'Dedicated Student'
		when 4 then 'Rising Star' when 5 then 'Skilled Learner' when 6 then 'Exam Challenger'
		when 7 then 'Nursing Scholar' else 'Master Learner' end;
	level_floor := case level_number
		when 1 then 0 when 2 then 100 when 3 then 300 when 4 then 600
		when 5 then 1000 when 6 then 1500 when 7 then 2500 else 4000 end;
	next_level_xp := case level_number
		when 1 then 100 when 2 then 300 when 3 then 600 when 4 then 1000
		when 5 then 1500 when 6 then 2500 when 7 then 4000 else null end;
	level_progress := case when next_level_xp is null then 100 else
		round((total_xp - level_floor)::numeric / (next_level_xp - level_floor) * 100)::integer end;
	readiness := private.calculate_student_readiness(current_user_id);

	select coalesce(jsonb_agg(jsonb_build_object(
		'key', definition.achievement_key,
		'name', definition.name,
		'description', definition.description,
		'iconPath', definition.icon_path,
		'xpReward', definition.xp_reward,
		'unlockedAt', earned.unlocked_at
	) order by definition.sort_order), '[]'::jsonb)
	into achievements
	from private.achievement_definitions definition
	left join private.student_achievements earned
		on earned.achievement_key = definition.achievement_key and earned.student_id = current_user_id;

	select coalesce(jsonb_agg(jsonb_build_object('date', item.readiness_date, 'score', item.readiness_score) order by item.readiness_date), '[]'::jsonb)
	into history
	from (
		select readiness_date, readiness_score
		from private.readiness_history
		where student_id = current_user_id
		order by readiness_date desc limit 30
	) item;

	return jsonb_build_object(
		'totalXp', total_xp,
		'level', level_number,
		'levelTitle', level_title,
		'levelFloorXp', level_floor,
		'nextLevelXp', next_level_xp,
		'levelProgress', least(100, greatest(0, level_progress)),
		'readiness', readiness,
		'readinessHistory', history,
		'achievements', achievements
	);
end;
$$;

revoke all on function public.finish_practice_session(uuid) from public, anon;
grant execute on function public.finish_practice_session(uuid) to authenticated;
revoke all on function public.finish_mock_exam(uuid) from public, anon;
grant execute on function public.finish_mock_exam(uuid) to authenticated;
revoke all on function public.claim_attempt_review_xp(uuid) from public, anon;
grant execute on function public.claim_attempt_review_xp(uuid) to authenticated;
revoke all on function public.get_my_gamification_summary() from public, anon;
grant execute on function public.get_my_gamification_summary() to authenticated;

do $$
declare
	student record;
begin
	for student in select profile.id from public.profiles profile where profile.role = 'student'::public.user_role loop
		perform private.rebuild_student_streak(student.id);
	end loop;
end;
$$;
