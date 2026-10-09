create or replace function private.unlock_mistake_master_after_completion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
	corrected_questions integer;
begin
	if old.status = 'completed' or new.status <> 'completed' then return new; end if;

	select count(distinct current_answer.question_id)::integer
	into corrected_questions
	from public.student_answers current_answer
	join public.practice_sessions current_session
		on current_session.id = current_answer.practice_session_id
	where current_session.student_id = new.student_id
		and current_session.status = 'completed'
		and current_answer.is_correct is true
		and exists (
			select 1
			from public.student_answers previous_answer
			join public.practice_sessions previous_session
				on previous_session.id = previous_answer.practice_session_id
			where previous_answer.student_id = new.student_id
				and previous_answer.question_id = current_answer.question_id
				and previous_answer.is_correct is false
				and previous_session.status = 'completed'
				and previous_session.completed_at < current_session.started_at
		);

	if corrected_questions >= 25 then
		perform private.unlock_student_achievement(new.student_id, 'mistake-master');
	end if;

	return new;
end;
$$;

revoke all on function private.unlock_mistake_master_after_completion() from public, anon, authenticated;

drop trigger if exists unlock_mistake_master_after_completion on public.practice_sessions;
create trigger unlock_mistake_master_after_completion
after update of status on public.practice_sessions
for each row
when (old.status is distinct from new.status and new.status = 'completed')
execute function private.unlock_mistake_master_after_completion();
