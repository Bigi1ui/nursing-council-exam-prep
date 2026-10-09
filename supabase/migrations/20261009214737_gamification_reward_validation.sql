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
		select 1 from public.practice_sessions session
		join public.student_answers answer on answer.practice_session_id = session.id
		where session.id = p_practice_session_id
			and session.student_id = current_user_id
			and session.status = 'completed'
			and answer.selected_option is not null
			and answer.is_correct is false
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

revoke all on function public.claim_attempt_review_xp(uuid) from public, anon;
grant execute on function public.claim_attempt_review_xp(uuid) to authenticated;

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
		left join public.student_answers answer on answer.practice_session_id = session.id
		where session.student_id = new.student_id and session.status = 'completed'
		group by session.id
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
			order by previous_score.completed_at desc
			limit 1
		) previous_score on true
		where current_score.id = new.id
			and current_score.score - previous_score.score >= 0.10
	) into improved;

	if improved then
		perform private.award_student_xp(
			new.student_id,
			'session:' || new.id || ':improvement',
			'Improved comparable assessment score',
			25,
			true
		);
		perform private.unlock_student_achievement(new.student_id, 'big-improvement');
	end if;

	return new;
end;
$$;

revoke all on function private.award_comparable_improvement_after_completion() from public, anon, authenticated;

drop trigger if exists award_comparable_improvement_after_completion on public.practice_sessions;
create trigger award_comparable_improvement_after_completion
after update of status on public.practice_sessions
for each row
when (old.status is distinct from new.status and new.status = 'completed')
execute function private.award_comparable_improvement_after_completion();
