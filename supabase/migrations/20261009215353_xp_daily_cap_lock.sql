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

	perform 1
	from public.profiles profile
	where profile.id = p_student_id
		and profile.role = 'student'::public.user_role
	for update;
	if not found then
		raise exception 'Student account required.' using errcode = '42501';
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

revoke all on function private.award_student_xp(uuid, text, text, integer, boolean, integer) from public, anon, authenticated;
