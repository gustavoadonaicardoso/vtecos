-- ============================================================
-- Leads: campos que a tela já mostrava mas não gravava
-- ============================================================
-- Antes:
--   * etiquetas editadas na tela nunca eram salvas, e a lista de
--     etiquetas ("Configurar Tags") vivia só na memória do navegador;
--   * "Bloqueado" não existia no banco (todo lead aparecia Ativo);
--   * não havia onde anotar observações do lead.
-- Agora:
--   leads.tags     -> etiquetas do lead
--   leads.blocked  -> contato bloqueado (automações não rodam para ele)
--   leads.notes    -> observações
--   lead_tags      -> etiquetas cadastradas pela empresa (com cor)
-- As demais colunas abaixo já existem na maioria dos bancos; o
-- "if not exists" só garante que estejam lá.
-- Pode rodar mais de uma vez.
-- ============================================================

do $$
begin
  if to_regclass('public.leads') is null then return; end if;

  alter table public.leads add column if not exists email text;
  alter table public.leads add column if not exists cpf_cnpj text;
  alter table public.leads add column if not exists value numeric not null default 0;
  alter table public.leads add column if not exists assigned_to uuid;
  alter table public.leads add column if not exists tags text[] not null default '{}';
  alter table public.leads add column if not exists source text;
  alter table public.leads add column if not exists channels text[] not null default '{}';
  alter table public.leads add column if not exists last_msg text;
  alter table public.leads add column if not exists last_activity_at timestamptz;
  alter table public.leads add column if not exists blocked boolean not null default false;
  alter table public.leads add column if not exists notes text;

  create index if not exists leads_tenant_assigned_idx on public.leads (tenant_id, assigned_to);
  create index if not exists leads_tenant_created_idx on public.leads (tenant_id, created_at desc);
end $$;

create table if not exists public.lead_tags (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  color text not null default '#3b82f6',
  created_at timestamptz not null default now()
);

create unique index if not exists lead_tags_tenant_name_idx on public.lead_tags (tenant_id, lower(name));

-- Só o servidor (rotas /api/leads/tags) lê e grava.
alter table public.lead_tags enable row level security;
revoke all on public.lead_tags from anon, authenticated;

-- Etiquetas que já estão nos leads entram no cadastro da empresa.
do $$
begin
  if to_regclass('public.leads') is null then return; end if;
  if (select data_type from information_schema.columns
      where table_schema = 'public' and table_name = 'leads' and column_name = 'tags') <> 'ARRAY' then
    return;
  end if;

  insert into public.lead_tags (tenant_id, name)
  select distinct on (l.tenant_id, lower(trim(t.tag))) l.tenant_id, trim(t.tag)
  from public.leads l
  cross join lateral unnest(l.tags) as t(tag)
  where l.tenant_id is not null and trim(coalesce(t.tag, '')) <> '' and length(trim(t.tag)) <= 40
  on conflict do nothing;
end $$;

notify pgrst, 'reload schema';
