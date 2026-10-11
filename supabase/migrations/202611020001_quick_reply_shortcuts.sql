-- ============================================================
-- Respostas rápidas: tabela e atalho para usar com "/" nas Mensagens
-- ============================================================
-- Rode depois de 202611010001_remove_fiscal.sql.
-- As respostas rápidas ficam em message_templates. Em alguns bancos
-- essa tabela nunca foi criada (as respostas rápidas não salvavam):
-- aqui ela é criada se faltar, já separada por empresa.
-- Cada resposta ganha um atalho, como no WhatsApp Business: digitar
-- /boasvindas no campo de mensagem mostra a resposta para inserir. O
-- atalho é único por empresa entre as respostas ativas.
--
-- Idempotente: pode rodar mais de uma vez. Respostas antigas ficam
-- sem atalho e continuam funcionando (a busca com "/" acha pelo nome).
-- ============================================================

create table if not exists public.message_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  content text not null,
  shortcut text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Bancos em que a tabela já existia (com menos colunas).
alter table public.message_templates
  add column if not exists content text,
  add column if not exists shortcut text,
  add column if not exists is_active boolean default true,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists message_templates_tenant_id_idx on public.message_templates (tenant_id);

alter table public.message_templates drop constraint if exists message_templates_shortcut_check;
alter table public.message_templates
  add constraint message_templates_shortcut_check
  check (shortcut is null or shortcut ~ '^[a-z0-9_-]{1,30}$');

create unique index if not exists message_templates_tenant_shortcut_key
  on public.message_templates (tenant_id, lower(shortcut))
  where is_active and shortcut is not null;

-- Quais respostas cada pessoa usa (Equipe > Acessos; vazio = todas).
alter table public.profiles add column if not exists allowed_templates text[] default '{}';

-- Acesso: o sistema lê e grava pelo servidor. No navegador, cada
-- empresa só enxergaria as próprias respostas (mesma regra das outras
-- tabelas da empresa).
alter table public.message_templates enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.message_templates from anon;
  end if;

  if to_regprocedure('public.current_tenant_id()') is not null then
    alter table public.message_templates alter column tenant_id set default public.current_tenant_id();
    if exists (select 1 from pg_roles where rolname = 'authenticated')
       and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'message_templates') then
      grant select, insert, update, delete on public.message_templates to authenticated;
      create policy "tenant isolation" on public.message_templates for all to authenticated
        using (tenant_id = (select public.current_tenant_id()))
        with check (tenant_id = (select public.current_tenant_id()));
    end if;
  end if;
end $$;
