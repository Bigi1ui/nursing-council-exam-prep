do $$
begin
  if not exists (
    select 1
    from pg_type type_record
    join pg_namespace namespace_record
      on namespace_record.oid = type_record.typnamespace
    where type_record.typname = 'user_role'
      and namespace_record.nspname = 'public'
  ) then
    create type public.user_role as enum ('student', 'admin');
  end if;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text not null,
  role public.user_role not null default 'student'::public.user_role,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;

create trigger set_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

revoke all on function public.set_updated_at() from public, anon, authenticated;

create or replace function public.prevent_self_role_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() = new.id and new.role is distinct from old.role then
    raise exception 'Users cannot change their own role.';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_self_role_change on public.profiles;

create trigger prevent_self_role_change
before update on public.profiles
for each row
execute function public.prevent_self_role_change();

revoke all on function public.prevent_self_role_change() from public, anon, authenticated;

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles as existing_profile (id, full_name, email, role)
  values (
    new.id,
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    new.email,
    'student'::public.user_role
  )
  on conflict (id) do update
  set
    full_name = coalesce(excluded.full_name, existing_profile.full_name),
    email = coalesce(excluded.email, existing_profile.email),
    updated_at = pg_catalog.now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user_profile();

revoke all on function public.handle_new_user_profile() from public, anon, authenticated;

insert into public.profiles (id, full_name, email)
select
  auth_user.id,
  nullif(auth_user.raw_user_meta_data ->> 'full_name', ''),
  auth_user.email
from auth.users as auth_user
where auth_user.email is not null
on conflict (id) do nothing;

drop policy if exists "Authenticated users can read their own profile"
on public.profiles;

create policy "Authenticated users can read their own profile"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

drop policy if exists "Authenticated users can update their own profile"
on public.profiles;

create policy "Authenticated users can update their own profile"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

revoke all on table public.profiles from public, anon, authenticated;

grant usage on schema public to authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, avatar_url) on public.profiles to authenticated;
