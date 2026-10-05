-- ============================================================
-- Agendamento: agenda ligada a leads e à equipe + envios que saem de verdade
-- ============================================================
-- Rode depois de 202610120001_messages_inbox.sql.
--
-- 1) scheduling_items (compromissos e tarefas): lead de verdade (antes era
--    um texto solto), responsável, quem criou, lembrete e o horário absoluto
--    (starts_at, fuso de São Paulo) usado pelos lembretes.
-- 2) scheduled_messages (envios agendados): horário absoluto (send_at),
--    situação "enviando"/"cancelada", motivo da falha e quem agendou.
--    Antes nada enviava essas mensagens -- elas ficavam "pendentes" para
--    sempre. Os envios antigos que ficaram para trás NÃO são disparados
--    agora (seriam mensagens fora de hora): viram "falhou" com o motivo.
--
-- Idempotente: pode rodar mais de uma vez.
-- ============================================================

-- ── 1) Compromissos e tarefas ───────────────────────────────

alter table public.scheduling_items
  add column if not exists lead_id uuid references public.leads(id) on delete set null,
  add column if not exists assigned_to uuid references public.profiles(id) on delete set null,
  add column if not exists created_by uuid references public.profiles(id) on delete set null,
  add column if not exists starts_at timestamptz,
  add column if not exists remind_minutes integer,
  add column if not exists reminded_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'scheduling_items_remind_minutes_check') then
    alter table public.scheduling_items
      add constraint scheduling_items_remind_minutes_check check (remind_minutes is null or remind_minutes between 0 and 10080);
  end if;
end $$;

-- Horário absoluto dos itens que já existem (data + hora no fuso de São Paulo).
update public.scheduling_items
set starts_at = ((date || ' ' || coalesce(nullif(left(time, 5), ''), '00:00'))::timestamp at time zone 'America/Sao_Paulo')
where starts_at is null
  and date ~ '^\d{4}-\d{2}-\d{2}$'
  and (time is null or time = '' or time ~ '^\d{2}:\d{2}');

create index if not exists scheduling_items_tenant_date_idx on public.scheduling_items (tenant_id, date);
create index if not exists scheduling_items_reminder_idx on public.scheduling_items (starts_at)
  where remind_minutes is not null and reminded_at is null and status <> 'done';

-- ── 2) Envios agendados ─────────────────────────────────────

alter table public.scheduled_messages
  add column if not exists send_at timestamptz,
  add column if not exists sent_at timestamptz,
  add column if not exists error text,
  add column if not exists created_by uuid references public.profiles(id) on delete set null,
  add column if not exists attempts integer not null default 0,
  add column if not exists updated_at timestamptz not null default now();

alter table public.scheduled_messages drop constraint if exists scheduled_messages_status_check;
alter table public.scheduled_messages
  add constraint scheduled_messages_status_check check (status in ('pending', 'sending', 'sent', 'failed', 'canceled'));

update public.scheduled_messages
set send_at = ((scheduled_date || ' ' || left(scheduled_time, 5))::timestamp at time zone 'America/Sao_Paulo')
where send_at is null
  and scheduled_date ~ '^\d{4}-\d{2}-\d{2}$'
  and scheduled_time ~ '^\d{2}:\d{2}';

-- Canais que nunca enviaram nada (Instagram, Messenger, E-mail).
update public.scheduled_messages
set status = 'canceled', error = 'Canal sem envio automático. Só o WhatsApp da empresa envia mensagens agendadas.'
where status = 'pending' and channel not ilike '%whatsapp%';

-- Pendentes cujo horário já passou: não dispara agora, fora de hora.
update public.scheduled_messages
set status = 'failed', error = 'O horário passou antes de o envio automático existir. Reagende se ainda fizer sentido.'
where status = 'pending' and (send_at is null or send_at < now());

create index if not exists scheduled_messages_due_idx on public.scheduled_messages (send_at) where status = 'pending';
create index if not exists scheduled_messages_tenant_idx on public.scheduled_messages (tenant_id, send_at desc);
