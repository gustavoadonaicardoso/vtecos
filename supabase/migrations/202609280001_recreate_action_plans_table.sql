-- ============================================================
-- VÓRTICE CRM — Recria tabela action_plans (Planos de Ação/Projetos)
-- ============================================================
-- Contexto: a tela /projetos (e o painel /admin/projetos) parou de
-- funcionar com "Could not find the table 'public.action_plans' in
-- the schema cache" — a tabela não existe mais no banco (não há
-- registro dela em nenhuma migration anterior deste repositório,
-- então foi criada fora do controle de versão em algum momento e
-- depois removida/perdida).
--
-- Esta migration recria a tabela com exatamente os campos que
-- src/services/projects.service.ts já espera (client_name,
-- project_name, status, strategies, weekly_goals,
-- commercial_points, color_gradient), e a mesma política de RLS
-- (authenticated full access) usada no resto do projeto.
--
-- Atenção: os dados que existiam antes (ex.: o projeto "Primeiros
-- passos") não podem ser recuperados por esta migration — a tabela
-- precisa ser preenchida de novo pelo Painel Master > Planos de Ação.
--
-- Idempotente: pode ser executada mais de uma vez sem erro.
-- ============================================================

create table if not exists public.action_plans (
  id uuid primary key default gen_random_uuid(),
  client_name text not null default '',
  project_name text not null default '',
  status text not null default 'Planejamento',
  strategies text default '',
  weekly_goals text default '',
  commercial_points text default '',
  color_gradient text default '',
  created_at timestamptz not null default now()
);

alter table public.action_plans enable row level security;

drop policy if exists "authenticated full access" on public.action_plans;
create policy "authenticated full access" on public.action_plans
  for all to authenticated using (true) with check (true);
