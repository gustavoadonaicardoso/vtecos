'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CreditCard, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { billingSentence, type BillingSummaryView } from '@/lib/billing-labels';
import styles from './BillingBanner.module.css';

const DISMISS_KEY = 'vtec_billing_banner_dismissed';
const REFRESH_MS = 10 * 60_000;

const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });

function dismissedToday() {
  try {
    return localStorage.getItem(DISMISS_KEY) === today();
  } catch {
    return false;
  }
}

/**
 * Faixa no topo para o administrador da empresa: teste grátis acabando
 * ou fatura em atraso, com o botão para pagar. O aviso do teste pode ser
 * fechado (volta no dia seguinte); o de atraso não.
 */
export default function BillingBanner() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<BillingSummaryView | null>(null);
  const [hidden, setHidden] = useState(dismissedToday);
  const eligible = Boolean(user && user.role === 'ADMIN' && user.workspace && !user.workspace.is_platform);

  useEffect(() => {
    if (!eligible) return;
    let alive = true;
    const load = () =>
      fetch('/api/billing', { cache: 'no-store' })
        .then((response) => (response.ok ? response.json() : null))
        .then((json) => alive && setSummary(json?.data?.summary ?? null))
        .catch(() => {});
    load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [eligible]);

  if (!eligible || !summary) return null;
  const overdue = summary.status === 'past_due';
  const trial = summary.status === 'trial' && summary.trialDaysLeft !== null && summary.trialDaysLeft <= 3;
  if (!overdue && !trial) return null;
  if (trial && hidden) return null;

  return (
    <div className={`${styles.bar} ${overdue ? styles.overdue : styles.trial}`} role={overdue ? 'alert' : 'status'}>
      {overdue ? <AlertTriangle size={16} className={styles.icon} /> : <CreditCard size={16} className={styles.icon} />}
      <span className={styles.text}>{billingSentence(summary)}</span>
      {summary.invoiceUrl ? (
        <a className={styles.action} href={summary.invoiceUrl} target="_blank" rel="noreferrer">Pagar agora</a>
      ) : (
        <Link className={styles.action} href="/settings?tab=plan">Ver plano</Link>
      )}
      {trial && (
        <button
          type="button"
          className={styles.close}
          aria-label="Fechar aviso até amanhã"
          onClick={() => {
            try {
              localStorage.setItem(DISMISS_KEY, today());
            } catch {}
            setHidden(true);
          }}
        >
          <X size={15} />
        </button>
      )}
    </div>
  );
}
