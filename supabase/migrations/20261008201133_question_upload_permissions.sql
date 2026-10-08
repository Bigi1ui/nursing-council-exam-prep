alter table public.questions enable row level security;

grant insert, update, delete on public.questions to authenticated;
grant select (
  id,
  source_id,
  course_id,
  source_question_number,
  prompt,
  options,
  question_type,
  review_status,
  created_at,
  updated_at
) on public.questions to authenticated;

drop policy if exists "Admins manage questions" on public.questions;
create policy "Admins manage questions"
on public.questions for all to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'::public.user_role
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'::public.user_role
  )
);