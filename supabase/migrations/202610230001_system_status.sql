-- ============================================================
-- Status do sistema: avisos para as empresas + saúde dos serviços
-- ============================================================
-- Rode depois de 202610220001_integrations_per_company.sql.
--
-- 1) system_notices: avisos que a Vórtice publica no Painel Master >
--    Status (instabilidade, manutenção programada, informativo). Viram
--    uma faixa no topo do sistema para todas as empresas ou só para as
--    escolhidas. Guardam a linha do tempo de atualizações.
-- 2) platform_health: resultado da verificação automática (a cada
--    minuto, na VPS) de banco, IA, API da Meta e dos agendadores. Quando
--    algo cai, a equipe da Vórtice é avisada no sino e publica o aviso
--    com um clique -- nada aparece para os clientes sem confirmação.
--
-- As duas tabelas são lidas e gravadas só pelo servidor.
-- Idempotente: pode rodar mais de uma vez.
-- ============================================================

create table if not exists public.system_notices (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'incident',
  title text not null,
  message text not null default '',
  services text[] not null default '{}',
  audience text not null default 'all',
  target_tenants uuid[] not null default '{}',
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  resolved_at timestamptz,
  updates jsonb not null default '[]'::jsonb,
  health_service text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'system_notices_kind_check') then
    alter table public.system_notices
      add constraint system_notices_kind_check check (kind in ('incident', 'maintenance', 'info'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'system_notices_audience_check') then
    alter table public.system_notices
      add constraint system_notices_audience_check check (audience in ('all', 'tenants'));
  end if;
end $$;

create index if not exists system_notices_open_idx on public.system_notices (starts_at) where resolved_at is null;
create index if not exists system_notices_created_idx on public.system_notices (created_at desc);

alter table public.system_notices enable row level security;
revoke all on public.system_notices from anon, authenticated;

create table if not exists public.platform_health (
  service text primary key,
  status text not null default 'unknown',
  message text,
  latency_ms integer,
  fail_count integer not null default 0,
  since timestamptz not null default now(),
  checked_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'platform_health_status_check') then
    alter table public.platform_health
      add constraint platform_health_status_check check (status in ('ok', 'down', 'off', 'unknown'));
  end if;
end $$;

alter table public.platform_health enable row level security;
revoke all on public.platform_health from anon, authenticated;
