'use client';

import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import styles from '../financeiro.module.css';
import { finRequest, monthLabel, shiftMonth } from '../api';
import type { FinSettings, FinWorkspace } from '@/lib/finance/types';
import { fixedCostPct, monthlyFixedCosts, revenueBase } from '@/lib/finance/calc';

export interface TabProps {
  workspace: FinWorkspace;
  tenantId: string | null;
  setWorkspace: React.Dispatch<React.SetStateAction<FinWorkspace | null>>;
  reload: () => Promise<void>;
  /** Troca de aba (ex.: atalho para "Meu negócio"). */
  onNavigate?: (tab: string) => void;
}

export function MonthPicker({ month, onChange }: { month: string; onChange: (month: string) => void }) {
  return (
    <div className={styles.headerActions}>
      <button className={styles.iconButton} onClick={() => onChange(shiftMonth(month, -1))} aria-label="Mês anterior"><ChevronLeft size={16} /></button>
      <strong style={{ minWidth: 140, textAlign: 'center' }}>{monthLabel(month)}</strong>
      <button className={styles.iconButton} onClick={() => onChange(shiftMonth(month, 1))} aria-label="Próximo mês"><ChevronRight size={16} /></button>
    </div>
  );
}

/** Etiqueta de margem: verde acima da meta, amarela abaixo, vermelha no prejuízo. */
export function marginTone(marginPct: number, targetPct: number) {
  if (marginPct < 0) return styles.tagBad;
  if (marginPct < targetPct) return styles.tagWarn;
  return styles.tagGood;
}

/** Rateio das despesas fixas usado nas fichas: % sobre o faturamento médio. */
export function pricingBase(workspace: FinWorkspace, month: string) {
  const fixedMonthly = monthlyFixedCosts(workspace.fixedCosts, workspace.settings);
  const base = revenueBase(workspace.revenueHistory, workspace.settings, month);
  return { fixedMonthly, base, fixedPct: fixedCostPct(fixedMonthly, base.value) };
}

/** Busca a cotação do dia (dólar/euro) no servidor e atualiza a planilha aberta. */
export async function refreshRates(
  tenantId: string | null,
  setWorkspace: React.Dispatch<React.SetStateAction<FinWorkspace | null>>
) {
  const result = await finRequest<{ settings: FinSettings; source: string; date: string }>('/fx', tenantId, { method: 'POST', body: {} });
  setWorkspace((state) => state && ({ ...state, settings: result.settings }));
  return result;
}
