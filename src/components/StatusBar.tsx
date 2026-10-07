'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, Info, Wrench, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { noticeContext, when } from '@/lib/status/format';
import type { VisibleNotice } from '@/lib/status/types';
import styles from './StatusBar.module.css';

const STORAGE_KEY = 'vtec_status_dismissed';
const REFRESH_MS = 2 * 60_000;

function readDismissed(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

function writeDismissed(value: Record<string, string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Sem armazenamento: o aviso volta na próxima visita.
  }
}

async function fetchNotices(): Promise<VisibleNotice[] | null> {
  try {
    const response = await fetch('/api/status', { cache: 'no-store' });
    if (!response.ok) return null;
    const json = await response.json();
    return Array.isArray(json.data) ? json.data : null;
  } catch {
    // Sem rede: mantém o que já está na tela.
    return null;
  }
}

const tone = (notice: VisibleNotice) => (notice.phase === 'resolved' ? 'resolved' : notice.kind);
const ICON = { incident: AlertTriangle, maintenance: Wrench, info: Info, resolved: CheckCircle2 };

/**
 * Faixa de status no topo do sistema: instabilidade, manutenção
 * (inclusive a programada para os próximos dias) e o "resolvido" logo
 * depois. Instabilidade em andamento não pode ser fechada; o resto
 * pode, e volta a aparecer quando a Vórtice publicar uma novidade.
 */
export default function StatusBar() {
  const { user } = useAuth();
  const [notices, setNotices] = useState<VisibleNotice[]>([]);
  const [dismissed, setDismissed] = useState<Record<string, string>>(readDismissed);
  const [open, setOpen] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!user) return;
    const refresh = () => fetchNotices().then((data) => data && setNotices(data));
    refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    window.addEventListener('focus', refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, [user]);

  const canDismiss = (notice: VisibleNotice) => !(notice.kind === 'incident' && notice.phase === 'active');
  const visible = notices.filter((notice) => !canDismiss(notice) || dismissed[notice.id] !== notice.version);
  if (visible.length === 0) return null;

  const dismiss = (notice: VisibleNotice) => {
    // Guarda só os avisos ainda existentes, para a lista não crescer para sempre.
    const next = Object.fromEntries(Object.entries(dismissed).filter(([id]) => notices.some((item) => item.id === id)));
    next[notice.id] = notice.version;
    setDismissed(next);
    writeDismissed(next);
  };

  const shown = showAll ? visible : visible.slice(0, 2);
  const hidden = visible.length - shown.length;

  return (
    <div className={styles.stack} role="status" aria-live="polite">
      {shown.map((notice) => {
        const kind = tone(notice);
        const Icon = ICON[kind];
        const expanded = open === notice.id;
        const hasDetails = Boolean(notice.message || notice.lastUpdate);
        return (
          <div key={notice.id} className={`${styles.bar} ${styles[kind]}`}>
            <div className={styles.row}>
              <Icon size={16} className={styles.icon} />
              <button
                type="button"
                className={styles.text}
                onClick={() => hasDetails && setOpen(expanded ? null : notice.id)}
                aria-expanded={hasDetails ? expanded : undefined}
                disabled={!hasDetails}
              >
                <strong>{notice.title}</strong>
                <span className={styles.context}>{noticeContext(notice)}</span>
              </button>
              {hasDetails && (
                <button type="button" className={styles.toggle} onClick={() => setOpen(expanded ? null : notice.id)} aria-label={expanded ? 'Esconder detalhes' : 'Ver detalhes'}>
                  <span>{expanded ? 'Fechar' : 'Detalhes'}</span>
                  <ChevronDown size={14} className={expanded ? styles.flip : ''} />
                </button>
              )}
              {canDismiss(notice) && (
                <button type="button" className={styles.close} onClick={() => dismiss(notice)} aria-label="Dispensar aviso">
                  <X size={15} />
                </button>
              )}
            </div>
            {expanded && (
              <div className={styles.details}>
                {notice.message && <p>{notice.message}</p>}
                {notice.lastUpdate && (
                  <p className={styles.update}>
                    <strong>Atualização {when(notice.lastUpdate.at)}:</strong> {notice.lastUpdate.message}
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}
      {hidden > 0 && (
        <button type="button" className={styles.more} onClick={() => setShowAll(true)}>
          + {hidden} aviso{hidden > 1 ? 's' : ''}
        </button>
      )}
    </div>
  );
}
