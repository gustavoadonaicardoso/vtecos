-- ============================================================
-- Senhas: numeração diária, senha preferencial, chamada segura e histórico
-- ============================================================
-- Rode depois de 202610130001_scheduling_review.sql.
--
-- 1) attendance_queue_tickets:
--    - queue_date (dia da fila, fuso de São Paulo): a numeração recomeça
--      do 1 todo dia, sozinha. Antes ela crescia para sempre e o único
--      jeito de zerar era "Reiniciar fila", que APAGAVA todas as senhas.
--    - priority (preferencial), origin (totem/recepção).
--    - called_at / finished_at / called_by / call_count: tempo de espera,
--      quem chamou e quantas vezes (a TV toca o aviso a cada chamada).
--    - novos status: no_show (não compareceu) e canceled.
-- 2) queue_call_next(): pega a próxima senha com trava no banco (FOR
--    UPDATE SKIP LOCKED). Antes, dois guichês clicando juntos chamavam a
--    MESMA senha.
-- 3) queue_settings: nome do guichê (Guichê/Sala/Mesa...), senha
--    preferencial no totem e voz na TV.
--
-- Idempotente: pode rodar mais de uma vez.
-- ============================================================

-- ── 1) Senhas ───────────────────────────────────────────────

alter table public.attendance_queue_tickets
  add column if not exists queue_date date,
  add column if not exists priority boolean not null default false,
  add column if not exists origin text,
  add column if not exists called_at timestamptz,
  add column if not exists finished_at timestamptz,
  add column if not exists called_by uuid references public.profiles(id) on delete set null,
  add column if not exists call_count integer not null default 0;

update public.attendance_queue_tickets
set queue_date = (created_at at time zone 'America/Sao_Paulo')::date
where queue_date is null;

alter table public.attendance_queue_tickets
  alter column queue_date set default ((now() at time zone 'America/Sao_Paulo')::date),
  alter column queue_date set not null;

-- Quem já foi chamado: o horário da chamada é o último movimento conhecido.
update public.attendance_queue_tickets
set called_at = updated_at, call_count = greatest(call_count, 1)
where called_at is null and status in ('calling', 'completed');

update public.attendance_queue_tickets
set finished_at = updated_at
where finished_at is null and status = 'completed';

alter table public.attendance_queue_tickets drop constraint if exists attendance_queue_tickets_status_check;
alter table public.attendance_queue_tickets
  add constraint attendance_queue_tickets_status_check check (status in ('waiting', 'calling', 'completed', 'no_show', 'canceled'));

-- Senhas de dias anteriores que ficaram esperando ou em atendimento: encerra.
update public.attendance_queue_tickets
set status = case when status = 'calling' then 'completed' else 'canceled' end,
    finished_at = coalesce(finished_at, updated_at)
where status in ('waiting', 'calling')
  and queue_date < (now() at time zone 'America/Sao_Paulo')::date;

-- Número único por empresa POR DIA.
drop index if exists public.attendance_queue_tickets_tenant_number_idx;
create unique index if not exists attendance_queue_tickets_tenant_day_number_idx
  on public.attendance_queue_tickets (tenant_id, queue_date, number);
create index if not exists attendance_queue_tickets_day_status_idx
  on public.attendance_queue_tickets (tenant_id, queue_date, status);

create or replace function public.assign_attendance_queue_number()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.queue_date is null then
    new.queue_date := (now() at time zone 'America/Sao_Paulo')::date;
  end if;
  if new.number is null then
    perform pg_advisory_xact_lock(hashtext('attendance_queue_tickets_number:' || new.tenant_id::text || ':' || new.queue_date::text));
    select coalesce(max(number), 0) + 1
      into new.number
      from public.attendance_queue_tickets
      where tenant_id = new.tenant_id and queue_date = new.queue_date;
  end if;
  return new;
end;
$$;

-- ── 2) Chamar a próxima com trava ───────────────────────────
-- Encerra o atendimento atual do guichê e chama a próxima senha de hoje
-- (preferenciais primeiro, depois por ordem de chegada). Só o servidor
-- (service role) executa.

create or replace function public.queue_call_next(p_tenant uuid, p_desk text, p_user uuid)
returns setof public.attendance_queue_tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  next_id uuid;
begin
  update public.attendance_queue_tickets
  set status = 'completed', finished_at = now()
  where tenant_id = p_tenant and status = 'calling' and desk = p_desk;

  select id into next_id
  from public.attendance_queue_tickets
  where tenant_id = p_tenant
    and status = 'waiting'
    and queue_date = (now() at time zone 'America/Sao_Paulo')::date
  order by priority desc, number asc
  for update skip locked
  limit 1;

  if next_id is null then
    return;
  end if;

  return query
  update public.attendance_queue_tickets
  set status = 'calling', desk = p_desk, called_at = now(), called_by = p_user, call_count = call_count + 1
  where id = next_id
  returning *;
end;
$$;

revoke all on function public.queue_call_next(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.queue_call_next(uuid, text, uuid) to service_role;

-- ── 3) Configurações da fila ────────────────────────────────

alter table public.queue_settings
  add column if not exists desk_label text not null default 'Guichê',
  add column if not exists priority_enabled boolean not null default true,
  add column if not exists voice_enabled boolean not null default true;
