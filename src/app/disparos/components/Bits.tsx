'use client';

import React from 'react';
import { FileText, Film } from 'lucide-react';
import styles from '../disparos.module.css';
import { STATUS_LABEL, type CampaignCounts, type CampaignStatus } from '@/lib/disparos';

export async function api<T>(url: string, init?: RequestInit): Promise<{ data?: T; error?: string }> {
  try {
    const response = await fetch(url, { cache: 'no-store', ...init, headers: init?.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json', ...init.headers } : init?.headers });
    const json = await response.json().catch(() => ({}));
    return response.ok ? { data: json.data as T } : { error: json.error || 'Não foi possível concluir.' };
  } catch {
    return { error: 'Sem conexão com o servidor.' };
  }
}

export function StatusBadge({ status }: { status: CampaignStatus }) {
  return <span className={`${styles.status} ${styles[`status_${status}`]}`}>{STATUS_LABEL[status] || status}</span>;
}

export function Progress({ counts }: { counts: CampaignCounts }) {
  const total = Math.max(1, counts.total);
  const pct = (value: number) => `${(value / total) * 100}%`;
  return (
    <div className={styles.progress} role="progressbar" aria-valuenow={counts.sent + counts.failed + counts.skipped} aria-valuemax={counts.total}>
      <span className={styles.barSent} style={{ width: pct(counts.sent) }} />
      <span className={styles.barFailed} style={{ width: pct(counts.failed) }} />
      <span className={styles.barSkipped} style={{ width: pct(counts.skipped) }} />
    </div>
  );
}

export const percent = (part: number, total: number) => (total > 0 ? `${Math.round((part / total) * 100)}%` : '0%');

export const dateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

/** Mensagens como aparecem no WhatsApp do contato. */
export function PhonePreview({ messages, media, to }: { messages: string[]; media?: { url: string; kind: string; name?: string | null } | null; to?: string }) {
  const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return (
    <div className={styles.phone}>
      {to && <span className={styles.previewTo}>Para {to}</span>}
      {messages.length === 0 && <span className={styles.previewTo}>A prévia aparece aqui.</span>}
      {messages.map((text, index) => (
        <div key={index} className={styles.bubble}>
          {index === 0 && media?.url && (
            <div className={styles.bubbleMedia}>
              {media.kind === 'image' ? <img src={media.url} alt="" /> /* eslint-disable-line @next/next/no-img-element */ : <>{media.kind === 'video' ? <Film size={16} /> : <FileText size={16} />} {media.name || 'arquivo'}</>}
            </div>
          )}
          {text || <em>(mensagem vazia)</em>}
          <time>{time}</time>
        </div>
      ))}
    </div>
  );
}

/** Botões que inserem {{variável}} no campo (no cursor, se houver). */
export function VariableBar({ groups, onPick }: { groups: { label: string; names: string[] }[]; onPick: (name: string) => void }) {
  return (
    <div className={styles.varBar}>
      {groups.filter((group) => group.names.length).map((group) => (
        <React.Fragment key={group.label}>
          <span className={styles.varGroup}>{group.label}:</span>
          {group.names.map((name) => <button key={name} type="button" onClick={() => onPick(name)}>{`{{${name}}}`}</button>)}
        </React.Fragment>
      ))}
    </div>
  );
}

/** Insere texto na posição do cursor de um textarea/input controlado. */
export function insertAt(element: HTMLTextAreaElement | HTMLInputElement | null, value: string, token: string) {
  const start = element?.selectionStart ?? value.length;
  const end = element?.selectionEnd ?? value.length;
  const next = `${value.slice(0, start)}${token}${value.slice(end)}`;
  requestAnimationFrame(() => {
    element?.focus();
    element?.setSelectionRange(start + token.length, start + token.length);
  });
  return next;
}
