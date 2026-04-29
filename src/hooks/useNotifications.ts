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
import { supabase } from '@/lib/supabase';
import {
  fetchUserNotifications,
  markNotificationAsRead,
  clearUserNotifications,
} from '@/services/notifications.service';
import { SystemNotification } from '@/types';
import { useAuth } from '@/context/AuthContext';

export function useNotifications(isOpen: boolean) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<SystemNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) return;
    const data = await fetchUserNotifications(user.id, 10);
    setNotifications(data);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (!isOpen || !user) return;

    refresh();

    // Realtime com nome único para evitar conflitos
    const channel = supabase
      .channel(`notifications_dropdown_${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'system_notifications',
          filter: `user_id=eq.${user.id}`,
        },
        () => refresh()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
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

  return { notifications, loading, unreadCount, markAsRead, clearAll, refresh };
}
