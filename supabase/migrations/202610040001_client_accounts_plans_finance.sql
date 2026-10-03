-- ============================================================
-- VÓRTICE CRM — Empresas clientes, planos e Custos & Precificação
-- ============================================================
-- 1. Empresas (tenants) ganham plano, documento e contato.
-- 2. plans: pacotes vendidos pela Vórtice com a lista de módulos
--    liberados para a empresa cliente.
-- 3. profiles.account_type: STAFF (equipe Vórtice, como sempre foi) ou
--    CLIENT (login do cliente, preso à própria empresa via tenant_id).
-- 4. fin_*: módulo Custos & Precificação. TODAS as tabelas têm
--    tenant_id e ficam travadas (RLS sem policy + revoke): só o servidor
--    lê/grava, sempre filtrando pela empresa da sessão. Assim um cliente
--    nunca enxerga a planilha de outro.
-- Idempotente: pode rodar mais de uma vez.
-- ============================================================

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  domain text,
  status text not null default 'ACTIVE',
  created_at timestamptz not null default now()
);

create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  price numeric(12, 2) not null default 0,
  modules text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tenants add column if not exists plan_id uuid references public.plans (id) on delete set null;
alter table public.tenants add column if not exists document text;
alter table public.tenants add column if not exists contact_email text;
alter table public.tenants add column if not exists notes text;

alter table public.profiles add column if not exists tenant_id uuid references public.tenants (id) on delete set null;
alter table public.profiles add column if not exists account_type text not null default 'STAFF';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_account_type_check') then
    alter table public.profiles
      add constraint profiles_account_type_check check (account_type in ('STAFF', 'CLIENT'));
  end if;
end $$;

create index if not exists profiles_tenant_id_idx on public.profiles (tenant_id);

alter table public.plans enable row level security;
revoke all on public.plans from anon, authenticated;

-- ── Custos & Precificação ─────────────────────────────────────

create table if not exists public.fin_settings (
  tenant_id uuid primary key references public.tenants (id) on delete cascade,
  tax_pct numeric(6, 2) not null default 6,
  commission_pct numeric(6, 2) not null default 0,
  target_margin_pct numeric(6, 2) not null default 20,
  labor_hour_cost numeric(12, 2) not null default 0,
  expected_monthly_revenue numeric(14, 2) not null default 0,
  updated_at timestamptz not null default now()
);

-- Insumos: ingredientes, embalagens e outros materiais.
-- O custo por unidade-base (g, ml ou un) é calculado a partir da compra.
create table if not exists public.fin_ingredients (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  category text not null default 'ingrediente' check (category in ('ingrediente', 'embalagem', 'outro')),
  purchase_unit text not null default 'kg' check (purchase_unit in ('kg', 'g', 'l', 'ml', 'un', 'dz')),
  purchase_qty numeric(14, 4) not null default 1 check (purchase_qty > 0),
  purchase_price numeric(14, 2) not null default 0 check (purchase_price >= 0),
  supplier text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fin_ingredients_tenant_idx on public.fin_ingredients (tenant_id, name);

-- Produtos / fichas técnicas. channel_prices: { "<channel_id>": preço praticado }.
create table if not exists public.fin_products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  category text not null default '',
  kind text not null default 'product' check (kind in ('product', 'base')),
  yield_qty numeric(14, 4) not null default 1 check (yield_qty > 0),
  yield_unit text not null default 'un',
  prep_minutes numeric(10, 2) not null default 0 check (prep_minutes >= 0),
  loss_pct numeric(6, 2) not null default 0 check (loss_pct >= 0 and loss_pct < 100),
  sale_price numeric(14, 2) not null default 0 check (sale_price >= 0),
  channel_prices jsonb not null default '{}'::jsonb,
  target_margin_pct numeric(6, 2),
  notes text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fin_products_tenant_idx on public.fin_products (tenant_id, name);

-- Itens da ficha técnica: um insumo OU um preparo-base (outra ficha).
create table if not exists public.fin_product_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  product_id uuid not null references public.fin_products (id) on delete cascade,
  ingredient_id uuid references public.fin_ingredients (id) on delete cascade,
  component_product_id uuid references public.fin_products (id) on delete cascade,
  quantity numeric(14, 4) not null check (quantity > 0),
  unit text not null default 'g' check (unit in ('kg', 'g', 'l', 'ml', 'un', 'dz')),
  position integer not null default 0,
  constraint fin_product_items_one_source check (
    (ingredient_id is not null and component_product_id is null)
    or (ingredient_id is null and component_product_id is not null)
  )
);

create index if not exists fin_product_items_product_idx on public.fin_product_items (product_id, position);

-- Despesas: fixas mensais (aluguel, luz, pró-labore...) ou avulsas de um mês.
create table if not exists public.fin_fixed_costs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  category text not null default 'outros',
  amount numeric(14, 2) not null check (amount >= 0),
  recurrence text not null default 'monthly' check (recurrence in ('monthly', 'once')),
  month date,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists fin_fixed_costs_tenant_idx on public.fin_fixed_costs (tenant_id);

-- Canais de venda: balcão, iFood, encomendas... cada um com sua taxa.
create table if not exists public.fin_channels (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  fee_pct numeric(6, 2) not null default 0 check (fee_pct >= 0 and fee_pct < 100),
  fixed_fee numeric(12, 2) not null default 0 check (fixed_fee >= 0),
  extra_cost numeric(12, 2) not null default 0 check (extra_cost >= 0),
  position integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists fin_channels_tenant_idx on public.fin_channels (tenant_id, position);

-- Vendas. unit_cost/fee_amount/tax_amount são o retrato do momento da
-- venda: mudar o preço de um insumo depois não reescreve o passado.
create table if not exists public.fin_sales (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  sold_at date not null default current_date,
  product_id uuid references public.fin_products (id) on delete set null,
  channel_id uuid references public.fin_channels (id) on delete set null,
  description text not null default '',
  quantity numeric(14, 4) not null default 1 check (quantity > 0),
  unit_price numeric(14, 2) not null default 0 check (unit_price >= 0),
  discount numeric(14, 2) not null default 0 check (discount >= 0),
  unit_cost numeric(14, 4) not null default 0,
  fee_amount numeric(14, 2) not null default 0,
  tax_amount numeric(14, 2) not null default 0,
  source text not null default 'manual' check (source in ('manual', 'import')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists fin_sales_tenant_date_idx on public.fin_sales (tenant_id, sold_at);

do $$
declare
  t text;
begin
  foreach t in array array['fin_settings', 'fin_ingredients', 'fin_products', 'fin_product_items', 'fin_fixed_costs', 'fin_channels', 'fin_sales']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

notify pgrst, 'reload schema';
