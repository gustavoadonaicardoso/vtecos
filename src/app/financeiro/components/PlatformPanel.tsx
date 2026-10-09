'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Check, ClipboardList, Loader2, Receipt, Users } from 'lucide-react';
import styles from '../financeiro.module.css';
import { finRequest, monthLabel } from '../api';
import type { TabProps } from './shared';
import { formatMoney } from '@/lib/finance/calc';
import { labelsFor } from '@/lib/finance/business';
import type { PlatformSummary } from '@/services/finance.service';

interface Props extends TabProps {
  month: string;
  onSalesChanged: () => Promise<void>;
}

/**
 * Só na planilha da própria Vórtice: os clientes ativos e os planos do
 * Painel Master viram a receita recorrente (MRR) e, com um clique, as
 * mensalidades do mês e os planos para precificar.
 */
export default function PlatformPanel({ workspace, tenantId, month, reload, onSalesChanged }: Props) {
  const salesTab = labelsFor(workspace.business).sales;
  const productsTab = workspace.business.terms.products;
  const [summary, setSummary] = useState<PlatformSummary | null>(null);
  const [busy, setBusy] = useState<'' | 'plans' | 'bill'>('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => finRequest<PlatformSummary>('/platform', tenantId, { query: { month } })
    .then((data) => { setSummary(data); setError(''); })
    .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Não foi possível carregar os clientes.')), [tenantId, month]);

  useEffect(() => {
    let alive = true;
    finRequest<PlatformSummary>('/platform', tenantId, { query: { month } })
      .then((data) => { if (alive) { setSummary(data); setError(''); } })
      .catch((err: unknown) => { if (alive) setError(err instanceof Error ? err.message : 'Não foi possível carregar os clientes.'); });
    return () => { alive = false; };
  }, [tenantId, month]);

  const run = async (action: 'import_plans' | 'bill_month') => {
    setBusy(action === 'import_plans' ? 'plans' : 'bill');
    setMessage('');
    setError('');
    try {
      if (action === 'import_plans') {
        const result = await finRequest<{ created: number }>('/platform', tenantId, { method: 'POST', body: { action } });
        await reload();
        setMessage(result.created ? `${result.created} plano(s) criado(s) em “${productsTab}”. Abra cada um para colocar o custo por cliente.` : 'Todos os planos já estavam criados.');
      } else {
        const result = await finRequest<{ inserted: number; skipped: number }>('/platform', tenantId, { method: 'POST', body: { action, month } });
        await onSalesChanged();
        setMessage(result.inserted ? `${result.inserted} mensalidade(s) lançada(s) em ${monthLabel(month)}.` : 'As mensalidades deste mês já estavam lançadas.');
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível concluir.');
    } finally {
      setBusy('');
    }
  };

  if (!summary) {
    return error ? <div className={styles.errorBanner}>{error}</div> : null;
  }

  const paying = summary.clients - summary.unpaid;
  const missingPlans = summary.plans.filter((plan) => plan.active && !plan.hasProduct).length;
  const toBill = Math.max(0, paying - summary.billed);

  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <h2><Users size={18} /> Seus clientes no sistema</h2>
        <div className={styles.headerActions}>
          {missingPlans > 0 && (
            <button className={styles.secondaryButton} onClick={() => run('import_plans')} disabled={Boolean(busy)}>
              {busy === 'plans' ? <Loader2 size={15} className={styles.spin} /> : <ClipboardList size={15} />} Criar {missingPlans} plano(s) em “{productsTab}”
            </button>
          )}
          {toBill > 0 && (
            <button className={styles.primaryButton} onClick={() => run('bill_month')} disabled={Boolean(busy)}>
              {busy === 'bill' ? <Loader2 size={15} className={styles.spin} /> : <Receipt size={15} />} Lançar {toBill} mensalidade(s) de {monthLabel(month)}
            </button>
          )}
        </div>
      </div>
      <p className={styles.panelHint}>
        Vem do Painel Master: empresas ativas e o plano de cada uma. Lançar as mensalidades registra uma venda por cliente no mês (sem repetir), com o custo do plano de mesmo nome.
        Se algum cliente pagou diferente (desconto, atraso), ajuste em “{salesTab}”.
      </p>
      {error && <div className={styles.errorBanner} style={{ marginBottom: 12 }}>{error}</div>}
      {message && <p className={`${styles.tag} ${styles.tagGood}`} style={{ whiteSpace: 'normal', marginBottom: 12 }}><Check size={12} /> {message}</p>}

      <div className={styles.platformGrid}>
        <div className={styles.totalCard}>
          <span>Clientes ativos</span>
          <strong>{summary.clients}</strong>
          <small>{summary.unpaid ? `${summary.unpaid} sem plano pago` : 'todos com plano pago'}</small>
        </div>
        <div className={styles.totalCard}>
          <span>Receita recorrente (MRR)</span>
          <strong>{formatMoney(summary.mrr)}</strong>
          <small>soma dos planos · {formatMoney(summary.mrr * 12)} por ano</small>
        </div>
        <div className={styles.totalCard}>
          <span>Média por cliente</span>
          <strong>{formatMoney(paying > 0 ? summary.mrr / paying : 0)}</strong>
          <small>{paying} pagando</small>
        </div>
        <div className={styles.totalCard}>
          <span>{monthLabel(month)}</span>
          <strong>{summary.billed} de {paying}</strong>
          <small>mensalidades lançadas</small>
        </div>
      </div>

      {summary.plans.length > 0 ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr><th>Plano</th><th className={styles.num}>Preço</th><th className={styles.num}>Clientes</th><th className={styles.num}>Por mês</th><th>Precificação</th></tr>
            </thead>
            <tbody>
              {summary.plans.map((plan) => (
                <tr key={plan.id} style={{ opacity: plan.active ? 1 : 0.55 }}>
                  <td><strong>{plan.name}</strong>{!plan.active && <span className={styles.muted}> · inativo</span>}</td>
                  <td className={styles.num}>{formatMoney(plan.price)}</td>
                  <td className={styles.num}>{plan.clients}</td>
                  <td className={styles.num}>{formatMoney(plan.mrr)}</td>
                  <td>{plan.hasProduct ? <span className={`${styles.tag} ${styles.tagGood}`}>em {productsTab}</span> : <span className={styles.tag}>não criado</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className={styles.empty}>Nenhum plano no Painel Master ainda.</div>
      )}
    </section>
  );
}
