-- ============================================================
-- VÓRTICE CRM — Cria o módulo de Planejamentos (funis visuais)
-- ============================================================
-- Contexto: novo módulo de produto para montar funis de vendas
-- visualmente (estilo Funnelytics) — nós arrastáveis conectados
-- por linhas, só para visualização/teste, sem automação real.
--
-- canvas_data guarda nodes/edges/viewport do React Flow num jsonb
-- só, sem tabelas relacionais de nó/aresta — é só visualização,
-- não precisa consultar nó por nó.
--
-- RLS segue o padrão já corrigido no restante do projeto: o
-- navegador nunca tem sessão real do Supabase (login é 100%
-- server-side via cookie httpOnly), então a policy é aberta para
-- anon + authenticated e a autorização de verdade é feita nas
-- rotas /api/planejamentos/* via requireActiveProfile().
--
-- Idempotente: pode ser executada mais de uma vez sem erro.
-- ============================================================

create table if not exists public.planning_boards (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Novo planejamento',
  description text default '',
  project_id uuid references public.action_plans(id) on delete set null,
  canvas_data jsonb not null default '{"nodes":[],"edges":[],"viewport":{"x":0,"y":0,"zoom":1}}'::jsonb,
  thumbnail_url text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists planning_boards_project_id_idx on public.planning_boards(project_id);

alter table public.planning_boards enable row level security;

drop policy if exists "anon and authenticated full access" on public.planning_boards;
create policy "anon and authenticated full access" on public.planning_boards
  for all to anon, authenticated using (true) with check (true);

grant select, insert, update, delete on public.planning_boards to anon, authenticated;

insert into storage.buckets (id, name, public)
values ('planning-media', 'planning-media', true)
on conflict (id) do nothing;
