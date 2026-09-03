-- Creates the CRM profile automatically whenever a Supabase Auth user is created.
-- The profile id is intentionally the same as auth.users.id.

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    name,
    email,
    role,
    status,
    permissions
  )
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Usuário'
    ),
    lower(coalesce(new.email, new.id::text)),
    'SELLER',
    'ACTIVE',
    '{}'::jsonb
  )
  -- Ignore legacy duplicate-email rows; they can be reconciled separately
  -- without preventing the Auth user from being created.
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_auth_user();

-- Backfills Auth users that were created before this trigger existed.
-- Existing profiles are preserved.
insert into public.profiles (
  id,
  name,
  email,
  role,
  status,
  permissions
)
select
  u.id,
  coalesce(
    nullif(trim(u.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
    'Usuário'
  ),
  lower(coalesce(u.email, u.id::text)),
  'SELLER',
  'ACTIVE',
  '{}'::jsonb
from auth.users u
where not exists (
  select 1
  from public.profiles p
  where p.id = u.id
)
and not exists (
  select 1
  from public.profiles p
  where lower(p.email) = lower(coalesce(u.email, u.id::text))
);
