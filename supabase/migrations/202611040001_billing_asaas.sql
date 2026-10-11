-- ============================================================
-- Cobrança automática pelo Asaas
-- ============================================================
-- Rode depois de 202611030001_internal_chat_files_bucket.sql.
--
-- Cada empresa cliente ganha a situação da cobrança:
--   manual    -- cobrada fora do sistema (como sempre foi; padrão)
--   trial     -- no teste grátis (até trial_ends_at)
--   active    -- assinatura no Asaas em dia
--   past_due  -- fatura vencida; o acesso continua por 3 dias
--   suspended -- suspensa por falta de pagamento (volta sozinha ao pagar)
--   canceled  -- assinatura cancelada no Asaas
-- O sistema só mexe sozinho em empresas com assinatura no Asaas: as
-- que estão em "manual" continuam exatamente como hoje.
--
-- billing_events guarda cada aviso do Asaas (webhook) uma vez só: o
-- Asaas pode mandar o mesmo aviso mais de uma vez.
--
-- Idempotente: pode rodar mais de uma vez.
-- ============================================================

alter table public.tenants
  add column if not exists billing_status text not null default 'manual',
  add column if not exists billing_cycle text not null default 'MONTHLY',
  add column if not exists trial_ends_at timestamptz,
  add column if not exists asaas_customer_id text,
  add column if not exists asaas_subscription_id text,
  add column if not exists billing_payment_id text,
  add column if not exists billing_next_due date,
  add column if not exists billing_invoice_url text,
  add column if not exists billing_overdue_since date,
  add column if not exists billing_last_paid_at timestamptz,
  add column if not exists billing_suspended_at timestamptz,
  add column if not exists billing_checked_at timestamptz,
  add column if not exists billing_notified jsonb not null default '{}'::jsonb;

alter table public.tenants drop constraint if exists tenants_billing_status_check;
alter table public.tenants
  add constraint tenants_billing_status_check
  check (billing_status in ('manual', 'trial', 'active', 'past_due', 'suspended', 'canceled'));

alter table public.tenants drop constraint if exists tenants_billing_cycle_check;
alter table public.tenants
  add constraint tenants_billing_cycle_check check (billing_cycle in ('MONTHLY', 'YEARLY'));

create unique index if not exists tenants_asaas_subscription_key on public.tenants (asaas_subscription_id) where asaas_subscription_id is not null;
create index if not exists tenants_billing_status_idx on public.tenants (billing_status) where billing_status <> 'manual';

create table if not exists public.billing_events (
  id text primary key,
  tenant_id uuid references public.tenants (id) on delete set null,
  event text not null,
  payment_id text,
  payload jsonb not null default '{}'::jsonb,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists billing_events_tenant_idx on public.billing_events (tenant_id, created_at desc);

-- Só o servidor lê e grava (dados de pagamento).
alter table public.billing_events enable row level security;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.billing_events from anon, authenticated;
  end if;
end $$;
