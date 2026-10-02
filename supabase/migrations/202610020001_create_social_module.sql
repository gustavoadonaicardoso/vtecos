-- ============================================================
-- VÓRTICE CRM — Módulo Redes Sociais (estúdio de conteúdo Meta)
-- ============================================================
-- Contas conectadas (Páginas do Facebook + Instagram profissional),
-- posts e o resultado da publicação em cada destino.
--
-- As TRÊS tabelas ficam com RLS ligada e SEM policy: ninguém com a
-- chave pública (anon, embutida no JS do site) lê ou escreve. Só o
-- servidor (supabaseAdmin) acessa, via rotas /api/social/* que exigem
-- sessão válida. Diferente do Planejamentos (só visualização), aqui:
--   - social_accounts guarda tokens de Página da Meta (publicam em
--     nome da empresa);
--   - social_posts/targets alimentam o agendador -- se fossem abertas,
--     qualquer pessoa com a chave pública poderia inserir um post
--     "scheduled" e o servidor o publicaria no Instagram/Facebook.
--
-- Idempotente: pode ser executada mais de uma vez sem erro.
-- ============================================================

create table if not exists public.social_accounts (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('facebook', 'instagram')),
  external_id text not null,
  page_id text not null,
  name text not null default '',
  username text,
  avatar_url text,
  access_token text not null,
  project_id uuid references public.action_plans(id) on delete set null,
  connected_by uuid references public.profiles(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'error', 'disconnected')),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform, external_id)
);

create table if not exists public.social_posts (
  id uuid primary key default gen_random_uuid(),
  caption text not null default '',
  media jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in (
    'draft', 'pending_approval', 'rejected', 'scheduled', 'publishing',
    'published', 'published_late', 'partial', 'failed'
  )),
  scheduled_at timestamptz,
  published_at timestamptz,
  publishing_started_at timestamptz,
  project_id uuid references public.action_plans(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists social_posts_due_idx
  on public.social_posts (scheduled_at) where status = 'scheduled';
create index if not exists social_posts_scheduled_at_idx on public.social_posts (scheduled_at);
create index if not exists social_posts_project_id_idx on public.social_posts (project_id);

create table if not exists public.social_post_targets (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.social_posts(id) on delete cascade,
  account_id uuid not null references public.social_accounts(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'published', 'failed')),
  external_id text,
  permalink text,
  error text,
  published_at timestamptz,
  unique (post_id, account_id)
);

create index if not exists social_post_targets_post_id_idx on public.social_post_targets (post_id);

alter table public.social_accounts enable row level security;
alter table public.social_posts enable row level security;
alter table public.social_post_targets enable row level security;

revoke all on public.social_accounts from anon, authenticated;
revoke all on public.social_posts from anon, authenticated;
revoke all on public.social_post_targets from anon, authenticated;

-- Público porque o Instagram/Facebook precisam buscar a imagem por URL
-- no momento da publicação. Upload só pelo servidor (service role).
insert into storage.buckets (id, name, public)
values ('social-media', 'social-media', true)
on conflict (id) do nothing;
