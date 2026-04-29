/**
 * ============================================================
 * VÓRTICE CRM — useRelativeTime hook
 * ============================================================
 * Formata timestamps em texto relativo ("2 min atrás", "3h atrás").
 * Extraído do NotificationDropdown para ser reutilizável.
 * ============================================================
 */

'use client';

export function useRelativeTime() {
  const format = (dateStr: string): string => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diff < 60) return 'Agora';
    if (diff < 3600) return `${Math.floor(diff / 60)}m atrás`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d atrás`;
    return date.toLocaleDateString('pt-BR');
  };

  return { format };
}
