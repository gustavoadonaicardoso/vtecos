-- ============================================================
-- Discador automático (power dialer)
-- ============================================================
-- Rode depois de 202610230001_system_status.sql.
--
-- O servidor liga para os contatos da campanha (planilha) e só passa a
-- ligação para um atendente quando alguém atende de verdade (caixa
-- postal é detectada e desligada). Ligações saem pela conta Twilio da
-- empresa (Integrações > Discador).
--
-- 1) dialer_campaigns: campanha (ligações por atendente, detectar caixa
--    postal, tempo de toque, situação).
-- 2) dialer_contacts: cada número da planilha, com o resultado da
--    ligação, quem atendeu, duração, gravação e anotação do atendente.
-- 3) dialer_agents: quem está com o discador aberto e disponível (o
--    navegador avisa a cada 15 segundos).
-- 4) call_logs: campanha/contato de origem (histórico e relatórios).
--
-- As três tabelas novas são lidas e gravadas só pelo servidor.
-- Idempotente: pode rodar mais de uma vez.
-- ============================================================

create table if not exists public.dialer_campaigns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  status text not null default 'draft',
  calls_per_agent integer not null default 1,
  detect_voicemail boolean not null default true,
  ring_seconds integer not null default 25,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  last_error text
);

alter table public.dialer_campaigns add column if not exists last_error text;

create table if not exists public.dialer_contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  campaign_id uuid not null references public.dialer_campaigns(id) on delete cascade,
  position integer not null default 0,
  name text,
  phone text not null,
  data jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  attempts integer not null default 0,
  call_sid text,
  agent_id uuid references public.profiles(id) on delete set null,
  answered_by text,
  outcome text,
  notes text,
  duration integer,
  talk_seconds integer,
  recording_url text,
  error text,
  dialed_at timestamptz,
  answered_at timestamptz,
  ended_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.dialer_agents (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  status text not null default 'offline',
  contact_id uuid references public.dialer_contacts(id) on delete set null,
  last_seen timestamptz not null default now(),
  status_since timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'dialer_campaigns_status_check') then
    alter table public.dialer_campaigns add constraint dialer_campaigns_status_check
      check (status in ('draft', 'running', 'paused', 'finished'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'dialer_campaigns_calls_check') then
    alter table public.dialer_campaigns add constraint dialer_campaigns_calls_check
      check (calls_per_agent between 1 and 3 and ring_seconds between 10 and 60);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'dialer_contacts_status_check') then
    alter table public.dialer_contacts add constraint dialer_contacts_status_check
      check (status in ('pending', 'dialing', 'connected', 'completed', 'no_answer', 'busy', 'voicemail', 'abandoned', 'failed'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'dialer_agents_status_check') then
    alter table public.dialer_agents add constraint dialer_agents_status_check
      check (status in ('offline', 'paused', 'available', 'on_call', 'wrapup'));
  end if;
end $$;

create index if not exists dialer_campaigns_tenant_idx on public.dialer_campaigns (tenant_id, created_at desc);
create index if not exists dialer_campaigns_running_idx on public.dialer_campaigns (status) where status = 'running';
create index if not exists dialer_contacts_queue_idx on public.dialer_contacts (campaign_id, status, position);
create index if not exists dialer_contacts_call_idx on public.dialer_contacts (call_sid) where call_sid is not null;
create index if not exists dialer_contacts_tenant_idx on public.dialer_contacts (tenant_id, status);
create index if not exists dialer_agents_tenant_idx on public.dialer_agents (tenant_id, status);

alter table public.dialer_campaigns enable row level security;
alter table public.dialer_contacts enable row level security;
alter table public.dialer_agents enable row level security;
revoke all on public.dialer_campaigns from anon, authenticated;
revoke all on public.dialer_contacts from anon, authenticated;
revoke all on public.dialer_agents from anon, authenticated;

-- Histórico de ligações: de qual campanha/contato veio.
alter table public.call_logs
  add column if not exists dialer_contact_id uuid references public.dialer_contacts(id) on delete set null;
create index if not exists call_logs_call_sid_idx on public.call_logs (call_sid) where call_sid is not null;
create index if not exists call_logs_user_idx on public.call_logs (tenant_id, user_id, created_at desc);

-- Contagem por situação de cada campanha (lista e detalhe).
create or replace function public.dialer_campaign_counts(p_tenant uuid, p_campaign uuid default null)
returns table (campaign_id uuid, status text, total bigint)
language sql
stable
security definer
set search_path = public
as $$
  select c.campaign_id, c.status, count(*)
  from dialer_contacts c
  where c.tenant_id = p_tenant and (p_campaign is null or c.campaign_id = p_campaign)
  group by c.campaign_id, c.status;
$$;

revoke all on function public.dialer_campaign_counts(uuid, uuid) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.dialer_campaign_counts(uuid, uuid) from anon, authenticated;
  end if;
end $$;
