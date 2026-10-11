'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CalendarPlus, CreditCard, ExternalLink, Loader2, Power, RefreshCw, ShieldCheck, X } from 'lucide-react';
import styles from './TenantsTab.module.css';
import {
  BILLING_STATUS_LABEL,
  BILLING_TONE,
  INVOICE_STATUS_LABEL,
  billingSentence,
  brDate,
  cycleText,
  isPaidInvoice,
  money,
  type BillingSummaryView,
  type InvoiceView,
} from '@/lib/billing-labels';

interface Props {
  tenant: { id: string; name: string; document?: string | null; contact_email?: string | null; phone?: string | null; plan_id: string | null };
  planName: string | null;
  planPrice: number | null;
  onClose: () => void;
  onChanged: () => void;
}

interface Data {
  summary: BillingSummaryView;
  invoices: InvoiceView[];
  invoicesError: string | null;
  ready: boolean;
}

const localToday = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
const plusDays = (date: string, days: number) => {
  const base = new Date(`${date}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
};

export function BillingChip({ status }: { status?: string | null }) {
  const key = (status || 'manual') as keyof typeof BILLING_STATUS_LABEL;
  if (key === 'manual') return null;
  return <span className={`${styles.chip} ${styles[`billing_${BILLING_TONE[key]}`]}`}>{BILLING_STATUS_LABEL[key]}</span>;
}

/** Painel Master > Empresas > Cobrança: liga, acompanha e ajusta a cobrança automática (Asaas). */
export default function BillingModal({ tenant, planName, planPrice, onClose, onChanged }: Props) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState({
    cpfCnpj: tenant.document || '',
    email: tenant.contact_email || '',
    phone: tenant.phone || '',
    cycle: 'MONTHLY' as 'MONTHLY' | 'YEARLY',
    firstDueDate: plusDays(localToday(), 1),
  });
  const [graceUntil, setGraceUntil] = useState(plusDays(localToday(), 3));

  const load = useCallback(async () => {
    const response = await fetch(`/api/tenants/${tenant.id}/billing`, { cache: 'no-store' });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(json.error || 'Não foi possível carregar a cobrança.');
      return;
    }
    setData(json.data);
  }, [tenant.id]);

  useEffect(() => {
    const timer = window.setTimeout(load, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const act = async (action: string, extra: Record<string, unknown> = {}, confirmText?: string) => {
    if (confirmText && !confirm(confirmText)) return;
    setBusy(action);
    setError('');
    const response = await fetch(`/api/tenants/${tenant.id}/billing`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...extra }) });
    const json = await response.json().catch(() => ({}));
    setBusy(null);
    if (!response.ok) {
      setError(json.error || 'Não foi possível concluir.');
      return;
    }
    await load();
    onChanged();
  };

  const summary = data?.summary;
  const value = planPrice !== null ? (form.cycle === 'YEARLY' ? planPrice * 10 : planPrice) : null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={`Cobrança de ${tenant.name}`}>
        <div className={styles.modalHead}>
          <h3><CreditCard size={18} style={{ verticalAlign: '-3px' }} /> Cobrança — {tenant.name}</h3>
          <button type="button" className={styles.icon} onClick={onClose} aria-label="Fechar"><X size={16} /></button>
        </div>

        {!data && !error && <p className={styles.muted}><Loader2 size={15} className={styles.spin} /> Carregando…</p>}
        {error && <div className={styles.error}><AlertTriangle size={15} style={{ verticalAlign: '-2px' }} /> {error}</div>}

        {summary && (
          <>
            <div className={styles.billingBox}>
              <div className={styles.billingHead}>
                <span className={`${styles.chip} ${styles[`billing_${BILLING_TONE[summary.status]}`]}`}>{BILLING_STATUS_LABEL[summary.status]}</span>
                {summary.automatic && summary.value !== null && <strong>{money(summary.value)} <small className={styles.muted}>/ {cycleText(summary.cycle)}</small></strong>}
              </div>
              <p className={styles.muted}>{summary.status === 'manual' ? 'Esta empresa é cobrada fora do sistema. Ligue a cobrança automática para o Asaas gerar as faturas e o sistema suspender e reativar sozinho.' : billingSentence(summary)}</p>
              {summary.graceUntil && <p className={styles.muted}>Acesso liberado por cortesia até {brDate(summary.graceUntil)}.</p>}
              {summary.lastPaidAt && <p className={styles.muted}>Último pagamento: {brDate(summary.lastPaidAt)}.</p>}
              {summary.invoiceUrl && (
                <a className={styles.secondary} href={summary.invoiceUrl} target="_blank" rel="noreferrer" style={{ alignSelf: 'flex-start' }}>
                  <ExternalLink size={15} /> Fatura em aberto
                </a>
              )}
            </div>

            {summary.status === 'manual' || summary.status === 'canceled' ? (
              data.ready ? (
                <form
                  className={styles.billingForm}
                  onSubmit={(event) => {
                    event.preventDefault();
                    void act('enable', form);
                  }}
                >
                  <h4>Ligar cobrança automática</h4>
                  {!tenant.plan_id && <p className={styles.warn}>Escolha um plano para a empresa antes.</p>}
                  <div className={styles.formGrid}>
                    <label className={styles.field}>
                      <span>CPF ou CNPJ de quem paga</span>
                      <input className={styles.input} value={form.cpfCnpj} onChange={(e) => setForm({ ...form, cpfCnpj: e.target.value })} placeholder="00.000.000/0001-00" required />
                    </label>
                    <label className={styles.field}>
                      <span>Ciclo</span>
                      <select className={styles.input} value={form.cycle} onChange={(e) => setForm({ ...form, cycle: e.target.value as 'MONTHLY' | 'YEARLY' })}>
                        <option value="MONTHLY">Mensal</option>
                        <option value="YEARLY">Anual (10 meses)</option>
                      </select>
                    </label>
                  </div>
                  <div className={styles.formGrid}>
                    <label className={styles.field}>
                      <span>E-mail que recebe as faturas</span>
                      <input className={styles.input} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="financeiro@empresa.com" required />
                    </label>
                    <label className={styles.field}>
                      <span>1º vencimento</span>
                      <input className={styles.input} type="date" min={localToday()} value={form.firstDueDate} onChange={(e) => setForm({ ...form, firstDueDate: e.target.value })} required />
                    </label>
                  </div>
                  <label className={styles.field}>
                    <span>Celular (opcional, para lembretes do Asaas)</span>
                    <input className={styles.input} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(11) 99999-0000" />
                  </label>
                  <p className={styles.muted}>
                    {planName && value !== null ? <>Plano <strong>{planName}</strong>: {money(value)} {form.cycle === 'YEARLY' ? 'por ano' : 'por mês'}. </> : null}
                    O cliente escolhe Pix, boleto ou cartão na fatura. Atrasou mais de 3 dias: o acesso é suspenso; pagou: volta na hora.
                  </p>
                  <div className={styles.modalActions}>
                    <button type="submit" className={styles.primary} disabled={busy !== null || !tenant.plan_id}>
                      {busy === 'enable' ? <Loader2 size={15} className={styles.spin} /> : <Power size={15} />} Ligar cobrança
                    </button>
                  </div>
                </form>
              ) : (
                <p className={styles.warn}>Configure o Asaas em Painel Master &gt; Plataforma para ligar a cobrança automática.</p>
              )
            ) : (
              <div className={styles.billingActions}>
                <button type="button" className={styles.secondary} disabled={busy !== null} onClick={() => act('refresh')}>
                  {busy === 'refresh' ? <Loader2 size={15} className={styles.spin} /> : <RefreshCw size={15} />} Conferir no Asaas agora
                </button>
                {summary.status === 'trial' && (
                  <button type="button" className={styles.secondary} disabled={busy !== null} onClick={() => act('extend_trial', { days: 7 })}>
                    <CalendarPlus size={15} /> +7 dias de teste
                  </button>
                )}
                <label className={styles.inlineField}>
                  <span>Ciclo</span>
                  <select className={styles.input} value={summary.cycle} disabled={busy !== null} onChange={(e) => act('cycle', { cycle: e.target.value }, `Mudar a cobrança para ${e.target.value === 'YEARLY' ? 'anual (10 mensalidades)' : 'mensal'}? A fatura em aberto também muda de valor.`)}>
                    <option value="MONTHLY">Mensal</option>
                    <option value="YEARLY">Anual</option>
                  </select>
                </label>
                {(summary.status === 'past_due' || summary.status === 'suspended') && (
                  <div className={styles.inlineField}>
                    <span>Liberar até</span>
                    <input className={styles.input} type="date" min={localToday()} value={graceUntil} onChange={(e) => setGraceUntil(e.target.value)} />
                    <button type="button" className={styles.secondary} disabled={busy !== null} onClick={() => act('grace', { until: graceUntil })}>
                      <ShieldCheck size={15} /> Liberar acesso
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  className={styles.dangerLink}
                  disabled={busy !== null}
                  onClick={() => act('disable', {}, `Desligar a cobrança automática de ${tenant.name}? A assinatura é cancelada no Asaas (faturas em aberto também) e a empresa volta para cobrança manual.`)}
                >
                  Desligar cobrança automática
                </button>
              </div>
            )}

            {(data.invoices.length > 0 || data.invoicesError) && (
              <div className={styles.invoiceList}>
                <h4>Faturas</h4>
                {data.invoicesError && <p className={styles.warn}>{data.invoicesError}</p>}
                {data.invoices.map((invoice) => (
                  <div key={invoice.id} className={styles.invoiceRow}>
                    <span>{brDate(invoice.dueDate)}</span>
                    <strong>{money(invoice.value)}</strong>
                    <span className={isPaidInvoice(invoice.status) ? styles.ok : invoice.status === 'OVERDUE' ? styles.bad : styles.muted}>
                      {INVOICE_STATUS_LABEL[invoice.status] || invoice.status}{invoice.paidAt ? ` em ${brDate(invoice.paidAt)}` : ''}
                    </span>
                    {invoice.invoiceUrl ? <a href={invoice.invoiceUrl} target="_blank" rel="noreferrer" aria-label="Abrir fatura"><ExternalLink size={14} /></a> : <span />}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
