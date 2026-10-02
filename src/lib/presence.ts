/** Tempo sem batimento a partir do qual o usuário não conta mais como online (fallback sem Realtime). */
export const PRESENCE_STALE_MS = 2.5 * 60_000;

/** "Visto agora há pouco", "Visto há 12 min", "Visto ontem às 18:40", "Visto em 12/09". */
export function formatLastSeen(lastSeenAt: string | null | undefined, now = Date.now()): string {
  if (!lastSeenAt) return 'Offline';
  const date = new Date(lastSeenAt);
  const time = date.getTime();
  if (Number.isNaN(time)) return 'Offline';

  const diff = Math.max(0, now - time);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'Visto agora há pouco';
  if (minutes < 60) return `Visto há ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const today = new Date(now);
  const sameDay = date.toDateString() === today.toDateString();
  const hhmm = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return hours === 1 ? 'Visto há 1 h' : `Visto há ${hours} h`;

  const yesterday = new Date(now - 86_400_000);
  if (date.toDateString() === yesterday.toDateString()) return `Visto ontem às ${hhmm}`;
  if (diff < 7 * 86_400_000) {
    return `Visto ${date.toLocaleDateString('pt-BR', { weekday: 'long' })} às ${hhmm}`;
  }
  return `Visto em ${date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: diff > 300 * 86_400_000 ? 'numeric' : undefined })}`;
}
