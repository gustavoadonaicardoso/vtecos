'use client';

import { supabase } from '@/lib/supabase';

/** Evento da própria tela: marcou como lida, limpou a lista. */
export const NOTIFICATIONS_CHANGED = 'vtec:notifications-changed';

export function announceNotificationsChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
}

/**
 * Chama `onChange` na hora em que chega (ou muda) uma notificação do
 * usuário: Realtime em system_notifications (o RLS só entrega as dele) e
 * as mudanças feitas na própria tela. Devolve a função para parar.
 */
export function watchNotifications(userId: string, onChange: () => void) {
  const instance = Math.random().toString(36).slice(2, 8);
  const channel = supabase
    .channel(`notifications_${userId}_${instance}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'system_notifications', filter: `user_id=eq.${userId}` }, onChange)
    .subscribe();
  window.addEventListener(NOTIFICATIONS_CHANGED, onChange);
  return () => {
    window.removeEventListener(NOTIFICATIONS_CHANGED, onChange);
    supabase.removeChannel(channel);
  };
}
