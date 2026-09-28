/**
 * ============================================================
 * VÓRTICE CRM — Notifications Service (client-side)
 * ============================================================
 * Antes lia/escrevia direto na tabela system_notifications com a
 * anon key -- como RLS não conseguia isolar por usuário sem uma
 * sessão real do Supabase Auth no navegador, qualquer um podia ler
 * a notificação de outro usuário. Agora tudo passa pela API
 * /api/notifications, que resolve a identidade pela sessão (cookie),
 * nunca pelo userId que o próprio chamador informa.
 * ============================================================
 */

import { SystemNotification, ServiceResult } from '@/types';

/**
 * Busca as últimas notificações do usuário autenticado.
 * Retorna `null` (em vez de []) quando a busca falha, para o chamador
 * conseguir distinguir "erro" de "realmente não tem notificação".
 */
export async function fetchUserNotifications(
  _userId: string,
  limit = 10
): Promise<SystemNotification[] | null> {
  try {
    const resp = await fetch(`/api/notifications?limit=${limit}`);
    if (!resp.ok) return null;
    const { data } = await resp.json();
    return (data || []) as SystemNotification[];
  } catch (err) {
    console.error('[NotificationsService] fetchUserNotifications:', err);
    return null;
  }
}

/**
 * Busca a contagem de notificações não lidas do usuário autenticado.
 * Retorna `null` quando a busca falha (ver fetchUserNotifications).
 */
export async function fetchUnreadNotificationsCount(_userId: string): Promise<number | null> {
  try {
    const resp = await fetch('/api/notifications?countOnly=1');
    if (!resp.ok) return null;
    const { count } = await resp.json();
    return count ?? 0;
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
    const resp = await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: notificationId }),
    });
    const result = await resp.json();
    if (!resp.ok) return { success: false, error: result.error };
    return { success: true };
  } catch (err: unknown) {
    console.error('[NotificationsService] markNotificationAsRead:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Erro desconhecido.' };
  }
}

/**
 * Marca todas as notificações do usuário autenticado como lidas.
 */
export async function markAllNotificationsAsRead(_userId: string): Promise<ServiceResult> {
  try {
    const resp = await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ all: true }),
    });
    const result = await resp.json();
    if (!resp.ok) return { success: false, error: result.error };
    return { success: true };
  } catch (err: unknown) {
    console.error('[NotificationsService] markAllNotificationsAsRead:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Erro desconhecido.' };
  }
}

/**
 * Remove todas as notificações do usuário autenticado.
 */
export async function clearUserNotifications(_userId: string): Promise<ServiceResult> {
  try {
    const resp = await fetch('/api/notifications', { method: 'DELETE' });
    const result = await resp.json();
    if (!resp.ok) return { success: false, error: result.error };
    return { success: true };
  } catch (err: unknown) {
    console.error('[NotificationsService] clearUserNotifications:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Erro desconhecido.' };
  }
}
