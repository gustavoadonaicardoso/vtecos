'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, X } from 'lucide-react';
import { IN_APP_TOAST_EVENT } from '@/hooks/useBrowserNotifications';
import type { SystemNotification } from '@/types';
import styles from './InAppToasts.module.css';

type Toast = Pick<SystemNotification, 'id' | 'title' | 'content' | 'link'> & { key: number };

const LIFETIME_MS = 7000;
const MAX_VISIBLE = 4;

/**
 * Avisos dentro do sistema (canto da tela) enquanto o vtec os está
 * aberto: mensagens novas do WhatsApp e avisos do sino. Não dependem da
 * permissão de notificação do macOS/Windows.
 */
export default function InAppToasts() {
  const router = useRouter();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);

  useEffect(() => {
    const onToast = (event: Event) => {
      const detail = (event as CustomEvent<Omit<Toast, 'key'>>).detail;
      const key = ++counter.current;
      setToasts((list) => [...list.filter((item) => item.id !== detail.id), { ...detail, key }].slice(-MAX_VISIBLE));
      setTimeout(() => setToasts((list) => list.filter((item) => item.key !== key)), LIFETIME_MS);
    };
    window.addEventListener(IN_APP_TOAST_EVENT, onToast);
    return () => window.removeEventListener(IN_APP_TOAST_EVENT, onToast);
  }, []);

  const dismiss = (key: number) => setToasts((list) => list.filter((item) => item.key !== key));

  if (toasts.length === 0) return null;

  return (
    <div className={styles.stack} aria-live="polite">
      {toasts.map((toast) => (
        <div
          key={toast.key}
          className={`${styles.toast} ${toast.link ? styles.clickable : ''}`}
          role="status"
          onClick={() => {
            if (!toast.link) return;
            dismiss(toast.key);
            router.push(toast.link);
          }}
        >
          <span className={styles.icon}><Bell size={16} /></span>
          <div className={styles.text}>
            <strong>{toast.title}</strong>
            {toast.content && <p>{toast.content}</p>}
          </div>
          <button
            type="button"
            className={styles.close}
            aria-label="Fechar aviso"
            onClick={(event) => { event.stopPropagation(); dismiss(toast.key); }}
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
