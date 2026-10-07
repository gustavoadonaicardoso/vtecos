-- ============================================================
-- Custos e Precificação para qualquer tipo de negócio
-- ============================================================
-- Rode depois de 202610240002_help_default_hash.sql.
--
-- 1) fin_settings ganha o ramo do negócio (business_type), os nomes
--    personalizados das telas (terms) e os tipos de insumo da empresa
--    (ingredient_categories: [{ key, label, group }]).
-- 2) fin_ingredients.category deixa de ter lista fixa (ingrediente,
--    embalagem, outro): cada empresa cria os próprios tipos.
-- 3) Unidades novas para insumos e fichas: metro, centímetro, metro
--    quadrado, hora e minuto (além de kg, g, litro, ml, unidade, dúzia).
--
-- Nada muda para quem já usa: sem ramo escolhido, as telas continuam
-- com os nomes de antes.
-- Idempotente: pode rodar mais de uma vez.
-- ============================================================

alter table public.fin_settings
  add column if not exists business_type text,
  add column if not exists terms jsonb not null default '{}'::jsonb,
  add column if not exists ingredient_categories jsonb;

alter table public.fin_ingredients drop constraint if exists fin_ingredients_category_check;
alter table public.fin_ingredients
  add constraint fin_ingredients_category_check check (category ~ '^[a-z0-9_-]{1,40}$');

alter table public.fin_ingredients drop constraint if exists fin_ingredients_purchase_unit_check;
alter table public.fin_ingredients
  add constraint fin_ingredients_purchase_unit_check check (purchase_unit in ('kg', 'g', 'l', 'ml', 'un', 'dz', 'm', 'cm', 'm2', 'h', 'min'));

alter table public.fin_product_items drop constraint if exists fin_product_items_unit_check;
alter table public.fin_product_items
  add constraint fin_product_items_unit_check check (unit in ('kg', 'g', 'l', 'ml', 'un', 'dz', 'm', 'cm', 'm2', 'h', 'min'));
