'use client';

import React, { useState } from 'react';
import { AlertTriangle, Check, CheckCircle2, Copy, Loader2 } from 'lucide-react';
import styles from '../integrations.module.css';
import type { DeliveryInfo, IntegrationView, Provider } from '../constants';

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: init?.body ? { 'Content-Type': 'application/json' } : undefined });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error || 'Não foi possível concluir.');
  return json.data as T;
}

export async function saveProvider(provider: Provider, config: Record<string, unknown>) {
  return api<IntegrationView>('/api/integrations', { method: 'POST', body: JSON.stringify({ provider, config }) });
}

export async function removeProvider(provider: string) {
  return api('/api/integrations?provider=' + encodeURIComponent(provider), { method: 'DELETE' });
}

export async function testProvider(provider: Provider) {
  return api<{ ok: boolean; message: string }>('/api/integrations/test', { method: 'POST', body: JSON.stringify({ provider }) });
}

export type Feedback = { type: 'success' | 'error'; text: string } | null;

export function FeedbackBox({ feedback }: { feedback: Feedback }) {
  if (!feedback) return null;
  return (
    <div className={feedback.type === 'success' ? styles.success : styles.error} role={feedback.type === 'error' ? 'alert' : 'status'}>
      {feedback.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
      <span>{feedback.text}</span>
    </div>
  );
}

export function CopyField({ label, value, hint }: { label: string; value: string; hint?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Sem permissão de área de transferência: o campo continua selecionável.
    }
  };
  return (
    <div className={styles.field}>
      <span className={styles.label}>{label}</span>
      <div className={styles.copyRow}>
        <input className={styles.input} value={value} readOnly onFocus={(event) => event.currentTarget.select()} />
        <button type="button" className={styles.copyBtn} onClick={copy} aria-label={`Copiar ${label}`}>
          {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      {hint && <small className={styles.hint}>{hint}</small>}
    </div>
  );
}

export function LastDelivery({ delivery }: { delivery?: DeliveryInfo | null }) {
  if (!delivery) return <p className={styles.hint}>Nenhum envio ainda.</p>;
  const when = new Date(delivery.at).toLocaleString('pt-BR');
  return (
    <div className={`${styles.delivery} ${delivery.ok ? styles.deliveryOk : styles.deliveryFail}`}>
      {delivery.ok ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
      <span>
        Último envio ({delivery.event}) em {when}: {delivery.ok ? `entregue${delivery.status ? ` (resposta ${delivery.status})` : ''}` : delivery.error || 'falhou'}
      </span>
    </div>
  );
}

export function BusyIcon({ busy, icon }: { busy: boolean; icon: React.ReactNode }) {
  return busy ? <Loader2 size={16} className={styles.spin} /> : <>{icon}</>;
}
