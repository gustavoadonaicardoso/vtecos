/**
 * ============================================================
 * VÓRTICE CRM — Custos & Precificação (server-only)
 * ============================================================
 * Toda leitura/escrita filtra por tenant_id (a empresa resolvida em
 * requireFinanceAccess). As tabelas fin_* são travadas no banco; só
 * este serviço, com a service role, chega nelas.
 * ============================================================
 */

import { supabaseAdmin as db } from '@/lib/supabase-admin';
import {
  categoryInfo, categoryKey, isBusinessType, presetFor, resolveBusiness, TERM_INFO,
  type BusinessType, type CategoryGroup, type FinBusiness, type IngredientCategoryDef, type Terms,
} from '@/lib/finance/business';
import {
  buildCostContext, computeProductCost, defaultSalePrice, isUnit, monthKey, saleSnapshot,
} from '@/lib/finance/calc';
import type {
  FinChannel, FinCurrency, FinFixedCost, FinIngredient, FinMonthRevenue, FinProduct, FinProductItem, FinSale, FinSettings, FinWorkspace,
} from '@/lib/finance/types';
import { fetchExchangeRates } from '@/lib/finance/fx';
import type { FinanceAccess } from '@/lib/finance/access';

type Row = Record<string, unknown>;
type Parsed<T> = { data: T } | { error: string };

export const DEFAULT_SETTINGS: FinSettings = {
  tax_pct: 6,
  commission_pct: 0,
  target_margin_pct: 20,
  labor_hour_cost: 0,
  expected_monthly_revenue: 0,
  usd_rate: 0,
  eur_rate: 0,
  fx_fee_pct: 3.5,
  fx_updated_at: null,
};

// Canais comuns a qualquer ramo (cada empresa ajusta, renomeia ou apaga).
const DEFAULT_CHANNELS = [
  { name: 'Venda direta / WhatsApp', fee_pct: 0, fixed_fee: 0, extra_cost: 0 },
  { name: 'Cartão (maquininha)', fee_pct: 3, fixed_fee: 0, extra_cost: 0 },
  { name: 'Marketplace / aplicativo', fee_pct: 20, fixed_fee: 0, extra_cost: 0 },
];

// ── Normalização ─────────────────────────────────────────────

const num = (value: unknown, fallback = 0) => {
  if (typeof value === 'string') {
    // "R$ 1.234,56" → 1234.56; "0.5" continua 0.5 (ponto só é milhar quando há vírgula).
    const clean = value.replace(/\s/g, '').replace(/^R\$/i, '').replace(/%$/, '');
    value = clean.includes(',') ? clean.replace(/\./g, '').replace(',', '.') : clean;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const text = (value: unknown, max = 200) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const isDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
const toCurrency = (value: unknown): FinCurrency => {
  const raw = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (raw === 'USD' || raw === 'US$' || raw === 'DOLAR' || raw === 'DÓLAR') return 'USD';
  if (raw === 'EUR' || raw === '€' || raw === 'EURO') return 'EUR';
  return 'BRL';
};

function toSettings(row: Row | null): FinSettings {
  if (!row) return { ...DEFAULT_SETTINGS };
  return {
    tax_pct: num(row.tax_pct, DEFAULT_SETTINGS.tax_pct),
    commission_pct: num(row.commission_pct),
    target_margin_pct: num(row.target_margin_pct, DEFAULT_SETTINGS.target_margin_pct),
    labor_hour_cost: num(row.labor_hour_cost),
    expected_monthly_revenue: num(row.expected_monthly_revenue),
    usd_rate: num(row.usd_rate),
    eur_rate: num(row.eur_rate),
    fx_fee_pct: num(row.fx_fee_pct, DEFAULT_SETTINGS.fx_fee_pct),
    fx_updated_at: (row.fx_updated_at as string) || null,
  };
}

function toIngredient(row: Row): FinIngredient {
  return {
    id: row.id as string,
    name: row.name as string,
    category: row.category as FinIngredient['category'],
    purchase_unit: row.purchase_unit as FinIngredient['purchase_unit'],
    purchase_qty: num(row.purchase_qty, 1),
    purchase_price: num(row.purchase_price),
    currency: toCurrency(row.currency),
    supplier: (row.supplier as string) || '',
    updated_at: row.updated_at as string,
  };
}

function toProduct(row: Row, items: FinProductItem[]): FinProduct {
  const prices = (row.channel_prices && typeof row.channel_prices === 'object' ? row.channel_prices : {}) as Record<string, unknown>;
  return {
    id: row.id as string,
    name: row.name as string,
    category: (row.category as string) || '',
    kind: row.kind === 'base' ? 'base' : 'product',
    yield_qty: num(row.yield_qty, 1),
    yield_unit: (row.yield_unit as string) || 'un',
    prep_minutes: num(row.prep_minutes),
    loss_pct: num(row.loss_pct),
    sale_price: num(row.sale_price),
    channel_prices: Object.fromEntries(Object.entries(prices).map(([key, value]) => [key, num(value)])),
    target_margin_pct: row.target_margin_pct === null || row.target_margin_pct === undefined ? null : num(row.target_margin_pct),
    notes: (row.notes as string) || '',
    active: row.active !== false,
    items,
  };
}

function toItem(row: Row): FinProductItem {
  return {
    id: row.id as string,
    ingredient_id: (row.ingredient_id as string) || null,
    component_product_id: (row.component_product_id as string) || null,
    quantity: num(row.quantity),
    unit: row.unit as FinProductItem['unit'],
  };
}

function toChannel(row: Row): FinChannel {
  return {
    id: row.id as string,
    name: row.name as string,
    fee_pct: num(row.fee_pct),
    fixed_fee: num(row.fixed_fee),
    extra_cost: num(row.extra_cost),
    position: num(row.position),
    active: row.active !== false,
  };
}

function toFixedCost(row: Row): FinFixedCost {
  return {
    id: row.id as string,
    name: row.name as string,
    category: (row.category as string) || 'outros',
    amount: num(row.amount),
    currency: toCurrency(row.currency),
    recurrence: row.recurrence === 'once' ? 'once' : row.recurrence === 'yearly' ? 'yearly' : 'monthly',
    month: (row.month as string) || null,
    active: row.active !== false,
  };
}

function toSale(row: Row): FinSale {
  return {
    id: row.id as string,
    sold_at: row.sold_at as string,
    product_id: (row.product_id as string) || null,
    channel_id: (row.channel_id as string) || null,
    description: (row.description as string) || '',
    quantity: num(row.quantity, 1),
    unit_price: num(row.unit_price),
    discount: num(row.discount),
    unit_cost: num(row.unit_cost),
    fee_amount: num(row.fee_amount),
    tax_amount: num(row.tax_amount),
    source: row.source === 'import' ? 'import' : 'manual',
    created_at: row.created_at as string,
  };
}

// ── Leitura ──────────────────────────────────────────────────

async function loadSettingsRow(tenantId: string): Promise<Row | null> {
  const { data } = await db.from('fin_settings').select('*').eq('tenant_id', tenantId).maybeSingle();
  return (data as Row) || null;
}

async function loadSettings(tenantId: string) {
  return toSettings(await loadSettingsRow(tenantId));
}

/** Ramo, nomes das telas e tipos de insumo da empresa. */
export async function loadBusiness(tenantId: string): Promise<FinBusiness> {
  return resolveBusiness(await loadSettingsRow(tenantId));
}

async function loadChannels(tenantId: string) {
  const { data, error } = await db.from('fin_channels').select('*').eq('tenant_id', tenantId).order('position').order('created_at');
  if (error) throw new Error(error.message);
  if (data && data.length > 0) return data.map(toChannel);

  // Primeiro acesso: canais mais comuns já prontos para editar.
  const { data: seeded, error: seedError } = await db
    .from('fin_channels')
    .insert(DEFAULT_CHANNELS.map((channel, position) => ({ ...channel, position, tenant_id: tenantId })))
    .select();
  if (seedError) throw new Error(seedError.message);
  return (seeded || []).map(toChannel);
}

async function loadProducts(tenantId: string) {
  const [{ data: products, error }, { data: items, error: itemsError }] = await Promise.all([
    db.from('fin_products').select('*').eq('tenant_id', tenantId).order('name'),
    db.from('fin_product_items').select('*').eq('tenant_id', tenantId).order('position'),
  ]);
  if (error) throw new Error(error.message);
  if (itemsError) throw new Error(itemsError.message);
  const byProduct = new Map<string, FinProductItem[]>();
  for (const item of items || []) {
    const list = byProduct.get(item.product_id) || [];
    list.push(toItem(item));
    byProduct.set(item.product_id, list);
  }
  return (products || []).map((row) => toProduct(row, byProduct.get(row.id as string) || []));
}

async function loadIngredients(tenantId: string) {
  const { data, error } = await db.from('fin_ingredients').select('*').eq('tenant_id', tenantId).order('name');
  if (error) throw new Error(error.message);
  return (data || []).map(toIngredient);
}

async function loadFixedCosts(tenantId: string) {
  const { data, error } = await db.from('fin_fixed_costs').select('*').eq('tenant_id', tenantId).order('amount', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []).map(toFixedCost);
}

function monthsBack(count: number) {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() - count, 1);
}

async function loadRevenueHistory(tenantId: string): Promise<FinMonthRevenue[]> {
  const since = monthsBack(6);
  const { data, error } = await db
    .from('fin_sales')
    .select('sold_at, quantity, unit_price, discount')
    .eq('tenant_id', tenantId)
    .gte('sold_at', `${monthKey(since)}-01`);
  if (error) throw new Error(error.message);
  const totals = new Map<string, number>();
  for (const row of data || []) {
    const key = monthKey(row.sold_at as string);
    totals.set(key, (totals.get(key) || 0) + Math.max(0, num(row.quantity) * num(row.unit_price) - num(row.discount)));
  }
  return Array.from(totals.entries()).map(([month, revenue]) => ({ month, revenue })).sort((a, b) => a.month.localeCompare(b.month));
}

export async function loadWorkspace(access: FinanceAccess): Promise<FinWorkspace> {
  const tenantId = access.tenant.id;
  const [settingsRow, ingredients, products, channels, fixedCosts, revenueHistory] = await Promise.all([
    loadSettingsRow(tenantId),
    loadIngredients(tenantId),
    loadProducts(tenantId),
    loadChannels(tenantId),
    loadFixedCosts(tenantId),
    loadRevenueHistory(tenantId),
  ]);
  return {
    tenant: { id: access.tenant.id, name: access.tenant.name, isPlatform: access.tenant.isPlatform },
    settings: toSettings(settingsRow),
    business: resolveBusiness(settingsRow),
    ingredients,
    products,
    channels,
    fixedCosts,
    revenueHistory,
    access: { canManage: access.canManage, canSell: access.canSell, isClient: access.isClient },
  };
}

export async function listSales(tenantId: string, month: string) {
  const [year, monthNumber] = month.split('-').map(Number);
  const end = new Date(year, monthNumber, 1);
  const { data, error } = await db
    .from('fin_sales')
    .select('*')
    .eq('tenant_id', tenantId)
    .gte('sold_at', `${month}-01`)
    .lt('sold_at', `${monthKey(end)}-01`)
    .order('sold_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(5000);
  if (error) throw new Error(error.message);
  return (data || []).map(toSale);
}

export async function listTenantsForStaff() {
  const { data, error } = await db.from('tenants').select('id, name, status, is_platform').order('name');
  if (error) throw new Error(error.message);
  // A própria Vórtice primeiro: é onde ficam os custos do sistema.
  return (data || []).sort((a, b) => Number(b.is_platform === true) - Number(a.is_platform === true));
}

// ── Validação de entrada ─────────────────────────────────────

export function parseSettings(body: Row, current: FinSettings = DEFAULT_SETTINGS): FinSettings {
  const pct = (value: unknown, fallback: number) => Math.min(95, Math.max(0, num(value, fallback)));
  const rate = (value: unknown, fallback: number) => Math.min(1000, Math.max(0, num(value, fallback)));
  const usd_rate = rate(body.usd_rate, current.usd_rate);
  const eur_rate = rate(body.eur_rate, current.eur_rate);
  const ratesChanged = usd_rate !== current.usd_rate || eur_rate !== current.eur_rate;
  return {
    tax_pct: pct(body.tax_pct, DEFAULT_SETTINGS.tax_pct),
    commission_pct: pct(body.commission_pct, 0),
    target_margin_pct: pct(body.target_margin_pct, DEFAULT_SETTINGS.target_margin_pct),
    labor_hour_cost: Math.max(0, num(body.labor_hour_cost)),
    expected_monthly_revenue: Math.max(0, num(body.expected_monthly_revenue)),
    usd_rate,
    eur_rate,
    fx_fee_pct: Math.min(30, Math.max(0, num(body.fx_fee_pct, current.fx_fee_pct))),
    fx_updated_at: ratesChanged ? new Date().toISOString() : current.fx_updated_at,
  };
}

/** Configurações atuais (para mesclar o que o formulário não mandou). */
export async function currentSettings(tenantId: string) {
  return loadSettings(tenantId);
}

/** Busca a cotação de hoje (Banco Central) e grava nas configurações. */
export async function refreshExchangeRates(tenantId: string) {
  const current = await loadSettings(tenantId);
  const rates = await fetchExchangeRates();
  const next: FinSettings = { ...current, usd_rate: rates.usd, eur_rate: rates.eur, fx_updated_at: new Date().toISOString() };
  await saveSettings(tenantId, next);
  return { settings: next, source: rates.source, date: rates.date };
}

/** Tipo do insumo: chave ou nome de um tipo da empresa (planilhas trazem o nome). */
function resolveCategory(value: unknown, categories: IngredientCategoryDef[]) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (categories.length === 0) return /^[a-z0-9_-]{1,40}$/.test(raw) ? raw : 'ingrediente';
  const byKey = categories.find((item) => item.key === raw);
  if (byKey) return byKey.key;
  const folded = normalizeName(raw);
  const byLabel = folded ? categories.find((item) => normalizeName(item.label) === folded || normalizeName(item.label).startsWith(folded)) : null;
  return (byLabel || categories[0]).key;
}

export function parseIngredient(body: Row, categories: IngredientCategoryDef[] = []): Parsed<Omit<FinIngredient, 'id'>> {
  const name = text(body.name, 120);
  if (!name) return { error: 'Informe o nome.' };
  const category = resolveCategory(body.category, categories);
  const purchase_unit = isUnit(body.purchase_unit) ? body.purchase_unit : 'kg';
  const purchase_qty = num(body.purchase_qty, 1);
  const purchase_price = num(body.purchase_price);
  if (purchase_qty <= 0) return { error: `${name}: quantidade da compra deve ser maior que zero.` };
  if (purchase_price < 0) return { error: `${name}: preço inválido.` };
  return { data: { name, category, purchase_unit, purchase_qty, purchase_price, currency: toCurrency(body.currency), supplier: text(body.supplier, 120) } };
}

export function parseChannel(body: Row): Parsed<Omit<FinChannel, 'id' | 'position'>> {
  const name = text(body.name, 80);
  if (!name) return { error: 'Informe o nome do canal.' };
  const fee_pct = num(body.fee_pct);
  if (fee_pct < 0 || fee_pct >= 90) return { error: 'Taxa do canal deve ficar entre 0% e 90%.' };
  return {
    data: { name, fee_pct, fixed_fee: Math.max(0, num(body.fixed_fee)), extra_cost: Math.max(0, num(body.extra_cost)), active: body.active !== false },
  };
}

export function parseFixedCost(body: Row): Parsed<Omit<FinFixedCost, 'id'>> {
  const name = text(body.name, 120);
  if (!name) return { error: 'Informe a descrição da despesa.' };
  const amount = num(body.amount);
  if (amount < 0) return { error: `${name}: valor inválido.` };
  const recurrence = parseRecurrence(body.recurrence);
  let month: string | null = null;
  if (recurrence === 'once') {
    const raw = text(body.month, 10);
    month = /^\d{4}-\d{2}/.test(raw) ? `${raw.slice(0, 7)}-01` : `${monthKey(new Date())}-01`;
  }
  return { data: { name, category: text(body.category, 60) || 'outros', amount, currency: toCurrency(body.currency), recurrence, month, active: body.active !== false } };
}

/** "monthly", "anual", "Só uma vez"... (planilhas trazem em português). */
function parseRecurrence(value: unknown): FinFixedCost['recurrence'] {
  const raw = typeof value === 'string' ? normalizeName(value) : '';
  if (raw === 'yearly' || raw.startsWith('anual') || raw.startsWith('ano') || raw === 'por ano') return 'yearly';
  if (raw === 'once' || raw.startsWith('avuls') || raw.startsWith('uma vez') || raw.startsWith('so uma') || raw.startsWith('unic')) return 'once';
  return 'monthly';
}

export interface ProductInput extends Omit<FinProduct, 'id' | 'items'> {
  items: FinProductItem[];
}

export function parseProduct(body: Row): Parsed<ProductInput> {
  const name = text(body.name, 120);
  if (!name) return { error: 'Informe o nome do produto.' };
  const yield_qty = num(body.yield_qty, 1);
  if (yield_qty <= 0) return { error: 'O rendimento deve ser maior que zero.' };
  const loss_pct = num(body.loss_pct);
  if (loss_pct < 0 || loss_pct >= 100) return { error: 'Perda deve ficar entre 0% e 99%.' };

  const items: FinProductItem[] = [];
  for (const raw of Array.isArray(body.items) ? (body.items as Row[]).slice(0, 200) : []) {
    const quantity = num(raw.quantity);
    if (quantity <= 0) continue;
    if (isUuid(raw.ingredient_id)) {
      items.push({ ingredient_id: raw.ingredient_id, component_product_id: null, quantity, unit: isUnit(raw.unit) ? raw.unit : 'g' });
    } else if (isUuid(raw.component_product_id)) {
      items.push({ ingredient_id: null, component_product_id: raw.component_product_id, quantity, unit: 'un' });
    }
  }

  const prices = body.channel_prices && typeof body.channel_prices === 'object' ? (body.channel_prices as Row) : {};
  const marginRaw = body.target_margin_pct;
  return {
    data: {
      name,
      category: text(body.category, 60),
      kind: body.kind === 'base' ? 'base' : 'product',
      yield_qty,
      yield_unit: text(body.yield_unit, 20) || 'un',
      prep_minutes: Math.max(0, num(body.prep_minutes)),
      loss_pct,
      sale_price: Math.max(0, num(body.sale_price)),
      channel_prices: Object.fromEntries(
        Object.entries(prices).filter(([key, value]) => isUuid(key) && num(value) > 0).map(([key, value]) => [key, num(value)])
      ),
      target_margin_pct: marginRaw === null || marginRaw === undefined || marginRaw === '' ? null : Math.min(90, Math.max(0, num(marginRaw))),
      notes: text(body.notes, 2000),
      active: body.active !== false,
      items,
    },
  };
}

export function parseSaleInput(body: Row) {
  const quantity = num(body.quantity, 1);
  if (quantity <= 0) return { error: 'Quantidade deve ser maior que zero.' } as const;
  const soldAt = isDate(body.sold_at) ? body.sold_at : new Date().toISOString().slice(0, 10);
  const unitPrice = body.unit_price === '' || body.unit_price === undefined || body.unit_price === null ? null : Math.max(0, num(body.unit_price));
  return {
    data: {
      sold_at: soldAt,
      product_id: isUuid(body.product_id) ? body.product_id : null,
      product_name: text(body.product_name, 120),
      channel_id: isUuid(body.channel_id) ? body.channel_id : null,
      channel_name: text(body.channel_name, 80),
      description: text(body.description, 200),
      quantity,
      unit_price: unitPrice,
      discount: Math.max(0, num(body.discount)),
    },
  } as const;
}

// ── Escrita genérica (sempre com tenant_id) ──────────────────

export type SimpleTable = 'fin_ingredients' | 'fin_channels' | 'fin_fixed_costs';

export async function insertRow(table: SimpleTable, tenantId: string, row: Row) {
  const extra: Row = {};
  if (table === 'fin_channels') {
    const { count } = await db.from('fin_channels').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId);
    extra.position = count || 0;
  }
  const { data, error } = await db.from(table).insert({ ...row, ...extra, tenant_id: tenantId }).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateRow(table: SimpleTable, tenantId: string, id: string, row: Row) {
  const changes = table === 'fin_ingredients' ? { ...row, updated_at: new Date().toISOString() } : row;
  const { data, error } = await db.from(table).update(changes).eq('tenant_id', tenantId).eq('id', id).select().maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/** Nomes das fichas que usam um insumo ou preparo (para não apagar receita sem querer). */
async function usedIn(tenantId: string, column: 'ingredient_id' | 'component_product_id', id: string) {
  const { data } = await db.from('fin_product_items').select('product_id').eq('tenant_id', tenantId).eq(column, id);
  const productIds = Array.from(new Set((data || []).map((row) => row.product_id as string)));
  if (productIds.length === 0) return [];
  const { data: products } = await db.from('fin_products').select('name').eq('tenant_id', tenantId).in('id', productIds);
  return (products || []).map((row) => row.name as string);
}

export async function deleteRow(table: SimpleTable | 'fin_products' | 'fin_sales', tenantId: string, id: string): Promise<{ error?: string; status?: number }> {
  if (table === 'fin_ingredients' || table === 'fin_products') {
    const names = await usedIn(tenantId, table === 'fin_ingredients' ? 'ingredient_id' : 'component_product_id', id);
    if (names.length > 0) {
      return { error: `Está em uso nas fichas: ${names.slice(0, 5).join(', ')}${names.length > 5 ? '…' : ''}. Remova de lá primeiro.`, status: 409 };
    }
  }
  const { data, error } = await db.from(table).delete().eq('tenant_id', tenantId).eq('id', id).select('id');
  if (error) return { error: error.message, status: 500 };
  if (!data || data.length === 0) return { error: 'Registro não encontrado.', status: 404 };
  return {};
}

export async function reorderChannels(tenantId: string, ids: string[]) {
  await Promise.all(ids.map((id, position) => db.from('fin_channels').update({ position }).eq('tenant_id', tenantId).eq('id', id)));
}

/**
 * Ramo do negócio, nomes das telas e tipos de insumo.
 * applyPreset: troca de ramo (nomes voltam ao padrão do ramo; tipos em
 * uso continuam). Sem ele, salva os nomes e tipos editados à mão.
 */
export async function saveBusiness(tenantId: string, body: Row): Promise<{ data: FinBusiness } | { error: string }> {
  const current = await loadBusiness(tenantId);
  const type: BusinessType | null = isBusinessType(body.type) ? body.type : current.type;
  if (!type) return { error: 'Escolha o ramo do negócio.' };
  const preset = presetFor(type);
  const { data: used } = await db.from('fin_ingredients').select('category').eq('tenant_id', tenantId);
  const usage = new Map<string, number>();
  for (const row of used || []) usage.set(String(row.category), (usage.get(String(row.category)) || 0) + 1);

  const terms: Partial<Terms> = {};
  let categories: IngredientCategoryDef[];
  if (body.applyPreset === true) {
    // Tipos já usados por algum insumo continuam existindo.
    const kept = [...usage.keys()].filter((key) => !preset.categories.some((item) => item.key === key)).map((key) => categoryInfo(current, key));
    categories = [...preset.categories, ...kept];
  } else {
    const rawTerms = body.terms && typeof body.terms === 'object' ? (body.terms as Row) : {};
    for (const info of TERM_INFO) {
      const value = text(rawTerms[info.key], 40);
      if (value && value !== preset.terms[info.key]) terms[info.key] = value;
    }
    const list = Array.isArray(body.categories) ? (body.categories as Row[]) : current.categories;
    const seen = new Set<string>();
    categories = [];
    for (const item of list.slice(0, 20)) {
      const label = text(item?.label, 40);
      if (!label) continue;
      let key = typeof item?.key === 'string' && /^[a-z0-9_-]{1,40}$/.test(item.key) ? item.key : categoryKey(label);
      while (seen.has(key)) key = `${key.slice(0, 36)}_${seen.size}`;
      seen.add(key);
      const group = ['material', 'packaging', 'other'].includes(String(item?.group)) ? (item.group as CategoryGroup) : 'material';
      categories.push({ key, label, group });
    }
    if (categories.length === 0) return { error: 'Deixe pelo menos um tipo.' };
    const missing = [...usage.entries()].filter(([key]) => !categories.some((item) => item.key === key));
    if (missing.length > 0) {
      const [key, count] = missing[0];
      return { error: `O tipo "${categoryInfo(current, key).label}" está em ${count} item(ns). Mude o tipo deles antes de apagar.` };
    }
  }

  const { error } = await db.from('fin_settings').upsert(
    { tenant_id: tenantId, business_type: type, terms, ingredient_categories: categories, updated_at: new Date().toISOString() },
    { onConflict: 'tenant_id' }
  );
  if (error) return { error: error.message };
  if (body.applyPreset === true && preset.channels) await swapUntouchedChannels(tenantId, preset.channels);
  return { data: resolveBusiness({ business_type: type, terms, ingredient_categories: categories }) };
}

/**
 * Troca os canais criados no primeiro acesso pelos do ramo (ex.: formas
 * de cobrança de quem vende sistema) -- só se a empresa ainda não mexeu
 * neles e nenhuma venda os usa.
 */
async function swapUntouchedChannels(tenantId: string, channels: NonNullable<ReturnType<typeof presetFor>['channels']>) {
  const current = await loadChannels(tenantId);
  const untouched = current.length === DEFAULT_CHANNELS.length && current.every((channel) => {
    const original = DEFAULT_CHANNELS.find((item) => item.name === channel.name);
    return original && original.fee_pct === channel.fee_pct && original.fixed_fee === channel.fixed_fee && original.extra_cost === channel.extra_cost && channel.active;
  });
  if (!untouched) return;
  const { count } = await db.from('fin_sales').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).not('channel_id', 'is', null);
  if (count) return;
  const { error } = await db.from('fin_channels').delete().eq('tenant_id', tenantId).in('id', current.map((channel) => channel.id));
  if (error) return;
  await db.from('fin_channels').insert(channels.map((channel, position) => ({ ...channel, position, tenant_id: tenantId })));
}

export async function saveSettings(tenantId: string, settings: FinSettings) {
  const { error } = await db.from('fin_settings').upsert({ ...settings, tenant_id: tenantId, updated_at: new Date().toISOString() }, { onConflict: 'tenant_id' });
  if (error) throw new Error(error.message);
  return settings;
}

// ── Fichas técnicas ──────────────────────────────────────────

/** Confere que insumos/preparos são desta empresa e que não há ciclo. */
async function validateItems(tenantId: string, productId: string | null, items: FinProductItem[]): Promise<string | null> {
  const ingredientIds = Array.from(new Set(items.map((item) => item.ingredient_id).filter(Boolean))) as string[];
  const componentIds = Array.from(new Set(items.map((item) => item.component_product_id).filter(Boolean))) as string[];

  if (ingredientIds.length > 0) {
    const { data } = await db.from('fin_ingredients').select('id').eq('tenant_id', tenantId).in('id', ingredientIds);
    if ((data || []).length !== ingredientIds.length) return 'Algum insumo da ficha não existe mais.';
  }
  if (componentIds.length === 0) return null;
  if (productId && componentIds.includes(productId)) return 'Um produto não pode usar a si mesmo como preparo.';

  const products = await loadProducts(tenantId);
  const graph = new Map(products.map((product) => [product.id, product.items.map((item) => item.component_product_id).filter(Boolean) as string[]]));
  if (componentIds.some((id) => !graph.has(id))) return 'Algum preparo da ficha não existe mais.';
  if (!productId) return null;
  graph.set(productId, componentIds);

  // Algum preparo usado aqui chega de volta neste produto?
  const reaches = (from: string, seen = new Set<string>()): boolean => {
    if (from === productId) return true;
    if (seen.has(from)) return false;
    seen.add(from);
    return (graph.get(from) || []).some((next) => reaches(next, seen));
  };
  if (componentIds.some((id) => reaches(id))) return 'Esses preparos formam um ciclo (um usa o outro).';
  return null;
}

export async function saveProduct(tenantId: string, productId: string | null, input: ProductInput) {
  const problem = await validateItems(tenantId, productId, input.items);
  if (problem) return { error: problem };

  const { items, ...fields } = input;
  let id = productId;
  if (id) {
    const { data, error } = await db.from('fin_products').update({ ...fields, updated_at: new Date().toISOString() }).eq('tenant_id', tenantId).eq('id', id).select('id').maybeSingle();
    if (error) return { error: error.message };
    if (!data) return { error: 'Produto não encontrado.' };
  } else {
    const { data, error } = await db.from('fin_products').insert({ ...fields, tenant_id: tenantId }).select('id').single();
    if (error) return { error: error.message };
    id = data.id as string;
  }

  const { error: deleteError } = await db.from('fin_product_items').delete().eq('tenant_id', tenantId).eq('product_id', id);
  if (deleteError) return { error: deleteError.message };
  if (items.length > 0) {
    const { error: insertError } = await db.from('fin_product_items').insert(
      items.map((item, position) => ({ ...item, position, product_id: id, tenant_id: tenantId }))
    );
    if (insertError) return { error: insertError.message };
  }

  const saved = (await loadProducts(tenantId)).find((product) => product.id === id);
  return { data: saved };
}

// ── Vendas ───────────────────────────────────────────────────

type SaleInput = Extract<ReturnType<typeof parseSaleInput>, { data: unknown }>['data'];

const normalizeName = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

/** Monta as linhas de venda com o custo do momento (vários de uma vez, p/ importação). */
export async function createSales(
  tenantId: string,
  createdBy: string,
  inputs: SaleInput[],
  source: 'manual' | 'import'
) {
  const [settings, ingredients, products, channels] = await Promise.all([
    loadSettings(tenantId), loadIngredients(tenantId), loadProducts(tenantId), loadChannels(tenantId),
  ]);
  const ctx = buildCostContext(products, ingredients, settings);
  const productById = new Map(products.map((product) => [product.id, product]));
  const productByName = new Map(products.map((product) => [normalizeName(product.name), product]));
  const channelById = new Map(channels.map((channel) => [channel.id, channel]));
  const channelByName = new Map(channels.map((channel) => [normalizeName(channel.name), channel]));
  const unitCostCache = new Map<string, number>();

  const rows: Row[] = [];
  const errors: { row: number; message: string }[] = [];

  inputs.forEach((input, index) => {
    const product = (input.product_id && productById.get(input.product_id))
      || (input.product_name ? productByName.get(normalizeName(input.product_name)) : undefined)
      || null;
    const channel = (input.channel_id && channelById.get(input.channel_id))
      || (input.channel_name ? channelByName.get(normalizeName(input.channel_name)) : undefined)
      || null;

    if (input.product_id && !product) {
      errors.push({ row: index + 1, message: 'Produto não encontrado.' });
      return;
    }
    if (!product && !input.description && !input.product_name) {
      errors.push({ row: index + 1, message: 'Informe o produto ou uma descrição.' });
      return;
    }

    let unitCost = 0;
    if (product) {
      if (!unitCostCache.has(product.id)) unitCostCache.set(product.id, computeProductCost(product, ctx).unitCost);
      unitCost = unitCostCache.get(product.id) || 0;
    }
    const unitPrice = input.unit_price ?? (product ? defaultSalePrice(product, channel?.id ?? null) : 0);
    const snapshot = saleSnapshot({ quantity: input.quantity, unitPrice, discount: input.discount, unitCost, channel, settings });

    rows.push({
      tenant_id: tenantId,
      sold_at: input.sold_at,
      product_id: product?.id ?? null,
      channel_id: channel?.id ?? null,
      description: product ? input.description : (input.description || input.product_name),
      quantity: input.quantity,
      unit_price: unitPrice,
      discount: input.discount,
      ...snapshot,
      source,
      created_by: createdBy,
    });
  });

  let inserted: FinSale[] = [];
  for (let start = 0; start < rows.length; start += 500) {
    // tenant-scope: ok (cada linha montada acima leva tenant_id)
    const { data, error } = await db.from('fin_sales').insert(rows.slice(start, start + 500)).select();
    if (error) throw new Error(error.message);
    inserted = inserted.concat((data || []).map(toSale));
  }
  return { inserted, errors };
}

// ── Importação em lote ───────────────────────────────────────

export async function importRows(tenantId: string, kind: 'ingredients' | 'fixed_costs', rows: Row[]) {
  const errors: { row: number; message: string }[] = [];
  const valid: Row[] = [];
  const { categories } = await loadBusiness(tenantId);
  rows.slice(0, 2000).forEach((row, index) => {
    const parsed = kind === 'ingredients' ? parseIngredient(row, categories) : parseFixedCost(row);
    if ('error' in parsed) errors.push({ row: index + 1, message: parsed.error });
    else valid.push({ ...parsed.data, tenant_id: tenantId });
  });

  let inserted = 0;
  let updated = 0;
  if (kind === 'ingredients' && valid.length > 0) {
    // Insumo com o mesmo nome é atualizado (preço novo da planilha), não duplicado.
    const existing = await loadIngredients(tenantId);
    const byName = new Map(existing.map((item) => [normalizeName(item.name), item.id]));
    const toInsert: Row[] = [];
    for (const row of valid) {
      const id = byName.get(normalizeName(row.name as string));
      if (id) {
        const { tenant_id: _ignored, ...changes } = row;
        void _ignored;
        await db.from('fin_ingredients').update({ ...changes, updated_at: new Date().toISOString() }).eq('tenant_id', tenantId).eq('id', id);
        updated += 1;
      } else {
        toInsert.push(row);
        byName.set(normalizeName(row.name as string), 'pending');
      }
    }
    if (toInsert.length > 0) {
      // tenant-scope: ok (cada linha de valid/toInsert leva tenant_id)
      const { error } = await db.from('fin_ingredients').insert(toInsert);
      if (error) throw new Error(error.message);
      inserted = toInsert.length;
    }
  } else if (valid.length > 0) {
    // tenant-scope: ok (cada linha de valid leva tenant_id)
    const { error } = await db.from('fin_fixed_costs').insert(valid);
    if (error) throw new Error(error.message);
    inserted = valid.length;
  }
  return { inserted, updated, errors };
}

// ── Vórtice: clientes e planos do próprio sistema ───────────

const BILL_PREFIX = 'Mensalidade · ';

export interface PlatformSummary {
  plans: { id: string; name: string; price: number; active: boolean; clients: number; mrr: number; hasProduct: boolean }[];
  clients: number;
  /** Clientes ativos sem plano ou com plano de preço zero. */
  unpaid: number;
  mrr: number;
  /** Mensalidades já lançadas no mês pedido. */
  billed: number;
}

/** Empresas clientes ativas com o plano de cada uma (dados do Painel Master). */
async function loadPlatformClients() {
  const [{ data: tenants, error }, { data: plans, error: plansError }] = await Promise.all([
    // tenant-scope: ok (só a planilha da própria Vórtice chega aqui: lista os clientes dela)
    db.from('tenants').select('id, name, status, plan_id').eq('is_platform', false).eq('status', 'ACTIVE').order('name'),
    // tenant-scope: ok (planos são da plataforma, não de uma empresa)
    db.from('plans').select('id, name, price, active').order('price'),
  ]);
  if (error) throw new Error(error.message);
  if (plansError) throw new Error(plansError.message);
  const planById = new Map((plans || []).map((plan) => [plan.id as string, { id: plan.id as string, name: plan.name as string, price: num(plan.price), active: plan.active !== false }]));
  return {
    plans: [...planById.values()],
    clients: (tenants || []).map((tenant) => ({ id: tenant.id as string, name: tenant.name as string, plan: tenant.plan_id ? planById.get(tenant.plan_id as string) || null : null })),
  };
}

async function billedThisMonth(tenantId: string, month: string) {
  const sales = await listSales(tenantId, month);
  return new Set(sales.filter((sale) => sale.description.startsWith(BILL_PREFIX)).map((sale) => sale.description));
}

export async function platformSummary(tenantId: string, month: string): Promise<PlatformSummary> {
  const [{ plans, clients }, products, billed] = await Promise.all([loadPlatformClients(), loadProducts(tenantId), billedThisMonth(tenantId, month)]);
  const productNames = new Set(products.map((product) => normalizeName(product.name)));
  const rows = plans.map((plan) => {
    const count = clients.filter((client) => client.plan?.id === plan.id).length;
    return { ...plan, clients: count, mrr: count * plan.price, hasProduct: productNames.has(normalizeName(plan.name)) };
  });
  return {
    plans: rows,
    clients: clients.length,
    unpaid: clients.filter((client) => !client.plan || client.plan.price <= 0).length,
    mrr: rows.reduce((sum, plan) => sum + plan.mrr, 0),
    billed: billed.size,
  };
}

/** Cria um plano em "Planos" para cada plano do Painel Master que ainda não tem. */
export async function importPlatformPlans(tenantId: string) {
  const [{ plans }, products] = await Promise.all([loadPlatformClients(), loadProducts(tenantId)]);
  const existing = new Set(products.map((product) => normalizeName(product.name)));
  let created = 0;
  for (const plan of plans.filter((item) => item.active && !existing.has(normalizeName(item.name)))) {
    const result = await saveProduct(tenantId, null, {
      name: plan.name, category: 'Planos do sistema', kind: 'product', yield_qty: 1, yield_unit: 'cliente', prep_minutes: 0, loss_pct: 0,
      sale_price: plan.price, channel_prices: {}, target_margin_pct: null, notes: '', active: true, items: [],
    });
    if ('error' in result && result.error) throw new Error(result.error);
    created += 1;
  }
  return { created };
}

/** Lança a mensalidade de cada cliente ativo do mês (sem repetir quem já foi lançado). */
export async function billPlatformMonth(tenantId: string, createdBy: string, month: string) {
  const [{ clients }, billed, channels] = await Promise.all([loadPlatformClients(), billedThisMonth(tenantId, month), loadChannels(tenantId)]);
  const channel = channels.find((item) => item.active) || null;
  const inputs = clients
    .filter((client) => client.plan && client.plan.price > 0 && !billed.has(`${BILL_PREFIX}${client.name}`))
    .map((client) => ({
      sold_at: `${month}-01`,
      product_id: null,
      product_name: client.plan!.name,
      channel_id: channel?.id ?? null,
      channel_name: '',
      description: `${BILL_PREFIX}${client.name}`,
      quantity: 1,
      unit_price: client.plan!.price,
      discount: 0,
    }));
  if (inputs.length === 0) return { inserted: 0, skipped: billed.size };
  const result = await createSales(tenantId, createdBy, inputs, 'manual');
  return { inserted: result.inserted.length, skipped: billed.size };
}

export const mappers = { toIngredient, toChannel, toFixedCost };
