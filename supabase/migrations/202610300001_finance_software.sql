-- ============================================================
-- Custos e Precificação para quem vende sistema (software/SaaS)
-- ============================================================
-- Rode depois de 202610290001_lead_protocol.sql.
--
-- 1) Despesas em dólar ou euro (Claude, ChatGPT, Supabase, Cursor...)
--    e despesas anuais (domínio, certificado, conta de desenvolvedor),
--    que entram no mês como 1/12 do valor.
-- 2) Itens comprados (insumos / recursos) também podem ser em dólar ou
--    euro e com preço de até 6 casas (ex.: US$ 0,0035 por mensagem).
-- 3) Cotação do dólar e do euro + IOF/spread do cartão nas
--    configurações da empresa.
-- 4) Unidades novas: mil, milhão (tokens de IA, mensagens), MB e GB.
--
-- Nada muda para quem já usa: tudo continua em reais e mensal.
-- Idempotente: pode rodar mais de uma vez.
-- ============================================================

alter table public.fin_fixed_costs
  add column if not exists currency text not null default 'BRL';

alter table public.fin_fixed_costs drop constraint if exists fin_fixed_costs_currency_check;
alter table public.fin_fixed_costs
  add constraint fin_fixed_costs_currency_check check (currency in ('BRL', 'USD', 'EUR'));

alter table public.fin_fixed_costs drop constraint if exists fin_fixed_costs_recurrence_check;
alter table public.fin_fixed_costs
  add constraint fin_fixed_costs_recurrence_check check (recurrence in ('monthly', 'yearly', 'once'));

alter table public.fin_ingredients
  add column if not exists currency text not null default 'BRL';

alter table public.fin_ingredients drop constraint if exists fin_ingredients_currency_check;
alter table public.fin_ingredients
  add constraint fin_ingredients_currency_check check (currency in ('BRL', 'USD', 'EUR'));

alter table public.fin_ingredients
  alter column purchase_price type numeric(18, 6);

alter table public.fin_ingredients drop constraint if exists fin_ingredients_purchase_unit_check;
alter table public.fin_ingredients
  add constraint fin_ingredients_purchase_unit_check check (purchase_unit in ('kg', 'g', 'l', 'ml', 'un', 'dz', 'mil', 'mi', 'm', 'cm', 'm2', 'h', 'min', 'mb', 'gb'));

alter table public.fin_product_items drop constraint if exists fin_product_items_unit_check;
alter table public.fin_product_items
  add constraint fin_product_items_unit_check check (unit in ('kg', 'g', 'l', 'ml', 'un', 'dz', 'mil', 'mi', 'm', 'cm', 'm2', 'h', 'min', 'mb', 'gb'));

alter table public.fin_settings
  add column if not exists usd_rate numeric(10, 4) not null default 0,
  add column if not exists eur_rate numeric(10, 4) not null default 0,
  add column if not exists fx_fee_pct numeric(6, 2) not null default 3.5,
  add column if not exists fx_updated_at timestamptz;
