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

export function showBrowserNotification(notification: Pick<SystemNotification, 'id' | 'title' | 'content' | 'link'>) {
  if (getBrowserNotificationPermission() !== 'granted') return;

  try {
    const browserNotification = new Notification(notification.title, {
      body: notification.content,
      icon: '/icon-192.png',
      tag: `system-notification-${notification.id}`,
    });

    browserNotification.onclick = () => {
      window.focus();
      if (notification.link) window.location.href = notification.link;
      browserNotification.close();
    };
  } catch {
    // O navegador pode bloquear a criação mesmo após a permissão mudar.
  }
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
