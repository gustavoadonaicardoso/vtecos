-- ============================================================
-- Central de Ajuda editável + integrações só no servidor
-- ============================================================
-- 1. Central de Ajuda: categorias, artigos e perguntas frequentes saem
--    do código e vão para o banco, editáveis no Painel Master > Ajuda.
--    O conteúdo é o mesmo para todas as empresas. O conteúdo padrão é
--    gravado pelo servidor na primeira vez que alguém abre a Ajuda.
-- 2. integrations_config (tokens e segredos de WhatsApp, webhooks, etc.)
--    deixa de ser lida pelo navegador: só o servidor acessa, e a tela de
--    Integrações recebe os segredos mascarados.
-- Pode rodar mais de uma vez.
-- ============================================================

create table if not exists public.help_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text not null default '',
  icon text not null default 'book',
  color text not null default '#3b82f6',
  position integer not null default 0,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.help_articles (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.help_categories (id) on delete set null,
  slug text not null unique,
  title text not null,
  summary text not null default '',
  -- [{ "title": "...", "text": "..." }] -- o texto aceita **negrito**,
  -- `código`, listas com "- ", blocos ``` e links.
  sections jsonb not null default '[]'::jsonb,
  tip text not null default '',
  video_url text not null default '',
  position integer not null default 0,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists help_articles_category_idx on public.help_articles (category_id, position);

create table if not exists public.help_faqs (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  answer text not null,
  position integer not null default 0,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Só o servidor lê e grava (as rotas /api/help* cuidam da permissão).
alter table public.help_categories enable row level security;
alter table public.help_articles enable row level security;
alter table public.help_faqs enable row level security;
revoke all on public.help_categories from anon, authenticated;
revoke all on public.help_articles from anon, authenticated;
revoke all on public.help_faqs from anon, authenticated;

-- Credenciais das integrações: fora do alcance do navegador.
do $$
declare
  pol record;
begin
  if to_regclass('public.integrations_config') is null then
    return;
  end if;
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'integrations_config' loop
    execute format('drop policy %I on public.integrations_config', pol.policyname);
  end loop;
  alter table public.integrations_config enable row level security;
  revoke all on public.integrations_config from anon, authenticated;
end $$;

-- Origem do lead (formulário do site, API...). A tela já mostrava
-- leads.source, mas a coluna não existia em todos os bancos.
do $$
begin
  if to_regclass('public.leads') is not null then
    alter table public.leads add column if not exists source text;
  end if;
end $$;

notify pgrst, 'reload schema';
