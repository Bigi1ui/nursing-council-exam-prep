create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.student_streaks (
	student_id uuid primary key references public.profiles(id) on delete cascade,
	current_streak integer not null default 0 check (current_streak >= 0),
	longest_streak integer not null default 0 check (longest_streak >= current_streak),
	last_study_date date not null,
	updated_at timestamptz not null default pg_catalog.now()
);

alter table private.student_streaks enable row level security;

create or replace function private.record_student_answer_streak()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
	study_day date := (new.answered_at at time zone 'UTC')::date;
begin
	if new.selected_option is null or not exists (
		select 1 from public.profiles profile
		where profile.id = new.student_id
			and profile.role = 'student'::public.user_role
	) then
		return new;
	end if;

	insert into private.student_streaks as streak (
		student_id, current_streak, longest_streak, last_study_date
	) values (
		new.student_id, 1, 1, study_day
	)
	on conflict (student_id) do update
	set
		current_streak = case
			when excluded.last_study_date <= streak.last_study_date then streak.current_streak
			when excluded.last_study_date = streak.last_study_date + 1 then streak.current_streak + 1
			else 1
		end,
		longest_streak = greatest(
			streak.longest_streak,
			case
				when excluded.last_study_date <= streak.last_study_date then streak.current_streak
				when excluded.last_study_date = streak.last_study_date + 1 then streak.current_streak + 1
				else 1
			end
		),
		last_study_date = greatest(streak.last_study_date, excluded.last_study_date),
		updated_at = pg_catalog.now();

	return new;
end;
$$;

revoke all on function private.record_student_answer_streak() from public, anon, authenticated;

drop trigger if exists record_student_answer_streak on public.student_answers;
create trigger record_student_answer_streak
after insert or update on public.student_answers
for each row
when (new.selected_option is not null)
execute function private.record_student_answer_streak();

create or replace function public.get_my_study_streak()
returns table (
	current_streak integer,
	longest_streak integer,
	last_study_date date
)
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
	current_user_id uuid := auth.uid();
	utc_today date := (pg_catalog.now() at time zone 'UTC')::date;
begin
	if current_user_id is null or not exists (
		select 1 from public.profiles profile
		where profile.id = current_user_id
			and profile.role = 'student'::public.user_role
	) then
		raise exception 'Student authentication required.' using errcode = '42501';
	end if;

	return query
	select
		case
			when streak.last_study_date >= utc_today - 1 then streak.current_streak
			else 0
		end,
		coalesce(streak.longest_streak, 0),
		streak.last_study_date
	from (select 1) as seed
	left join private.student_streaks streak on streak.student_id = current_user_id;
end;
$$;

revoke all on function public.get_my_study_streak() from public, anon;
grant execute on function public.get_my_study_streak() to authenticated;

with activity_days as (
	select answer.student_id, (answer.answered_at at time zone 'UTC')::date as study_day
	from public.student_answers answer
	where answer.selected_option is not null
	group by answer.student_id, (answer.answered_at at time zone 'UTC')::date
), numbered_days as (
	select
		activity.student_id,
		activity.study_day,
		activity.study_day - row_number() over (
			partition by activity.student_id order by activity.study_day
		)::integer as streak_group
	from activity_days activity
), streak_runs as (
	select student_id, streak_group, min(study_day) as start_date, max(study_day) as end_date, count(*)::integer as day_count
	from numbered_days
	group by student_id, streak_group
), latest_runs as (
	select distinct on (student_id) student_id, end_date, day_count
	from streak_runs
	order by student_id, end_date desc
), summaries as (
	select
		run.student_id,
		case when latest.end_date >= ((pg_catalog.now() at time zone 'UTC')::date - 1) then latest.day_count else 0 end as current_streak,
		max(run.day_count)::integer as longest_streak,
		latest.end_date as last_study_date
	from streak_runs run
	join latest_runs latest on latest.student_id = run.student_id
	group by run.student_id, latest.end_date, latest.day_count
)
insert into private.student_streaks (student_id, current_streak, longest_streak, last_study_date)
select student_id, current_streak, longest_streak, last_study_date
from summaries
on conflict (student_id) do nothing;
