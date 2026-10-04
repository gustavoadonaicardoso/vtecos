'use client';

/**
 * Preferências de aviso DESTE aparelho (Configurações > Notificações).
 * Ficam no navegador porque valem por computador/celular: dá para
 * silenciar o som no notebook do escritório e manter no celular.
 * Os listeners (WhatsApp e notificações do sistema) leem daqui.
 */
export interface NotificationPrefs {
  /** Som ao chegar mensagem nova de cliente no WhatsApp. */
  whatsappSound: boolean;
  /** Pop-up do navegador ao chegar mensagem nova no WhatsApp. */
  whatsappPopup: boolean;
  /** Pop-up do navegador para avisos do sistema (tarefas, aprovações, senhas). */
  systemPopup: boolean;
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  whatsappSound: true,
  whatsappPopup: true,
  systemPopup: true,
};

const KEY = 'vtec-notification-prefs';

export function getNotificationPrefs(): NotificationPrefs {
  if (typeof window === 'undefined') return DEFAULT_NOTIFICATION_PREFS;
  try {
    const stored = localStorage.getItem(KEY);
    return stored ? { ...DEFAULT_NOTIFICATION_PREFS, ...JSON.parse(stored) } : DEFAULT_NOTIFICATION_PREFS;
  } catch {
    return DEFAULT_NOTIFICATION_PREFS;
  }
}

export function setNotificationPrefs(prefs: NotificationPrefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Navegador sem armazenamento: a preferência vale só até recarregar.
  }
}
