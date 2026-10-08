create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.question_sources (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique,
  title text not null,
  original_filename text not null,
  source_year smallint,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.question_sources(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete restrict,
  source_question_number integer not null,
  prompt text not null,
  options jsonb not null,
  correct_option smallint not null,
  explanation text,
  question_type text not null default 'official_past'
    check (question_type in ('official_past', 'ai_practice')),
  review_status text not null default 'pending_review'
    check (review_status in ('draft', 'pending_review', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id, source_question_number),
  check (
    jsonb_typeof(options) = 'array'
    and jsonb_array_length(options) >= 2
    and correct_option >= 0
    and correct_option < jsonb_array_length(options)
  )
);

create table if not exists public.practice_sessions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  course_id uuid references public.courses(id) on delete set null,
  question_set text not null check (question_set in ('all', 'random', 'weak', 'mistakes', 'bookmarks')),
  question_count smallint not null check (question_count > 0),
  question_ids uuid[] not null,
  status text not null default 'in_progress' check (status in ('in_progress', 'completed', 'abandoned')),
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.student_answers (
  practice_session_id uuid not null references public.practice_sessions(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete restrict,
  selected_option smallint check (selected_option >= 0),
  is_correct boolean,
  marked_for_review boolean not null default false,
  answered_at timestamptz not null default now(),
  primary key (practice_session_id, question_id)
);

create table if not exists public.question_bookmarks (
  student_id uuid not null references public.profiles(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (student_id, question_id)
);

alter table public.courses enable row level security;
alter table public.question_sources enable row level security;
alter table public.questions enable row level security;
alter table public.practice_sessions enable row level security;
alter table public.student_answers enable row level security;
alter table public.question_bookmarks enable row level security;

create index if not exists questions_course_status_idx
  on public.questions (course_id, review_status);
create index if not exists questions_source_idx
  on public.questions (source_id, source_question_number);
create index if not exists practice_sessions_student_started_idx
  on public.practice_sessions (student_id, started_at desc);
create index if not exists student_answers_student_idx
  on public.student_answers (student_id, answered_at desc);

drop policy if exists "Authenticated users read courses" on public.courses;
create policy "Authenticated users read courses"
on public.courses for select to authenticated using (true);

drop policy if exists "Admins manage courses" on public.courses;
create policy "Admins manage courses"
on public.courses for all to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'::public.user_role))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'::public.user_role));

drop policy if exists "Authenticated users read question sources" on public.question_sources;
create policy "Authenticated users read question sources"
on public.question_sources for select to authenticated using (true);

drop policy if exists "Admins manage question sources" on public.question_sources;
create policy "Admins manage question sources"
on public.question_sources for all to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'::public.user_role))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'::public.user_role));

drop policy if exists "Students read approved questions and admins read all" on public.questions;
create policy "Students read approved questions and admins read all"
on public.questions for select to authenticated
using (
  review_status = 'approved'
  or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'::public.user_role)
);

drop policy if exists "Admins manage questions" on public.questions;
create policy "Admins manage questions"
on public.questions for all to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'::public.user_role))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'::public.user_role));

drop policy if exists "Students manage own practice sessions" on public.practice_sessions;
create policy "Students manage own practice sessions"
on public.practice_sessions for all to authenticated
using (student_id = auth.uid())
with check (student_id = auth.uid());

drop policy if exists "Students read own answers" on public.student_answers;
create policy "Students read own answers"
on public.student_answers for select to authenticated
using (student_id = auth.uid());

drop policy if exists "Students insert answers in own sessions" on public.student_answers;
create policy "Students insert answers in own sessions"
on public.student_answers for insert to authenticated
with check (
  student_id = auth.uid()
  and exists (
    select 1 from public.practice_sessions s
    where s.id = practice_session_id
      and s.student_id = auth.uid()
      and question_id = any(s.question_ids)
  )
);

drop policy if exists "Students update answers in own sessions" on public.student_answers;
create policy "Students update answers in own sessions"
on public.student_answers for update to authenticated
using (student_id = auth.uid())
with check (
  student_id = auth.uid()
  and exists (
    select 1 from public.practice_sessions s
    where s.id = practice_session_id
      and s.student_id = auth.uid()
      and question_id = any(s.question_ids)
  )
);

drop policy if exists "Students manage own question bookmarks" on public.question_bookmarks;
create policy "Students manage own question bookmarks"
on public.question_bookmarks for all to authenticated
using (student_id = auth.uid())
with check (student_id = auth.uid());

create or replace function public.submit_practice_answer(
  p_practice_session_id uuid,
  p_question_id uuid,
  p_selected_option smallint,
  p_marked_for_review boolean default false
)
returns table (
  is_correct boolean,
  correct_option smallint,
  explanation text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  session_student_id uuid;
  session_state text;
  session_question_ids uuid[];
  question_options jsonb;
  question_correct_option smallint;
  question_explanation text;
  answer_is_correct boolean;
begin
  if current_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.profiles profile
    where profile.id = current_user_id
      and profile.role = 'student'::public.user_role
  ) then
    raise exception 'Student account required.' using errcode = '42501';
  end if;

  select session.student_id, session.status, session.question_ids
  into session_student_id, session_state, session_question_ids
  from public.practice_sessions session
  where session.id = p_practice_session_id;

  if not found
    or session_student_id <> current_user_id
    or session_state <> 'in_progress'
    or not (p_question_id = any(session_question_ids)) then
    raise exception 'Question is not part of your active practice session.' using errcode = '42501';
  end if;

  select question.options, question.correct_option, question.explanation
  into question_options, question_correct_option, question_explanation
  from public.questions question
  where question.id = p_question_id
    and question.review_status = 'approved';

  if not found then
    raise exception 'Approved question not found.' using errcode = 'P0002';
  end if;

  if p_selected_option is not null
    and (p_selected_option < 0 or p_selected_option >= jsonb_array_length(question_options)) then
    raise exception 'Selected option is outside the question choices.' using errcode = '22023';
  end if;

  answer_is_correct := case
    when p_selected_option is null then null
    else p_selected_option = question_correct_option
  end;

  insert into public.student_answers (
    practice_session_id,
    student_id,
    question_id,
    selected_option,
    is_correct,
    marked_for_review
  ) values (
    p_practice_session_id,
    current_user_id,
    p_question_id,
    p_selected_option,
    answer_is_correct,
    p_marked_for_review
  )
  on conflict (practice_session_id, question_id) do update
  set
    selected_option = excluded.selected_option,
    is_correct = excluded.is_correct,
    marked_for_review = excluded.marked_for_review,
    answered_at = pg_catalog.now();

  return query select
    answer_is_correct,
    case when p_selected_option is null then null else question_correct_option end,
    case when p_selected_option is null then null else question_explanation end;
end;
$$;

revoke all on function public.submit_practice_answer(uuid, uuid, smallint, boolean) from public, anon;
grant execute on function public.submit_practice_answer(uuid, uuid, smallint, boolean) to authenticated;

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
    where answer.student_id = auth.uid()
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

create or replace function public.admin_question_bank(p_status text default null)
returns table (
  id uuid,
  prompt text,
  options jsonb,
  correct_option smallint,
  course_name text,
  source_title text,
  source_year smallint,
  review_status text,
  question_type text,
  source_question_number integer
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
      and profile.role = 'admin'::public.user_role
  ) then
    raise exception 'Administrator authentication required.' using errcode = '42501';
  end if;

  return query
  select
    question.id,
    question.prompt,
    question.options,
    question.correct_option,
    course.name,
    source.title,
    source.source_year,
    question.review_status,
    question.question_type,
    question.source_question_number
  from public.questions question
  join public.courses course on course.id = question.course_id
  join public.question_sources source on source.id = question.source_id
  where p_status is null or question.review_status = p_status
  order by source.title, question.source_question_number;
end;
$$;

revoke all on function public.admin_question_bank(text) from public, anon;
grant execute on function public.admin_question_bank(text) to authenticated;

revoke all on public.courses, public.question_sources, public.questions,
  public.practice_sessions, public.student_answers, public.question_bookmarks
  from public, anon, authenticated;

grant usage on schema public to authenticated;
grant select on public.courses, public.question_sources, public.practice_sessions,
  public.student_answers, public.question_bookmarks to authenticated;
grant insert, update, delete on public.courses, public.question_sources, public.questions to authenticated;
grant insert on public.practice_sessions to authenticated;
grant update (status, completed_at) on public.practice_sessions to authenticated;
grant select (id, source_id, course_id, source_question_number, prompt, options, question_type, review_status, created_at, updated_at) on public.questions to authenticated;
grant select (practice_session_id, student_id, question_id, selected_option, is_correct, marked_for_review, answered_at) on public.student_answers to authenticated;
grant insert, delete on public.question_bookmarks to authenticated;