-- ============================================================
-- VÓRTICE CRM — Cria tabelas ausentes + fecha RLS em aberto
-- ============================================================
-- Contexto (auditoria de 21/09/2026):
-- 1) 7 tabelas usadas pelo código nunca foram criadas no banco de
--    produção (system_config, platform_banners, system_updates,
--    queue_settings, scheduling_items, scheduled_messages, call_logs).
--    Algumas telas tinham fallback para localStorage e mascaravam o
--    problema; outras simplesmente falhavam silenciosamente.
-- 2) RLS já estava habilitada em todas as 17 tabelas existentes, mas
--    14 delas não tinham nenhuma policy — ou seja, ninguém além da
--    service_role conseguia ler/escrever (bloqueio total, não
--    abertura). Esta migration cria policies para o papel
--    `authenticated`, restaurando o funcionamento das telas que
--    dependem de acesso direto do navegador via anon key, mas agora
--    exigindo uma sessão válida do Supabase Auth (antes, com RLS
--    desabilitada na versão antiga do setup, não exigia nada).
--
-- Este script é idempotente: pode ser executado mais de uma vez sem
-- erro (usa IF NOT EXISTS / DROP POLICY IF EXISTS antes de recriar).
-- Não faz DELETE nem DROP em dados existentes.
-- ============================================================


-- ------------------------------------------------------------
-- PARTE 1 — Tabelas ausentes
-- ------------------------------------------------------------

create table if not exists public.system_config (
  id text primary key,
  primary_color text,
  secondary_color text,
  sidebar_bg text,
  app_name text,
  logo_url text,
  favicon_url text,
  updated_at timestamptz not null default now()
);

create table if not exists public.platform_banners (
  id uuid primary key default gen_random_uuid(),
  title text,
  description text,
  -- Campos usados pela tela Master (src/app/master/page.tsx)
  date text,
  type text,
  color text,
  target_roles text[] default '{}',
  -- Campos usados pela tela Admin > Banners (src/app/admin/banners/page.tsx)
  date_string text,
  badge_type text,
  color_gradient text,
  location text,
  time text,
  full_info text,
  -- Compartilhado pelas duas telas
  icon_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.system_updates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  user_name text,
  action text,
  target text,
  icon_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.queue_settings (
  id text primary key,
  total_desks integer not null default 5,
  logo_url text,
  banner_url text,
  app_name text,
  primary_color text,
  secondary_color text,
  welcome_text text,
  updated_at timestamptz not null default now()
);

insert into public.queue_settings (id, total_desks)
values ('default', 5)
on conflict (id) do nothing;

create table if not exists public.scheduling_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  status text not null default 'todo' check (status in ('todo', 'in-progress', 'done')),
  date text not null,
  time text,
  type text not null default 'event' check (type in ('task', 'event')),
  lead text,
  created_at timestamptz not null default now()
);

create table if not exists public.scheduled_messages (
  id uuid primary key default gen_random_uuid(),
  channel text not null,
  lead_id uuid references public.leads(id) on delete set null,
  lead_name text,
  scheduled_date text not null,
  scheduled_time text not null,
  template_name text,
  message text,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  created_at timestamptz not null default now()
);

create table if not exists public.call_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  contact_number text,
  direction text check (direction in ('inbound', 'outbound')),
  status text,
  duration integer,
  recording_url text,
  call_sid text,
  created_at timestamptz not null default now()
);


-- ------------------------------------------------------------
-- PARTE 2 — RLS + policies nas tabelas novas
-- ------------------------------------------------------------

alter table public.system_config enable row level security;
alter table public.platform_banners enable row level security;
alter table public.system_updates enable row level security;
alter table public.queue_settings enable row level security;
alter table public.scheduling_items enable row level security;
alter table public.scheduled_messages enable row level security;
alter table public.call_logs enable row level security;

drop policy if exists "authenticated full access" on public.system_config;
create policy "authenticated full access" on public.system_config
  for all to authenticated using (true) with check (true);

drop policy if exists "authenticated full access" on public.platform_banners;
create policy "authenticated full access" on public.platform_banners
  for all to authenticated using (true) with check (true);

drop policy if exists "authenticated full access" on public.system_updates;
create policy "authenticated full access" on public.system_updates
  for all to authenticated using (true) with check (true);

drop policy if exists "authenticated full access" on public.queue_settings;
create policy "authenticated full access" on public.queue_settings
  for all to authenticated using (true) with check (true);

drop policy if exists "authenticated full access" on public.scheduling_items;
create policy "authenticated full access" on public.scheduling_items
  for all to authenticated using (true) with check (true);

drop policy if exists "authenticated full access" on public.scheduled_messages;
create policy "authenticated full access" on public.scheduled_messages
  for all to authenticated using (true) with check (true);

drop policy if exists "authenticated full access" on public.call_logs;
create policy "authenticated full access" on public.call_logs
  for all to authenticated using (true) with check (true);


-- ------------------------------------------------------------
-- PARTE 3 — Policies para tabelas existentes sem nenhuma policy
-- ------------------------------------------------------------
-- (RLS já estava habilitada nelas; só faltava a policy.)

drop policy if exists "authenticated full access" on public.leads;
create policy "authenticated full access" on public.leads
  for all to authenticated using (true) with check (true);

drop policy if exists "authenticated full access" on public.chat_messages;
create policy "authenticated full access" on public.chat_messages
  for all to authenticated using (true) with check (true);

drop policy if exists "authenticated full access" on public.pipeline_stages;
create policy "authenticated full access" on public.pipeline_stages
  for all to authenticated using (true) with check (true);

drop policy if exists "authenticated full access" on public.integrations_config;
create policy "authenticated full access" on public.integrations_config
  for all to authenticated using (true) with check (true);

drop policy if exists "authenticated full access" on public.internal_chat;
create policy "authenticated full access" on public.internal_chat
  for all to authenticated using (true) with check (true);

drop policy if exists "authenticated full access" on public.chat_groups;
create policy "authenticated full access" on public.chat_groups
  for all to authenticated using (true) with check (true);

drop policy if exists "authenticated full access" on public.chat_group_members;
create policy "authenticated full access" on public.chat_group_members
  for all to authenticated using (true) with check (true);

drop policy if exists "authenticated full access" on public.chat_group_messages;
create policy "authenticated full access" on public.chat_group_messages
  for all to authenticated using (true) with check (true);

drop policy if exists "authenticated full access" on public.blast_campaigns;
create policy "authenticated full access" on public.blast_campaigns
  for all to authenticated using (true) with check (true);

drop policy if exists "authenticated full access" on public.blast_contacts;
create policy "authenticated full access" on public.blast_contacts
  for all to authenticated using (true) with check (true);

drop policy if exists "authenticated full access" on public.system_notifications;
create policy "authenticated full access" on public.system_notifications
  for all to authenticated using (true) with check (true);

drop policy if exists "authenticated full access" on public.google_calendar_connections;
create policy "authenticated full access" on public.google_calendar_connections
  for all to authenticated using (true) with check (true);

drop policy if exists "authenticated full access" on public.google_calendar_event_links;
create policy "authenticated full access" on public.google_calendar_event_links
  for all to authenticated using (true) with check (true);

-- audit_logs: mantém como trilha só de leitura + inserção (nada no
-- código faz update/delete). Evita que qualquer usuário logado possa
-- apagar ou adulterar o histórico de auditoria.
drop policy if exists "authenticated read" on public.audit_logs;
create policy "authenticated read" on public.audit_logs
  for select to authenticated using (true);

drop policy if exists "authenticated insert" on public.audit_logs;
create policy "authenticated insert" on public.audit_logs
  for insert to authenticated with check (true);

-- profiles: já existe a policy "Usuário pode visualizar o próprio
-- perfil" (SELECT, id = auth.uid()). Isso não é suficiente — telas
-- como Leads, Pipeline, Chat e NewLeadModal precisam listar nomes de
-- outros membros da equipe. Adiciona SELECT amplo para authenticated.
-- Não adiciona UPDATE/DELETE amplo de propósito: trocar papel (role)
-- ou remover outro usuário deve continuar passando pela rota
-- /api/users (service_role), não pela anon key direto do navegador.
drop policy if exists "authenticated can view team profiles" on public.profiles;
create policy "authenticated can view team profiles" on public.profiles
  for select to authenticated using (true);
