/** Custos & Precificação — tipos compartilhados (navegador e servidor). */

import type { FinBusiness } from './business';

export type FinUnit = 'kg' | 'g' | 'l' | 'ml' | 'un' | 'dz' | 'mil' | 'mi' | 'm' | 'cm' | 'm2' | 'h' | 'min' | 'mb' | 'gb';
/** Moeda de uma despesa ou compra (dólar/euro viram reais pela cotação das configurações). */
export type FinCurrency = 'BRL' | 'USD' | 'EUR';
/** Chave de um tipo de insumo da empresa (ver business.ts: cada empresa cria os seus). */
export type IngredientCategory = string;

export interface FinSettings {
  tax_pct: number;
  commission_pct: number;
  target_margin_pct: number;
  labor_hour_cost: number;
  expected_monthly_revenue: number;
  /** Cotação usada para o que é cobrado em dólar/euro (0 = ainda não informada). */
  usd_rate: number;
  eur_rate: number;
  /** IOF + spread do cartão sobre compras em moeda estrangeira. */
  fx_fee_pct: number;
  fx_updated_at: string | null;
}

export interface FinIngredient {
  id: string;
  name: string;
  category: IngredientCategory;
  purchase_unit: FinUnit;
  purchase_qty: number;
  purchase_price: number;
  currency: FinCurrency;
  supplier: string;
  updated_at?: string;
}

export interface FinProductItem {
  id?: string;
  ingredient_id: string | null;
  component_product_id: string | null;
  quantity: number;
  unit: FinUnit;
}

export interface FinProduct {
  id: string;
  name: string;
  category: string;
  /** product = vendido; base = parte pronta usada dentro de outros itens (preparo, kit, componente...). */
  kind: 'product' | 'base';
  yield_qty: number;
  yield_unit: string;
  prep_minutes: number;
  loss_pct: number;
  sale_price: number;
  channel_prices: Record<string, number>;
  target_margin_pct: number | null;
  notes: string;
  active: boolean;
  items: FinProductItem[];
}

export interface FinChannel {
  id: string;
  name: string;
  fee_pct: number;
  fixed_fee: number;
  extra_cost: number;
  position: number;
  active: boolean;
}

export interface FinFixedCost {
  id: string;
  name: string;
  category: string;
  /** Valor na moeda da despesa (ver currency). */
  amount: number;
  currency: FinCurrency;
  /** yearly entra no mês como 1/12 do valor. */
  recurrence: 'monthly' | 'yearly' | 'once';
  /** YYYY-MM-01 quando recurrence = once. */
  month: string | null;
  active: boolean;
}

export interface FinSale {
  id: string;
  sold_at: string;
  product_id: string | null;
  channel_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  discount: number;
  unit_cost: number;
  fee_amount: number;
  tax_amount: number;
  source: 'manual' | 'import';
  created_at?: string;
}

export interface FinMonthRevenue {
  month: string; // YYYY-MM
  revenue: number;
}

export interface FinWorkspace {
  /** isPlatform: é a própria empresa dona do sistema (Vórtice). */
  tenant: { id: string; name: string; isPlatform?: boolean };
  settings: FinSettings;
  business: FinBusiness;
  ingredients: FinIngredient[];
  products: FinProduct[];
  channels: FinChannel[];
  fixedCosts: FinFixedCost[];
  revenueHistory: FinMonthRevenue[];
  access: { canManage: boolean; canSell: boolean; isClient: boolean };
}
