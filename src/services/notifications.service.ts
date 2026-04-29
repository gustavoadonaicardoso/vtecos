/**
 * ============================================================
 * VÓRTICE CRM — Notifications Service
 * ============================================================
 * Responsável por TODAS as operações de banco relacionadas
 * a notificações do sistema (system_notifications).
 * ============================================================
 */

import { supabase } from '@/lib/supabase';
import { SystemNotification, ServiceResult } from '@/types';

/**
 * Busca as últimas notificações de um usuário.
 */
export async function fetchUserNotifications(
  userId: string,
  limit = 10
): Promise<SystemNotification[]> {
  try {
    const { data, error } = await supabase
      .from('system_notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error || !data) return [];
    return data as SystemNotification[];
  } catch (err) {
    console.error('[NotificationsService] fetchUserNotifications:', err);
    return [];
  }
}

/**
 * Busca a contagem de notificações não lidas de um usuário.
 */
export async function fetchUnreadNotificationsCount(userId: string): Promise<number> {
  try {
    const { count, error } = await supabase
      .from('system_notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false);

    if (error) return 0;
    return count || 0;
  } catch (err) {
    console.error('[NotificationsService] fetchUnreadNotificationsCount:', err);
    return 0;
  }
}

/**
 * Marca uma notificação como lida.
 */
export async function markNotificationAsRead(notificationId: string): Promise<ServiceResult> {
  try {
    const { error } = await supabase
      .from('system_notifications')
      .update({ is_read: true })
      .eq('id', notificationId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: any) {
    console.error('[NotificationsService] markNotificationAsRead:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Remove todas as notificações de um usuário.
 */
export async function clearUserNotifications(userId: string): Promise<ServiceResult> {
  try {
    const { error } = await supabase
      .from('system_notifications')
      .delete()
      .eq('user_id', userId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: any) {
    console.error('[NotificationsService] clearUserNotifications:', err);
    return { success: false, error: err.message };
  }
}
