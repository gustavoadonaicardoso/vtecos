-- ============================================================
-- Banners personalizados da tela Início + modo suporte da Vórtice
-- ============================================================
-- Rode depois de 202610150001_support_tickets.sql.
--
-- 1) platform_banners: destino do clique (módulo ou link), texto do
--    botão, imagem, agendamento (início/fim), ligado/desligado, ordem e
--    público (todas as empresas, só clientes, só a Vórtice, empresas
--    escolhidas, empresas com um módulo). A leitura passa a ser só pelo
--    servidor, que filtra o que cada empresa vê -- antes qualquer
--    usuário lia todos os banners direto do banco.
-- 2) support_access_sessions: admin da Vórtice entra numa empresa
--    cliente como administrador (modo suporte), por tempo limitado.
--    current_tenant_id() passa a devolver a empresa do cliente enquanto
--    a sessão estiver ativa, então o RLS do navegador e o servidor veem
--    os mesmos dados (nunca uma mistura das duas empresas).
--
-- Idempotente: pode rodar mais de uma vez.
-- ============================================================

-- ── 1) Banners ──────────────────────────────────────────────

alter table public.platform_banners
  add column if not exists link_url text,
  add column if not exists button_label text,
  add column if not exists image_url text,
  add column if not exists starts_at timestamptz,
  add column if not exists ends_at timestamptz,
  add column if not exists active boolean not null default true,
  add column if not exists position integer not null default 0,
  add column if not exists audience text not null default 'all',
  add column if not exists target_tenants uuid[] not null default '{}',
  add column if not exists target_modules text[] not null default '{}',
  add column if not exists dismissible boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'platform_banners_audience_check') then
    alter table public.platform_banners
      add constraint platform_banners_audience_check check (audience in ('all', 'clients', 'platform', 'tenants'));
  end if;
end $$;

-- Só o servidor lê e grava (ele filtra por empresa, plano, cargo e data).
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'platform_banners' loop
    execute format('drop policy %I on public.platform_banners', pol.policyname);
  end loop;
end $$;
alter table public.platform_banners enable row level security;
revoke all on public.platform_banners from anon, authenticated;

-- Imagens dos banners: bucket público (aparecem na tela de todo mundo).
insert into storage.buckets (id, name, public, file_size_limit)
values ('platform-assets', 'platform-assets', true, 5242880)
on conflict (id) do update set public = true, file_size_limit = 5242880;

-- ── 2) Modo suporte ─────────────────────────────────────────

create table if not exists public.support_access_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  reason text not null,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ended_at timestamptz
);

create index if not exists support_access_sessions_active_idx
  on public.support_access_sessions (user_id, expires_at desc) where ended_at is null;

alter table public.support_access_sessions enable row level security;
revoke all on public.support_access_sessions from anon, authenticated;

-- Empresa "de verdade" de quem está logado (a regra antiga de current_tenant_id).
create or replace function public.own_tenant_id()
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

-- Empresa em que a pessoa está agindo: a do cliente, se for admin da
-- Vórtice com modo suporte ativo; senão, a própria.
create or replace function public.current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select s.tenant_id
      from public.support_access_sessions s
      join public.profiles p on p.id = s.user_id
      join public.tenants own on own.id = p.tenant_id
      where s.user_id = auth.uid()
        and s.ended_at is null
        and s.expires_at > now()
        and p.status = 'ACTIVE'
        and p.role = 'ADMIN'
        and own.is_platform
      order by s.started_at desc
      limit 1
    ),
    public.own_tenant_id()
  )
$$;

grant execute on function public.own_tenant_id() to anon, authenticated;
grant execute on function public.current_tenant_id() to anon, authenticated;
