-- ============================================================
-- VÓRTICE CRM — Cria tabela goals (Metas, objetivos e planos)
-- ============================================================
-- Contexto: a tela /metas e o widget "Acompanhamento de metas" do
-- dashboard nunca foram conectados ao banco — liam e escreviam
-- direto no localStorage do navegador (chave vortice_goals). Isso
-- fazia com que metas criadas em um dispositivo simplesmente não
-- existissem em nenhum outro (ex.: criada no desktop, invisível no
-- celular), sem nenhum erro visível.
--
-- Esta migration cria a tabela real e segue o mesmo padrão de RLS
-- já usado no restante do projeto (authenticated full access —
-- autorização real fica por conta da API, que valida o requester
-- via x-user-id e usa o client de service role no servidor).
--
-- Idempotente: pode ser executada mais de uma vez sem erro.
-- ============================================================

create table if not exists public.goals (
  id text primary key,
  title text not null,
  description text default '',
  type text not null default 'goal',
  metric text not null default 'won_leads',
  target_value numeric not null default 0,
  deadline text,
  stage_ids text[] not null default '{}',
  visibility text not null default 'public',
  viewer_ids text[] not null default '{}',
  owner_id uuid references public.profiles(id) on delete cascade,
  tasks jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.goals enable row level security;

drop policy if exists "authenticated full access" on public.goals;
create policy "authenticated full access" on public.goals
  for all to authenticated using (true) with check (true);
