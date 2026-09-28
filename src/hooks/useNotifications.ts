/**
 * ============================================================
 * VÓRTICE CRM — useNotifications hook
 * ============================================================
 * Gerencia notificações do sistema com Realtime.
 * Extraído do NotificationDropdown para ser reutilizável.
 * ============================================================
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  fetchUserNotifications,
  markNotificationAsRead,
  clearUserNotifications,
} from '@/services/notifications.service';
import { SystemNotification } from '@/types';
import { useAuth } from '@/context/AuthContext';

const POLL_INTERVAL_MS = 15_000;

export function useNotifications(isOpen: boolean) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<SystemNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) return;
    const data = await fetchUserNotifications(user.id, 10);
    setLoadError(data === null);
    setNotifications(data || []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (!isOpen || !user) return;

    refresh();

    // Antes usava Realtime direto na tabela; a leitura agora passa por
    // uma API autenticada (não dá pra assinar Realtime nela), então o
    // dropdown atualiza por polling enquanto está aberto.
    const interval = setInterval(refresh, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [isOpen, user, refresh]);

  const markAsRead = async (id: string) => {
    await markNotificationAsRead(id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
  };

  const clearAll = async () => {
    if (!user) return;
    await clearUserNotifications(user.id);
    setNotifications([]);
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return { notifications, loading, loadError, unreadCount, markAsRead, clearAll, refresh };
}
