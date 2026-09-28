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
 * Retorna `null` (em vez de []) quando a busca falha, para o chamador
 * conseguir distinguir "erro" de "realmente não tem notificação".
 */
export async function fetchUserNotifications(
  userId: string,
  limit = 10
): Promise<SystemNotification[] | null> {
  try {
    const { data, error } = await supabase
      .from('system_notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[NotificationsService] fetchUserNotifications:', error.message, error);
      return null;
    }
    return (data || []) as SystemNotification[];
  } catch (err) {
    console.error('[NotificationsService] fetchUserNotifications:', err);
    return null;
  }
}

/**
 * Busca a contagem de notificações não lidas de um usuário.
 * Retorna `null` quando a busca falha (ver fetchUserNotifications).
 */
export async function fetchUnreadNotificationsCount(userId: string): Promise<number | null> {
  try {
    const { count, error } = await supabase
      .from('system_notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false);

    if (error) {
      console.error('[NotificationsService] fetchUnreadNotificationsCount:', error.message, error);
      return null;
    }
    return count || 0;
  } catch (err) {
    console.error('[NotificationsService] fetchUnreadNotificationsCount:', err);
    return null;
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
 * Marca todas as notificações de um usuário como lidas.
 */
export async function markAllNotificationsAsRead(userId: string): Promise<ServiceResult> {
  try {
    const { error } = await supabase
      .from('system_notifications')
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('is_read', false);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: any) {
    console.error('[NotificationsService] markAllNotificationsAsRead:', err);
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
