import type { SocialPostStatus } from '@/types';

export const POST_STATUS_META: Record<SocialPostStatus, { label: string; color: string }> = {
  draft: { label: 'Rascunho', color: '#64748b' },
  pending_approval: { label: 'Aguardando aprovação', color: '#f59e0b' },
  rejected: { label: 'Reprovado', color: '#ef4444' },
  scheduled: { label: 'Agendado', color: '#3b82f6' },
  publishing: { label: 'Publicando…', color: '#8b5cf6' },
  published: { label: 'Publicado', color: '#10b981' },
  published_late: { label: 'Publicado com atraso', color: '#10b981' },
  partial: { label: 'Publicado em parte', color: '#f59e0b' },
  failed: { label: 'Falhou', color: '#ef4444' },
};

/** Data que define onde o post aparece no calendário. */
export function postCalendarDate(post: { scheduled_at: string | null; published_at: string | null }) {
  return post.published_at || post.scheduled_at;
}

export function formatDateTime(value: string | null) {
  if (!value) return 'Sem data';
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
