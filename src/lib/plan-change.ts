/** Troca de plano pelo cliente (Configurações > Plano): formato da tela. Arquivo puro. */

export type Cycle = 'MONTHLY' | 'YEARLY';

export interface PlanOption {
  id: string;
  name: string;
  description: string;
  price: number;
  featured: boolean;
  modules: { key: string; label: string }[];
  maxUsers: number | null;
  current: boolean;
}

export interface PendingPlanChange {
  planId: string;
  planName: string;
  cycle: Cycle;
  effectiveOn: string;
}

export interface PlanChangeView {
  allowed: boolean;
  /** Por que não dá para trocar agora (fatura atrasada, cobrança manual...). */
  reason: string | null;
  status: string;
  currentPlanId: string | null;
  cycle: Cycle;
  nextDue: string | null;
  activeUsers: number;
  pending: PendingPlanChange | null;
  options: PlanOption[];
}

export const cyclePrice = (monthly: number, cycle: Cycle) => Math.round((cycle === 'YEARLY' ? monthly * 10 : monthly) * 100) / 100;

/** Como a troca acontece: na hora (subir ou no teste) ou na próxima fatura (descer). */
export function changeMode(status: string, currentPrice: number, nextPrice: number): 'now' | 'next_invoice' {
  return status === 'active' && nextPrice < currentPrice ? 'next_invoice' : 'now';
}
