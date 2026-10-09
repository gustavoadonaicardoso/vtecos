/**
 * ============================================================
 * Custos & Precificação — motor de cálculo (puro)
 * ============================================================
 * Mesmo código no navegador (prévia ao editar) e no servidor (retrato
 * do custo no momento da venda).
 *
 * Custo da ficha técnica (por lote/receita):
 *   materiais = Σ insumos + Σ preparos-base
 *   perda     = materiais × perda%
 *   mão de obra = custo da hora × minutos de preparo / 60
 *   custo unitário = (materiais + perda + mão de obra) / rendimento
 *
 * Preço (método do markup divisor, o padrão do SEBRAE):
 *   preço = custo variável unitário / (1 − (impostos% + taxas do canal%
 *           + comissão% + despesas fixas% + margem desejada%))
 *   despesas fixas% = despesas fixas do mês / faturamento médio.
 *
 * Moeda: despesas e compras em dólar/euro viram reais pela cotação das
 * configurações + IOF/spread do cartão. Despesa anual entra no mês como
 * 1/12 do valor (a reserva que você precisa guardar todo mês).
 * ============================================================
 */

import { categoryInfo, type IngredientCategoryDef } from './business';
import type {
  FinChannel, FinCurrency, FinFixedCost, FinIngredient, FinMonthRevenue, FinProduct, FinSale, FinSettings, FinUnit,
} from './types';

export type BaseUnit = 'g' | 'ml' | 'un' | 'cm' | 'm2' | 'min' | 'mb';

export const UNIT_INFO: Record<FinUnit, { base: BaseUnit; factor: number; label: string }> = {
  kg: { base: 'g', factor: 1000, label: 'kg' },
  g: { base: 'g', factor: 1, label: 'g' },
  l: { base: 'ml', factor: 1000, label: 'litro' },
  ml: { base: 'ml', factor: 1, label: 'ml' },
  un: { base: 'un', factor: 1, label: 'unidade' },
  dz: { base: 'un', factor: 12, label: 'dúzia' },
  mil: { base: 'un', factor: 1000, label: 'mil unidades' },
  mi: { base: 'un', factor: 1_000_000, label: 'milhão de unidades' },
  m: { base: 'cm', factor: 100, label: 'metro' },
  cm: { base: 'cm', factor: 1, label: 'cm' },
  m2: { base: 'm2', factor: 1, label: 'm²' },
  h: { base: 'min', factor: 60, label: 'hora' },
  min: { base: 'min', factor: 1, label: 'minuto' },
  mb: { base: 'mb', factor: 1, label: 'MB' },
  gb: { base: 'mb', factor: 1000, label: 'GB' },
};

/** Como mostrar o custo de cada família de unidade ("R$ 4,50 / kg"). */
export const BASE_DISPLAY: Record<BaseUnit, { per: number; label: string }> = {
  g: { per: 1000, label: 'kg' },
  ml: { per: 1000, label: 'litro' },
  un: { per: 1, label: 'un' },
  cm: { per: 100, label: 'metro' },
  m2: { per: 1, label: 'm²' },
  min: { per: 60, label: 'hora' },
  mb: { per: 1000, label: 'GB' },
};

export const UNITS = Object.keys(UNIT_INFO) as FinUnit[];

export function isUnit(value: unknown): value is FinUnit {
  return typeof value === 'string' && value in UNIT_INFO;
}

/** Unidades em que um insumo comprado em `unit` pode ser usado na receita. */
export function compatibleUnits(unit: FinUnit): FinUnit[] {
  return UNITS.filter((item) => UNIT_INFO[item].base === UNIT_INFO[unit].base);
}

const round = (value: number, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

// ── Moeda ────────────────────────────────────────────────────

export const CURRENCIES: { code: FinCurrency; label: string; symbol: string }[] = [
  { code: 'BRL', label: 'Real (R$)', symbol: 'R$' },
  { code: 'USD', label: 'Dólar (US$)', symbol: 'US$' },
  { code: 'EUR', label: 'Euro (€)', symbol: '€' },
];

export type FxSettings = Pick<FinSettings, 'usd_rate' | 'eur_rate' | 'fx_fee_pct'>;

/** Reais por 1 unidade da moeda, já com IOF/spread (0 = sem cotação). */
export function currencyRate(currency: FinCurrency | undefined, fx: FxSettings | undefined) {
  if (!currency || currency === 'BRL') return 1;
  const rate = currency === 'USD' ? fx?.usd_rate ?? 0 : fx?.eur_rate ?? 0;
  return rate > 0 ? rate * (1 + (fx?.fx_fee_pct ?? 0) / 100) : 0;
}

export function toBRL(amount: number, currency: FinCurrency | undefined, fx: FxSettings | undefined) {
  return amount * currencyRate(currency, fx);
}

/** Moeda estrangeira sem cotação informada (o valor em reais sai zerado). */
export function missingRate(currency: FinCurrency | undefined, fx: FxSettings | undefined) {
  return Boolean(currency && currency !== 'BRL' && currencyRate(currency, fx) === 0);
}

export const formatCurrency = (value: number, currency: FinCurrency = 'BRL') =>
  (Number.isFinite(value) ? value : 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency,
    // Preços de API costumam ter mais casas (US$ 0,0035 por mensagem).
    maximumFractionDigits: Math.abs(value) > 0 && Math.abs(value) < 1 ? 4 : 2,
  });

// ── Insumos ──────────────────────────────────────────────────

type CostSource = Pick<FinIngredient, 'purchase_unit' | 'purchase_qty' | 'purchase_price'> & { currency?: FinCurrency };

/** Custo em reais por unidade-base (g, ml, un...) de um insumo. */
export function ingredientBaseCost(ingredient: CostSource, fx?: FxSettings) {
  const baseQty = ingredient.purchase_qty * UNIT_INFO[ingredient.purchase_unit].factor;
  return baseQty > 0 ? toBRL(ingredient.purchase_price, ingredient.currency, fx) / baseQty : 0;
}

/** Custo de `quantity` `unit` de um insumo (null se as unidades não combinam). */
export function ingredientCostFor(ingredient: FinIngredient, quantity: number, unit: FinUnit, fx?: FxSettings) {
  if (UNIT_INFO[unit].base !== UNIT_INFO[ingredient.purchase_unit].base) return null;
  return quantity * UNIT_INFO[unit].factor * ingredientBaseCost(ingredient, fx);
}

/**
 * Custo legível na unidade em que a pessoa pensa: "R$ 4,50 / kg",
 * "R$ 0,12 / GB"; coisas baratinhas por unidade (mensagens, tokens)
 * aparecem por mil ou por milhão.
 */
export function unitCostLabel(ingredient: CostSource, fx?: FxSettings) {
  const base = UNIT_INFO[ingredient.purchase_unit].base;
  const perBase = ingredientBaseCost(ingredient, fx);
  let { per, label } = BASE_DISPLAY[base];
  if (base === 'un' && perBase > 0 && perBase < 0.01) {
    [per, label] = perBase * 1000 >= 0.01 ? [1000, 'mil'] : [1_000_000, 'milhão'];
  }
  return `${formatCurrency(perBase * per)} / ${label}`;
}

export interface CostLine {
  key: string;
  name: string;
  /** Chave do tipo do insumo, ou 'preparo' (parte pronta usada no item). */
  kind: string;
  quantity: number;
  unitLabel: string;
  cost: number;
  problem?: string;
}

export interface ProductCost {
  lines: CostLine[];
  ingredients: number;
  packaging: number;
  other: number;
  bases: number;
  materials: number;
  loss: number;
  labor: number;
  batchTotal: number;
  unitCost: number;
  warnings: string[];
}

export interface CostContext {
  products: Map<string, FinProduct>;
  ingredients: Map<string, FinIngredient>;
  settings: FinSettings;
  /** Tipos de insumo da empresa (definem o que é material, embalagem ou outros). */
  categories: IngredientCategoryDef[];
}

export function buildCostContext(products: FinProduct[], ingredients: FinIngredient[], settings: FinSettings, categories: IngredientCategoryDef[] = []): CostContext {
  return {
    products: new Map(products.map((product) => [product.id, product])),
    ingredients: new Map(ingredients.map((ingredient) => [ingredient.id, ingredient])),
    settings,
    categories,
  };
}

const MAX_DEPTH = 6;

export function computeProductCost(product: FinProduct, ctx: CostContext, stack: string[] = []): ProductCost {
  const result: ProductCost = {
    lines: [], ingredients: 0, packaging: 0, other: 0, bases: 0,
    materials: 0, loss: 0, labor: 0, batchTotal: 0, unitCost: 0, warnings: [],
  };

  product.items.forEach((item, index) => {
    const key = item.id || `${index}`;
    if (item.ingredient_id) {
      const ingredient = ctx.ingredients.get(item.ingredient_id);
      if (!ingredient) {
        result.lines.push({ key, name: 'Insumo removido', kind: 'outro', quantity: item.quantity, unitLabel: item.unit, cost: 0, problem: 'Insumo não existe mais' });
        result.warnings.push('Há um insumo removido na ficha.');
        return;
      }
      const cost = ingredientCostFor(ingredient, item.quantity, item.unit, ctx.settings);
      const line: CostLine = {
        key, name: ingredient.name, kind: ingredient.category, quantity: item.quantity, unitLabel: item.unit, cost: cost ?? 0,
      };
      if (cost === null) {
        line.problem = `Comprado em ${UNIT_INFO[ingredient.purchase_unit].label}; use ${compatibleUnits(ingredient.purchase_unit).join('/')}`;
        result.warnings.push(`${ingredient.name}: unidade incompatível.`);
      }
      if (ingredient.purchase_price <= 0) result.warnings.push(`${ingredient.name}: sem preço de compra.`);
      else if (missingRate(ingredient.currency, ctx.settings)) result.warnings.push(`${ingredient.name}: falta a cotação do ${ingredient.currency === 'EUR' ? 'euro' : 'dólar'}.`);
      result.lines.push(line);
      const group = categoryInfo({ categories: ctx.categories }, ingredient.category).group;
      if (group === 'packaging') result.packaging += line.cost;
      else if (group === 'other') result.other += line.cost;
      else result.ingredients += line.cost;
      return;
    }

    if (item.component_product_id) {
      const component = ctx.products.get(item.component_product_id);
      if (!component) {
        result.lines.push({ key, name: 'Preparo removido', kind: 'preparo', quantity: item.quantity, unitLabel: '', cost: 0, problem: 'Preparo não existe mais' });
        result.warnings.push('Há um preparo removido na ficha.');
        return;
      }
      if (stack.includes(component.id) || component.id === product.id || stack.length >= MAX_DEPTH) {
        result.lines.push({ key, name: component.name, kind: 'preparo', quantity: item.quantity, unitLabel: component.yield_unit, cost: 0, problem: 'Uso circular de preparos' });
        result.warnings.push(`${component.name}: uso circular.`);
        return;
      }
      const componentCost = computeProductCost(component, ctx, [...stack, product.id]);
      const cost = componentCost.unitCost * item.quantity;
      result.lines.push({ key, name: component.name, kind: 'preparo', quantity: item.quantity, unitLabel: component.yield_unit, cost });
      result.bases += cost;
      for (const warning of componentCost.warnings) result.warnings.push(`${component.name} › ${warning}`);
    }
  });

  result.materials = result.ingredients + result.packaging + result.other + result.bases;
  result.loss = result.materials * (product.loss_pct / 100);
  result.labor = (ctx.settings.labor_hour_cost * product.prep_minutes) / 60;
  result.batchTotal = result.materials + result.loss + result.labor;
  result.unitCost = product.yield_qty > 0 ? result.batchTotal / product.yield_qty : 0;
  result.warnings = Array.from(new Set(result.warnings));
  return result;
}

// ── Despesas fixas e faturamento ─────────────────────────────

export function monthKey(date: Date | string) {
  if (typeof date === 'string') return date.slice(0, 7);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** Quanto uma despesa pesa por mês, em reais (anual = 1/12; avulsa = o valor todo). */
export function fixedCostMonthly(cost: Pick<FinFixedCost, 'amount' | 'currency' | 'recurrence'>, fx?: FxSettings) {
  const value = toBRL(cost.amount, cost.currency, fx);
  return cost.recurrence === 'yearly' ? value / 12 : value;
}

const isRecurring = (cost: FinFixedCost) => cost.recurrence === 'monthly' || cost.recurrence === 'yearly';

/** Despesas fixas (mensais + 1/12 das anuais) + avulsas lançadas no mês (YYYY-MM). */
export function fixedCostsForMonth(costs: FinFixedCost[], month: string, fx?: FxSettings) {
  return costs
    .filter((cost) => cost.active && (isRecurring(cost) || (cost.month || '').slice(0, 7) === month))
    .reduce((sum, cost) => sum + fixedCostMonthly(cost, fx), 0);
}

/** Despesas fixas de um mês normal (mensais + 1/12 das anuais), em reais. */
export function monthlyFixedCosts(costs: FinFixedCost[], fx?: FxSettings) {
  return costs.filter((cost) => cost.active && isRecurring(cost)).reduce((sum, cost) => sum + fixedCostMonthly(cost, fx), 0);
}

/**
 * Base para ratear as despesas fixas: média dos últimos 3 meses com venda
 * (sem contar o mês corrente, ainda incompleto); sem histórico, usa o
 * faturamento esperado informado nas configurações.
 */
export function revenueBase(history: FinMonthRevenue[], settings: FinSettings, currentMonth: string) {
  const closed = history.filter((item) => item.month < currentMonth && item.revenue > 0).sort((a, b) => b.month.localeCompare(a.month)).slice(0, 3);
  if (closed.length > 0) {
    return { value: closed.reduce((sum, item) => sum + item.revenue, 0) / closed.length, source: 'history' as const, months: closed.length };
  }
  return { value: settings.expected_monthly_revenue, source: 'expected' as const, months: 0 };
}

export function fixedCostPct(fixedMonthly: number, base: number) {
  return base > 0 ? (fixedMonthly / base) * 100 : 0;
}

// ── Preço por canal ──────────────────────────────────────────

export interface ChannelPricing {
  channel: FinChannel;
  unitVariableCost: number;
  variablePct: number;
  fixedPct: number;
  marginPct: number;
  suggestedPrice: number | null;
  roundedPrice: number | null;
  currentPrice: number;
  analysis: PriceAnalysis | null;
}

export interface PriceAnalysis {
  price: number;
  fees: number;
  taxes: number;
  contribution: number;
  contributionPct: number;
  fixedShare: number;
  netProfit: number;
  netMarginPct: number;
  markup: number;
}

export function channelVariablePct(settings: FinSettings, channel: Pick<FinChannel, 'fee_pct'>) {
  return settings.tax_pct + settings.commission_pct + channel.fee_pct;
}

export function analyzePrice(price: number, unitCost: number, settings: FinSettings, channel: FinChannel, fixedPct: number): PriceAnalysis {
  const unitVariableCost = unitCost + channel.extra_cost + channel.fixed_fee;
  const taxes = price * (settings.tax_pct / 100);
  const fees = price * ((settings.commission_pct + channel.fee_pct) / 100);
  const contribution = price - unitVariableCost - taxes - fees;
  const fixedShare = price * (fixedPct / 100);
  const netProfit = contribution - fixedShare;
  return {
    price,
    fees,
    taxes,
    contribution,
    contributionPct: price > 0 ? (contribution / price) * 100 : 0,
    fixedShare,
    netProfit,
    netMarginPct: price > 0 ? (netProfit / price) * 100 : 0,
    markup: unitVariableCost > 0 ? price / unitVariableCost : 0,
  };
}

/** Arredonda para cima em múltiplos de R$ 0,50 (preço de vitrine). */
export function roundPrice(value: number) {
  return Math.ceil(value * 2 - 1e-9) / 2;
}

export function priceForChannel(
  product: FinProduct,
  unitCost: number,
  channel: FinChannel,
  settings: FinSettings,
  fixedPct: number
): ChannelPricing {
  const marginPct = product.target_margin_pct ?? settings.target_margin_pct;
  const variablePct = channelVariablePct(settings, channel);
  const unitVariableCost = unitCost + channel.extra_cost + channel.fixed_fee;
  const divisor = 1 - (variablePct + fixedPct + marginPct) / 100;
  const suggestedPrice = divisor > 0.05 ? unitVariableCost / divisor : null;
  const currentPrice = Number(product.channel_prices?.[channel.id] ?? 0) || product.sale_price;
  return {
    channel,
    unitVariableCost,
    variablePct,
    fixedPct,
    marginPct,
    suggestedPrice,
    roundedPrice: suggestedPrice === null ? null : roundPrice(suggestedPrice),
    currentPrice,
    analysis: currentPrice > 0 ? analyzePrice(currentPrice, unitCost, settings, channel, fixedPct) : null,
  };
}

/** Preço que a venda usa quando não foi digitado: preço do canal ou de balcão. */
export function defaultSalePrice(product: FinProduct, channelId: string | null) {
  const channelPrice = channelId ? Number(product.channel_prices?.[channelId] ?? 0) : 0;
  return channelPrice > 0 ? channelPrice : product.sale_price;
}

// ── Vendas: retrato no momento da venda ─────────────────────

export function saleSnapshot(params: {
  quantity: number;
  unitPrice: number;
  discount: number;
  unitCost: number;
  channel: FinChannel | null;
  settings: FinSettings;
}) {
  const { quantity, unitPrice, discount, unitCost, channel, settings } = params;
  const net = Math.max(0, quantity * unitPrice - discount);
  const feePct = settings.commission_pct + (channel?.fee_pct ?? 0);
  return {
    unit_cost: round(unitCost + (channel?.extra_cost ?? 0), 4),
    fee_amount: round(net * (feePct / 100) + quantity * (channel?.fixed_fee ?? 0)),
    tax_amount: round(net * (settings.tax_pct / 100)),
  };
}

// ── Resultado do mês ─────────────────────────────────────────

export interface MonthResult {
  revenue: number;
  cmv: number;
  fees: number;
  taxes: number;
  contribution: number;
  contributionPct: number;
  fixed: number;
  netProfit: number;
  netMarginPct: number;
  breakEvenRevenue: number | null;
  breakEvenProgress: number | null;
  salesCount: number;
  unitsSold: number;
  averageTicket: number;
  daily: { day: string; revenue: number; contribution: number; cumulativeProfit: number }[];
  byProduct: { id: string; name: string; quantity: number; revenue: number; contribution: number; marginPct: number }[];
  byChannel: { id: string; name: string; revenue: number; contribution: number }[];
}

export function saleNet(sale: Pick<FinSale, 'quantity' | 'unit_price' | 'discount'>) {
  return Math.max(0, sale.quantity * sale.unit_price - sale.discount);
}

export function saleContribution(sale: FinSale) {
  return saleNet(sale) - sale.quantity * sale.unit_cost - sale.fee_amount - sale.tax_amount;
}

export function computeMonthResult(
  sales: FinSale[],
  fixed: number,
  month: string,
  names: { products: Map<string, string>; channels: Map<string, string> }
): MonthResult {
  const revenue = sales.reduce((sum, sale) => sum + saleNet(sale), 0);
  const cmv = sales.reduce((sum, sale) => sum + sale.quantity * sale.unit_cost, 0);
  const fees = sales.reduce((sum, sale) => sum + sale.fee_amount, 0);
  const taxes = sales.reduce((sum, sale) => sum + sale.tax_amount, 0);
  const contribution = revenue - cmv - fees - taxes;
  const contributionPct = revenue > 0 ? (contribution / revenue) * 100 : 0;
  const netProfit = contribution - fixed;
  const breakEvenRevenue = contributionPct > 0 ? fixed / (contributionPct / 100) : null;

  const [year, monthNumber] = month.split('-').map(Number);
  const daysInMonth = new Date(year, monthNumber, 0).getDate();
  const perDay = new Map<string, { revenue: number; contribution: number }>();
  for (const sale of sales) {
    const entry = perDay.get(sale.sold_at) || { revenue: 0, contribution: 0 };
    entry.revenue += saleNet(sale);
    entry.contribution += saleContribution(sale);
    perDay.set(sale.sold_at, entry);
  }
  // A curva acumulada começa em −despesas fixas do mês e sobe com a margem
  // de cada venda: o dia em que cruza o zero é o dia em que o mês se pagou.
  let cumulative = -fixed;
  const daily = Array.from({ length: daysInMonth }, (_, index) => {
    const day = `${month}-${String(index + 1).padStart(2, '0')}`;
    const entry = perDay.get(day) || { revenue: 0, contribution: 0 };
    cumulative += entry.contribution;
    return { day, revenue: round(entry.revenue), contribution: round(entry.contribution), cumulativeProfit: round(cumulative) };
  });

  const productMap = new Map<string, MonthResult['byProduct'][number]>();
  const channelMap = new Map<string, MonthResult['byChannel'][number]>();
  for (const sale of sales) {
    const productKey = sale.product_id || `avulso:${sale.description || 'Venda avulsa'}`;
    const product = productMap.get(productKey) || {
      id: productKey,
      name: (sale.product_id && names.products.get(sale.product_id)) || sale.description || 'Venda avulsa',
      quantity: 0, revenue: 0, contribution: 0, marginPct: 0,
    };
    product.quantity += sale.quantity;
    product.revenue += saleNet(sale);
    product.contribution += saleContribution(sale);
    productMap.set(productKey, product);

    const channelKey = sale.channel_id || 'none';
    const channel = channelMap.get(channelKey) || {
      id: channelKey,
      name: (sale.channel_id && names.channels.get(sale.channel_id)) || 'Sem canal',
      revenue: 0, contribution: 0,
    };
    channel.revenue += saleNet(sale);
    channel.contribution += saleContribution(sale);
    channelMap.set(channelKey, channel);
  }

  const byProduct = Array.from(productMap.values())
    .map((item) => ({ ...item, marginPct: item.revenue > 0 ? (item.contribution / item.revenue) * 100 : 0 }))
    .sort((a, b) => b.contribution - a.contribution);

  return {
    revenue, cmv, fees, taxes, contribution, contributionPct, fixed, netProfit,
    netMarginPct: revenue > 0 ? (netProfit / revenue) * 100 : 0,
    breakEvenRevenue,
    breakEvenProgress: breakEvenRevenue && breakEvenRevenue > 0 ? Math.min(100, (revenue / breakEvenRevenue) * 100) : null,
    salesCount: sales.length,
    unitsSold: sales.reduce((sum, sale) => sum + sale.quantity, 0),
    averageTicket: sales.length > 0 ? revenue / sales.length : 0,
    daily,
    byProduct,
    byChannel: Array.from(channelMap.values()).sort((a, b) => b.revenue - a.revenue),
  };
}

/** Quantas unidades de um produto pagam sozinhas as despesas fixas do mês. */
export function breakEvenUnits(fixed: number, contributionPerUnit: number) {
  return contributionPerUnit > 0 ? Math.ceil(fixed / contributionPerUnit) : null;
}

export const formatMoney = (value: number) =>
  (Number.isFinite(value) ? value : 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const formatPct = (value: number, digits = 1) =>
  `${(Number.isFinite(value) ? value : 0).toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;

export const formatQty = (value: number) =>
  (Number.isFinite(value) ? value : 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
