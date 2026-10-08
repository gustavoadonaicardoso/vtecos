'use client';

import { useEffect, useState } from 'react';
import { fetchUnreadNotificationsCount } from '@/services/notifications.service';
import { watchNotifications } from '@/lib/notifications-live';

/** Se o tempo real cair, ainda confere de vez em quando. */
const FALLBACK_POLL_MS = 60_000;

/** Notificações não lidas do sino, atualizadas na hora. */
export function useNotificationCount(user: { id: string } | null | undefined) {
  const [count, setCount] = useState(0);
  const userId = user?.id;

  useEffect(() => {
    if (!userId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => fetchUnreadNotificationsCount(userId).then((value) => setCount(value ?? 0));
    // Várias notificações juntas (ex.: aviso para a equipe toda): uma busca só.
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(refresh, 250);
    };
    const first = setTimeout(refresh, 0);
    const stop = watchNotifications(userId, schedule);
    const poll = setInterval(refresh, FALLBACK_POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(first);
      if (timer) clearTimeout(timer);
      clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisible);
      stop();
    };
  }, [userId]);

  return count;
}
