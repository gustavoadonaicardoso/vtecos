-- The existing queue_tickets table stores support tickets. The attendance
-- queue uses a separate table so both domains can evolve independently.
create table if not exists public.attendance_queue_tickets (
  id uuid primary key default gen_random_uuid(),
  number bigint not null unique,
  name text,
  whatsapp text,
  document text,
  desk text,
  status text not null default 'waiting'
    check (status in ('waiting', 'calling', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.assign_attendance_queue_number()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.number is null then
    perform pg_advisory_xact_lock(hashtext('attendance_queue_tickets_number'));
    select coalesce(max(number), 0) + 1
      into new.number
      from public.attendance_queue_tickets;
  end if;
  return new;
end;
$$;

drop trigger if exists attendance_queue_assign_number on public.attendance_queue_tickets;
create trigger attendance_queue_assign_number
before insert on public.attendance_queue_tickets
for each row execute function public.assign_attendance_queue_number();

create or replace function public.touch_attendance_queue_ticket()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists attendance_queue_touch_updated_at on public.attendance_queue_tickets;
create trigger attendance_queue_touch_updated_at
before update on public.attendance_queue_tickets
for each row execute function public.touch_attendance_queue_ticket();

alter table public.attendance_queue_tickets enable row level security;

drop policy if exists "attendance queue public read" on public.attendance_queue_tickets;
create policy "attendance queue public read"
on public.attendance_queue_tickets for select
to anon, authenticated
using (true);

-- The current staff panel uses application-level authentication rather than a
-- Supabase Auth session, so its browser requests have the anon role.
drop policy if exists "attendance queue panel update" on public.attendance_queue_tickets;
create policy "attendance queue panel update"
on public.attendance_queue_tickets for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "attendance queue panel delete" on public.attendance_queue_tickets;
create policy "attendance queue panel delete"
on public.attendance_queue_tickets for delete
to anon, authenticated
using (true);

grant select, update, delete on public.attendance_queue_tickets to anon, authenticated;

do $$
begin
  alter publication supabase_realtime add table public.attendance_queue_tickets;
exception
  when duplicate_object then null;
end $$;
