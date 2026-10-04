'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SystemNotification } from '@/types';

export type BrowserNotificationPermission = NotificationPermission | 'unsupported';

export function getBrowserNotificationPermission(): BrowserNotificationPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }

  return Notification.permission;
}

export async function requestBrowserNotificationPermission(): Promise<BrowserNotificationPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }

  try {
    return await Notification.requestPermission();
  } catch {
    return getBrowserNotificationPermission();
  }
}

type NotificationPayload = Pick<SystemNotification, 'id' | 'title' | 'content' | 'link'>;

/** Resultado de uma notificação do sistema operacional. */
export type NotificationOutcome = 'in-app' | 'shown' | 'error' | 'no-permission' | 'unsupported' | 'unknown';

/** Evento que o <InAppToasts /> escuta para mostrar o aviso dentro do sistema. */
export const IN_APP_TOAST_EVENT = 'vtec:in-app-toast';

export function pushInAppToast(notification: NotificationPayload) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<NotificationPayload>(IN_APP_TOAST_EVENT, { detail: notification }));
}

/**
 * Mostra um aviso. Com o vtec os aberto e em foco, o aviso aparece
 * dentro do próprio sistema (não depende de o macOS/Windows liberar o
 * Chrome). Com a aba em segundo plano, vai para a notificação do sistema
 * operacional. `force` manda para o sistema operacional mesmo em foco
 * (botão "Enviar teste").
 */
export function showBrowserNotification(
  notification: NotificationPayload,
  options: { force?: boolean } = {}
): Promise<NotificationOutcome> {
  if (typeof window === 'undefined') return Promise.resolve('unsupported');

  if (!options.force && document.visibilityState === 'visible' && document.hasFocus()) {
    pushInAppToast(notification);
    return Promise.resolve('in-app');
  }

  const permission = getBrowserNotificationPermission();
  if (permission === 'unsupported') return Promise.resolve('unsupported');
  if (permission !== 'granted') return Promise.resolve('no-permission');

  return new Promise((resolve) => {
    let settled = false;
    const finish = (outcome: NotificationOutcome) => {
      if (settled) return;
      settled = true;
      resolve(outcome);
    };

    try {
      const browserNotification = new Notification(notification.title, {
        body: notification.content,
        icon: '/icon-192.png',
        tag: `system-notification-${notification.id}`,
      });

      browserNotification.onshow = () => finish('shown');
      browserNotification.onerror = () => finish('error');
      browserNotification.onclick = () => {
        window.focus();
        if (notification.link) window.location.href = notification.link;
        browserNotification.close();
      };
      // Alguns navegadores não avisam quando o sistema operacional bloqueia.
      setTimeout(() => finish('unknown'), 2500);
    } catch {
      // Ex.: Chrome no Android só cria notificação por service worker.
      finish('error');
    }
  });
}

export function useBrowserNotifications() {
  const [permission, setPermission] = useState<BrowserNotificationPermission>(
    getBrowserNotificationPermission
  );

  const requestPermission = useCallback(async () => {
    const nextPermission = await requestBrowserNotificationPermission();
    setPermission(nextPermission);
    return nextPermission;
  }, []);

  const refreshPermission = useCallback(() => {
    setPermission(getBrowserNotificationPermission());
  }, []);

  useEffect(() => {
    window.addEventListener('focus', refreshPermission);
    return () => window.removeEventListener('focus', refreshPermission);
  }, [refreshPermission]);

  return { permission, requestPermission, refreshPermission };
}
