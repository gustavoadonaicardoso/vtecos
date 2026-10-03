-- ============================================================
-- VÓRTICE CRM — Separação total por empresa (multi-tenant)
-- ============================================================
-- Depois desta migration, CADA dado do sistema pertence a uma empresa
-- (tenants) e o próprio banco garante que um usuário só enxerga as
-- linhas da empresa dele:
--
-- 1. tenants.is_platform marca a empresa dona da plataforma (Vórtice).
--    Ela é criada aqui e recebe TODOS os dados e usuários que já
--    existem -- para a equipe atual nada muda.
-- 2. Toda tabela de negócio ganha tenant_id (obrigatório). O valor
--    padrão é a empresa de quem está logado, então inserts feitos pelo
--    navegador já saem na empresa certa.
-- 3. RLS por empresa: o navegador agora usa a sessão real do Supabase
--    (não mais o papel anônimo) e cada policy compara tenant_id com
--    public.current_tenant_id(). O papel anon perde acesso a tudo que
--    é dado de empresa (conversas, chat, leads, planejamentos...).
-- 4. Chaves que eram únicas no sistema todo passam a ser únicas por
--    empresa (etapas do funil, número da senha, integrações, fila).
-- 5. Novo usuário do Auth só entra numa empresa se o servidor disser
--    qual (app_metadata.tenant_id, que só a service role grava). Quem
--    se cadastrar por fora fica INATIVO.
--
-- Rode inteira, uma vez, e faça o deploy do código logo em seguida.
-- Idempotente: pode rodar de novo sem erro.
-- ============================================================

-- ── 1. Empresas ───────────────────────────────────────────────

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'ACTIVE',
  created_at timestamptz not null default now()
);

alter table public.tenants add column if not exists is_platform boolean not null default false;
alter table public.tenants add column if not exists slug text;
-- Chave do totem e do painel de senhas desta empresa (vai na URL pública).
alter table public.tenants add column if not exists display_key text;
alter table public.tenants add column if not exists plan_id uuid;
alter table public.tenants add column if not exists document text;
alter table public.tenants add column if not exists contact_email text;
alter table public.tenants add column if not exists notes text;

update public.tenants set display_key = replace(gen_random_uuid()::text, '-', '') where display_key is null;
alter table public.tenants alter column display_key set default replace(gen_random_uuid()::text, '-', '');
create unique index if not exists tenants_display_key_idx on public.tenants (display_key);
create unique index if not exists tenants_single_platform_idx on public.tenants (is_platform) where is_platform;

insert into public.tenants (name, status, is_platform)
select 'Vórtice Tecnologia', 'ACTIVE', true
where not exists (select 1 from public.tenants where is_platform);

alter table public.tenants enable row level security;
revoke all on public.tenants from anon, authenticated;

-- ── 2. Usuários ───────────────────────────────────────────────

alter table public.profiles add column if not exists tenant_id uuid references public.tenants (id) on delete restrict;
alter table public.profiles add column if not exists account_type text not null default 'STAFF';

-- Todo mundo que já existe (menos logins de cliente já criados) é da Vórtice.
update public.profiles
set tenant_id = (select id from public.tenants where is_platform)
where tenant_id is null or coalesce(account_type, 'STAFF') <> 'CLIENT';

update public.profiles p
set account_type = case when t.is_platform then 'STAFF' else 'CLIENT' end
from public.tenants t
where t.id = p.tenant_id;

alter table public.profiles alter column tenant_id set not null;
create index if not exists profiles_tenant_id_idx on public.profiles (tenant_id);

-- ── 3. Funções usadas pelas policies ──────────────────────────

-- Empresa de quem está logado. null = sem acesso (usuário inativo,
-- empresa suspensa ou chamada anônima).
create or replace function public.current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.tenant_id
  from public.profiles p
  join public.tenants t on t.id = p.tenant_id
  where (p.id = auth.uid() or lower(p.email) = lower(auth.jwt() ->> 'email'))
    and auth.uid() is not null
    and p.status = 'ACTIVE'
    and (t.status = 'ACTIVE' or t.is_platform)
  order by (p.id = auth.uid()) desc
  limit 1
$$;

create or replace function public.current_profile_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.role
  from public.profiles p
  where (p.id = auth.uid() or lower(p.email) = lower(auth.jwt() ->> 'email'))
    and auth.uid() is not null
    and p.status = 'ACTIVE'
  order by (p.id = auth.uid()) desc
  limit 1
$$;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_profile_role() = 'ADMIN'
    and exists (select 1 from public.tenants t where t.id = public.current_tenant_id() and t.is_platform), false)
$$;

grant execute on function public.current_tenant_id() to anon, authenticated;
grant execute on function public.current_profile_role() to anon, authenticated;
grant execute on function public.is_platform_admin() to anon, authenticated;

-- ── 4. tenant_id + RLS em cada tabela ─────────────────────────
-- mode:
--   tenant  → usuários da empresa leem e gravam (navegador e servidor)
--   admin   → só administradores da empresa (credenciais de integrações)
--   locked  → só o servidor (service role); navegador não acessa

create or replace function public._vtec_scope_table(tbl text, mode text)
returns void
language plpgsql
as $$
declare
  rel regclass := to_regclass('public.' || tbl);
  platform uuid := (select id from public.tenants where is_platform);
  col_type text;
  pol record;
begin
  if rel is null then
    raise notice 'Tabela % não existe -- ignorada.', tbl;
    return;
  end if;

  select data_type into col_type
  from information_schema.columns
  where table_schema = 'public' and table_name = tbl and column_name = 'tenant_id';

  if col_type is null then
    execute format('alter table public.%I add column tenant_id uuid references public.tenants (id) on delete cascade', tbl);
  elsif col_type <> 'uuid' then
    raise exception 'public.%.tenant_id existe com tipo % (esperado uuid).', tbl, col_type;
  end if;

  execute format('update public.%I set tenant_id = %L where tenant_id is null', tbl, platform);
  execute format('alter table public.%I alter column tenant_id set default public.current_tenant_id()', tbl);
  execute format('alter table public.%I alter column tenant_id set not null', tbl);
  execute format('create index if not exists %I on public.%I (tenant_id)', tbl || '_tenant_id_idx', tbl);
  execute format('alter table public.%I enable row level security', tbl);

  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = tbl loop
    execute format('drop policy %I on public.%I', pol.policyname, tbl);
  end loop;

  execute format('revoke all on public.%I from anon', tbl);

  if mode = 'locked' then
    execute format('revoke all on public.%I from authenticated', tbl);
  elsif mode = 'admin' then
    execute format('grant select, insert, update, delete on public.%I to authenticated', tbl);
    execute format($p$create policy "tenant admins only" on public.%I for all to authenticated
      using (tenant_id = (select public.current_tenant_id()) and (select public.current_profile_role()) = 'ADMIN')
      with check (tenant_id = (select public.current_tenant_id()) and (select public.current_profile_role()) = 'ADMIN')$p$, tbl);
  else
    execute format('grant select, insert, update, delete on public.%I to authenticated', tbl);
    execute format($p$create policy "tenant isolation" on public.%I for all to authenticated
      using (tenant_id = (select public.current_tenant_id()))
      with check (tenant_id = (select public.current_tenant_id()))$p$, tbl);
  end if;
end;
$$;

do $$
declare
  t text;
begin
  -- Navegador acessa (sempre só a própria empresa).
  foreach t in array array[
    'leads', 'pipeline_stages', 'chat_messages', 'message_templates',
    'blast_campaigns', 'blast_contacts', 'call_logs',
    'scheduled_messages', 'scheduling_items',
    'google_calendar_connections', 'google_calendar_event_links',
    'internal_chat', 'chat_groups', 'chat_group_members', 'chat_group_messages',
    'goals', 'action_plans', 'planning_boards',
    'attendance_queue_tickets', 'queue_settings', 'queue_tickets',
    'system_updates'
  ] loop
    perform public._vtec_scope_table(t, 'tenant');
  end loop;

  perform public._vtec_scope_table('integrations_config', 'admin');
  -- Auditoria: ajustada abaixo (todos registram, só admins leem).
  perform public._vtec_scope_table('audit_logs', 'locked');

  -- Só o servidor.
  foreach t in array array[
    'attendance_queue_contacts', 'queue_display_media',
    'social_accounts', 'social_posts', 'social_post_targets',
    'fin_settings', 'fin_ingredients', 'fin_products', 'fin_product_items',
    'fin_fixed_costs', 'fin_channels', 'fin_sales'
  ] loop
    perform public._vtec_scope_table(t, 'locked');
  end loop;
end $$;

drop function public._vtec_scope_table(text, text);

-- ── 5. Perfis, notificações e tabelas da plataforma ───────────

alter table public.profiles enable row level security;
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'profiles' loop
    execute format('drop policy %I on public.profiles', pol.policyname);
  end loop;
end $$;
revoke all on public.profiles from anon;
revoke insert, update, delete on public.profiles from authenticated;
grant select on public.profiles to authenticated;
-- Cada um vê só a equipe da própria empresa. Alterações só pelo servidor.
create policy "same tenant read" on public.profiles for select to authenticated
  using (tenant_id = (select public.current_tenant_id()));

do $$
declare pol record;
begin
  if to_regclass('public.system_notifications') is null then return; end if;
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'system_notifications' loop
    execute format('drop policy %I on public.system_notifications', pol.policyname);
  end loop;
  execute 'alter table public.system_notifications enable row level security';
  execute 'revoke all on public.system_notifications from anon';
  execute 'revoke insert on public.system_notifications from authenticated';
  execute 'grant select, update, delete on public.system_notifications to authenticated';
  execute $p$create policy "own notifications" on public.system_notifications for all to authenticated
    using (user_id = auth.uid()) with check (user_id = auth.uid())$p$;
end $$;

-- Identidade visual: a tela de login lê antes de existir sessão.
do $$
declare pol record;
begin
  if to_regclass('public.system_config') is null then return; end if;
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'system_config' loop
    execute format('drop policy %I on public.system_config', pol.policyname);
  end loop;
  execute 'alter table public.system_config enable row level security';
  execute 'revoke all on public.system_config from anon, authenticated';
  execute 'grant select on public.system_config to anon, authenticated';
  execute 'grant insert, update, delete on public.system_config to authenticated';
  execute $p$create policy "everyone reads branding" on public.system_config for select to anon, authenticated using (true)$p$;
  execute $p$create policy "platform admins write branding" on public.system_config for all to authenticated
    using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()))$p$;
end $$;

-- Avisos da Vórtice para todos os clientes.
do $$
declare pol record;
begin
  if to_regclass('public.platform_banners') is null then return; end if;
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'platform_banners' loop
    execute format('drop policy %I on public.platform_banners', pol.policyname);
  end loop;
  execute 'alter table public.platform_banners enable row level security';
  execute 'revoke all on public.platform_banners from anon';
  execute 'grant select, insert, update, delete on public.platform_banners to authenticated';
  execute $p$create policy "everyone reads banners" on public.platform_banners for select to authenticated using (true)$p$;
  execute $p$create policy "platform admins write banners" on public.platform_banners for all to authenticated
    using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()))$p$;
end $$;

-- Auditoria: qualquer usuário registra na própria empresa; só os admins
-- da empresa leem; ninguém altera ou apaga pelo navegador.
do $$
begin
  if to_regclass('public.audit_logs') is null then return; end if;
  execute 'grant select, insert on public.audit_logs to authenticated';
  execute 'drop policy if exists "tenant writes audit" on public.audit_logs';
  execute $p$create policy "tenant writes audit" on public.audit_logs for insert to authenticated
    with check (tenant_id = (select public.current_tenant_id()))$p$;
  execute 'drop policy if exists "tenant admins read audit" on public.audit_logs';
  execute $p$create policy "tenant admins read audit" on public.audit_logs for select to authenticated
    using (tenant_id = (select public.current_tenant_id()) and (select public.current_profile_role()) = 'ADMIN')$p$;
end $$;

-- Planos: só o servidor.
do $$
begin
  if to_regclass('public.plans') is not null then
    execute 'alter table public.plans enable row level security';
    execute 'revoke all on public.plans from anon, authenticated';
  end if;
end $$;

-- ── 6. Chaves únicas por empresa ──────────────────────────────

-- Etapas do funil: o id ("novo", "ganho"...) se repete em cada empresa.
do $$
declare
  r record;
  pk_cols text;
begin
  if to_regclass('public.pipeline_stages') is null then return; end if;

  select string_agg(a.attname, ',' order by a.attname) into pk_cols
  from pg_constraint c
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
  where c.conrelid = 'public.pipeline_stages'::regclass and c.contype = 'p';

  if pk_cols is distinct from 'id,tenant_id' then
    for r in select conname, conrelid::regclass as tbl from pg_constraint
             where confrelid = 'public.pipeline_stages'::regclass and contype = 'f' loop
      execute format('alter table %s drop constraint %I', r.tbl, r.conname);
    end loop;
    for r in select conname from pg_constraint where conrelid = 'public.pipeline_stages'::regclass and contype = 'p' loop
      execute format('alter table public.pipeline_stages drop constraint %I', r.conname);
    end loop;
    alter table public.pipeline_stages add primary key (tenant_id, id);
  end if;

  if to_regclass('public.leads') is not null
     and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'leads' and column_name = 'stage_id')
     and not exists (select 1 from pg_constraint where conname = 'leads_tenant_stage_fk') then
    alter table public.leads
      add constraint leads_tenant_stage_fk foreign key (tenant_id, stage_id)
      references public.pipeline_stages (tenant_id, id) on update cascade not valid;
  end if;
end $$;

-- Integrações: uma configuração de cada provedor POR EMPRESA.
do $$
declare r record;
begin
  if to_regclass('public.integrations_config') is null then return; end if;
  for r in
    select c.conname from pg_constraint c
    where c.conrelid = 'public.integrations_config'::regclass and c.contype = 'u'
      and (select array_agg(a.attname::text) from pg_attribute a where a.attrelid = c.conrelid and a.attnum = any (c.conkey)) = array['provider']
  loop
    execute format('alter table public.integrations_config drop constraint %I', r.conname);
  end loop;
  for r in
    select i.relname from pg_index x
    join pg_class i on i.oid = x.indexrelid
    where x.indrelid = 'public.integrations_config'::regclass and x.indisunique and not x.indisprimary
      and (select array_agg(a.attname::text) from pg_attribute a where a.attrelid = x.indrelid and a.attnum = any (x.indkey)) = array['provider']
  loop
    execute format('drop index public.%I', r.relname);
  end loop;
  create unique index if not exists integrations_config_tenant_provider_idx on public.integrations_config (tenant_id, provider);
end $$;

-- Configuração da fila: uma linha por empresa (a antiga "default" é da Vórtice).
do $$
begin
  if to_regclass('public.queue_settings') is not null then
    create unique index if not exists queue_settings_tenant_idx on public.queue_settings (tenant_id);
  end if;
end $$;

-- Senhas: numeração própria de cada empresa.
do $$
declare r record;
begin
  if to_regclass('public.attendance_queue_tickets') is null then return; end if;
  for r in
    select c.conname from pg_constraint c
    where c.conrelid = 'public.attendance_queue_tickets'::regclass and c.contype = 'u'
      and (select array_agg(a.attname::text) from pg_attribute a where a.attrelid = c.conrelid and a.attnum = any (c.conkey)) = array['number']
  loop
    execute format('alter table public.attendance_queue_tickets drop constraint %I', r.conname);
  end loop;
  create unique index if not exists attendance_queue_tickets_tenant_number_idx on public.attendance_queue_tickets (tenant_id, number);
end $$;

create or replace function public.assign_attendance_queue_number()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.number is null then
    perform pg_advisory_xact_lock(hashtext('attendance_queue_tickets_number:' || new.tenant_id::text));
    select coalesce(max(number), 0) + 1
      into new.number
      from public.attendance_queue_tickets
      where tenant_id = new.tenant_id;
  end if;
  return new;
end;
$$;

-- ── 7. Usuário novo do Auth ───────────────────────────────────
-- A empresa vem de app_metadata.tenant_id, que só o servidor (service
-- role) consegue gravar. Cadastro feito por fora disso cai na Vórtice
-- como INATIVO, sem acesso a nada até um admin liberar.

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid;
begin
  begin
    target := nullif(new.raw_app_meta_data ->> 'tenant_id', '')::uuid;
  exception when others then
    target := null;
  end;
  if target is not null and not exists (select 1 from public.tenants where id = target) then
    target := null;
  end if;

  insert into public.profiles (id, name, email, role, status, permissions, tenant_id, account_type)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Usuário'
    ),
    lower(coalesce(new.email, new.id::text)),
    'SELLER',
    case when target is null then 'INACTIVE' else 'ACTIVE' end,
    '{}'::jsonb,
    coalesce(target, (select id from public.tenants where is_platform)),
    case when target is null or exists (select 1 from public.tenants where id = target and is_platform) then 'STAFF' else 'CLIENT' end
  )
  on conflict do nothing;

  return new;
end;
$$;

-- ── 8. Arquivos do chat interno (bucket "files") ──────────────
-- O navegador agora envia como usuário logado (não mais anônimo). Cada
-- empresa só grava na própria pasta: <tenant_id>/...
do $$
begin
  if to_regclass('storage.objects') is null then return; end if;
  drop policy if exists "tenant folder upload" on storage.objects;
  create policy "tenant folder upload" on storage.objects for insert to authenticated
    with check (bucket_id = 'files' and split_part(name, '/', 1) = (select public.current_tenant_id())::text);
  drop policy if exists "tenant folder read" on storage.objects;
  create policy "tenant folder read" on storage.objects for select to authenticated
    using (bucket_id = 'files' and split_part(name, '/', 1) = (select public.current_tenant_id())::text);
end $$;

-- ── 9. Conferência ────────────────────────────────────────────
-- Lista chaves únicas que ainda valem para o sistema todo (podem
-- impedir duas empresas de ter o mesmo valor). Só informativo.
do $$
declare r record;
begin
  for r in
    select c.conrelid::regclass as tbl, c.conname
    from pg_constraint c
    where c.contype = 'u'
      and c.connamespace = 'public'::regnamespace
      and exists (select 1 from information_schema.columns col
                  where col.table_schema = 'public' and col.table_name = c.conrelid::regclass::text and col.column_name = 'tenant_id')
      and not exists (select 1 from pg_attribute a where a.attrelid = c.conrelid and a.attnum = any (c.conkey) and a.attname = 'tenant_id')
  loop
    raise notice 'Atenção: % tem a chave única % sem tenant_id.', r.tbl, r.conname;
  end loop;
end $$;

notify pgrst, 'reload schema';
