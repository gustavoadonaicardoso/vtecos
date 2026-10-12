-- ============================================================
-- Leads: campos extras e campos personalizados
-- ============================================================
-- Rode depois de 202611040001_billing_asaas.sql.
--
-- Novas colunas em leads (todas opcionais):
--   Acesso:   access_email (pode ser diferente do e-mail do lead),
--             access_login, access_url
--   Pessoais: birth_date, company_name, job_title, instagram, website
--   Endereço: address_cep, address_street, address_number,
--             address_complement, address_district, address_city,
--             address_state
--   custom_fields: valores dos campos personalizados da empresa
--                  ({"matricula": "123"})
--
-- lead_secrets: senha de acesso do lead, separada da tabela leads. Só o
-- servidor lê (RLS ligada, sem policy): não vai para a lista de leads
-- nem para o navegador -- aparece só quando alguém clica em "Mostrar"
-- (fica na auditoria) e nas mensagens ({{senha_acesso}}).
--
-- lead_custom_fields: campos que cada empresa cria em Leads > Campos.
--
-- Idempotente: pode rodar mais de uma vez.
-- ============================================================

alter table public.leads
  add column if not exists access_email text,
  add column if not exists access_login text,
  add column if not exists access_url text,
  add column if not exists birth_date date,
  add column if not exists company_name text,
  add column if not exists job_title text,
  add column if not exists instagram text,
  add column if not exists website text,
  add column if not exists address_cep text,
  add column if not exists address_street text,
  add column if not exists address_number text,
  add column if not exists address_complement text,
  add column if not exists address_district text,
  add column if not exists address_city text,
  add column if not exists address_state text,
  add column if not exists custom_fields jsonb not null default '{}'::jsonb;

create table if not exists public.lead_secrets (
  lead_id uuid primary key references public.leads (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  access_password text,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create index if not exists lead_secrets_tenant_idx on public.lead_secrets (tenant_id);

alter table public.lead_secrets enable row level security;
revoke all on public.lead_secrets from anon, authenticated;

create table if not exists public.lead_custom_fields (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  key text not null,
  label text not null,
  type text not null default 'text',
  position integer not null default 0,
  created_at timestamptz not null default now(),
  constraint lead_custom_fields_type_check check (type in ('text', 'number', 'date', 'url'))
);

create unique index if not exists lead_custom_fields_tenant_key_idx on public.lead_custom_fields (tenant_id, key);

-- Só o servidor (rotas /api/leads/fields) lê e grava.
alter table public.lead_custom_fields enable row level security;
revoke all on public.lead_custom_fields from anon, authenticated;
