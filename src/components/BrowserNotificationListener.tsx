'use client';

import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { showBrowserNotification } from '@/hooks/useBrowserNotifications';
import type { SystemNotification } from '@/types';

export default function BrowserNotificationListener() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`browser_system_notifications_${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'system_notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => showBrowserNotification(payload.new as SystemNotification)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  return null;
}
