'use client';

import { useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { showBrowserNotification } from '@/hooks/useBrowserNotifications';
import { fetchUserNotifications } from '@/services/notifications.service';
import { getNotificationPrefs } from '@/lib/notificationPrefs';

const POLL_INTERVAL_MS = 15_000;

/**
 * Antes assinava Realtime direto na tabela com a anon key. Agora a
 * leitura passa pela API autenticada (/api/notifications), que não dá
 * pra assinar via Realtime -- então detecta notificação nova comparando
 * o created_at mais recente já visto a cada poll.
 */
export default function BrowserNotificationListener() {
  const { user } = useAuth();
  const lastSeenRef = useRef<string | null>(null);
  const isFirstPollRef = useRef(true);

  useEffect(() => {
    if (!user) return;

    isFirstPollRef.current = true;
    lastSeenRef.current = null;

    const poll = async () => {
      const notifications = await fetchUserNotifications(user.id, 10);
      if (!notifications || notifications.length === 0) return;

      // Na primeira leitura só marca o que já existe como "visto" --
      // não notifica retroativamente o que chegou antes de abrir a página.
      if (isFirstPollRef.current) {
        isFirstPollRef.current = false;
        lastSeenRef.current = notifications[0].created_at;
        return;
      }

      const newest = notifications.filter(
        (n) => !lastSeenRef.current || n.created_at > lastSeenRef.current
      );

      if (newest.length > 0) {
        lastSeenRef.current = notifications[0].created_at;
        if (!getNotificationPrefs().systemPopup) return;
        // Mais antiga primeiro, pra manter a ordem cronológica dos toasts
        for (const notification of newest.slice().reverse()) {
          showBrowserNotification(notification);
        }
      }
    };

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [user]);

  return null;
}
