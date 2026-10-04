-- ============================================================
-- Automações de verdade
-- ============================================================
-- Antes os fluxos ficavam só no navegador de quem montou (localStorage)
-- e nada era executado. Agora:
--   automation_flows -> o fluxo de cada empresa (blocos e conexões);
--   automation_runs  -> cada execução para um lead: em que bloco está,
--                       se está esperando (tempo ou resposta) e o registro
--                       de cada passo.
-- Só o servidor acessa (rotas /api/automations e o motor).
-- Pode rodar mais de uma vez.
-- ============================================================

create table if not exists public.automation_flows (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  description text not null default '',
  status text not null default 'draft' check (status in ('draft', 'active', 'paused')),
  -- { nodes: [...], connections: [...], variables: [...] }
  graph jsonb not null default '{}'::jsonb,
  -- Evento do gatilho, copiado do grafo para o motor achar os fluxos rápido.
  trigger_event text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists automation_flows_trigger_idx on public.automation_flows (tenant_id, status, trigger_event);

create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  flow_id uuid not null references public.automation_flows (id) on delete cascade,
  lead_id uuid,
  status text not null default 'running' check (status in ('running', 'waiting', 'completed', 'failed', 'cancelled', 'expired')),
  current_node_id text,
  waiting_for text check (waiting_for in ('delay', 'reply')),
  resume_at timestamptz,
  -- { vars: { resposta: "..." }, message: "texto que disparou" }
  context jsonb not null default '{}'::jsonb,
  -- [{ node_id, label, at, ok, detail }]
  steps jsonb not null default '[]'::jsonb,
  error text,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists automation_runs_due_idx on public.automation_runs (status, waiting_for, resume_at);
create index if not exists automation_runs_lead_idx on public.automation_runs (tenant_id, lead_id, status);
create index if not exists automation_runs_flow_idx on public.automation_runs (flow_id, started_at desc);

alter table public.automation_flows enable row level security;
alter table public.automation_runs enable row level security;
revoke all on public.automation_flows from anon, authenticated;
revoke all on public.automation_runs from anon, authenticated;

notify pgrst, 'reload schema';
