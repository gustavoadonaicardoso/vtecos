/**
 * Textos curtos dos avisos ("desde 14:05", "qua, 08/10 das 22:00 às
 * 23:30"), usados na faixa do topo e na prévia do Painel Master.
 */

import { serviceLabel, type NoticeKind, type NoticePhase } from '@/lib/status/types';

const TZ = 'America/Sao_Paulo';
const time = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
const dayKey = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: TZ });
const day = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: TZ }).replace('.', '');

/** "14:05" se for hoje, senão "qua, 08/10 14:05". */
export function when(iso: string, now = new Date()) {
  return dayKey(iso) === dayKey(now.toISOString()) ? time(iso) : `${day(iso)} ${time(iso)}`;
}

export function windowText(startsAt: string, endsAt: string | null, now = new Date()) {
  if (!endsAt) return when(startsAt, now);
  return dayKey(startsAt) === dayKey(endsAt) ? `${when(startsAt, now)} às ${time(endsAt)}` : `${when(startsAt, now)} até ${when(endsAt, now)}`;
}

export const servicesText = (services: string[]) => services.map(serviceLabel).join(', ');

/** Linha de contexto ao lado do título. */
export function noticeContext(notice: { kind: NoticeKind; phase: NoticePhase; services: string[]; startsAt: string; endsAt: string | null; resolvedAt: string | null }, now = new Date()) {
  const affected = notice.services.length ? servicesText(notice.services) : '';
  if (notice.phase === 'resolved') {
    const at = notice.resolvedAt ? when(notice.resolvedAt, now) : '';
    return notice.kind === 'maintenance' ? `Manutenção concluída${at ? ` às ${at}` : ''}` : `Resolvido${at ? ` às ${at}` : ''}`;
  }
  if (notice.kind === 'maintenance') {
    return notice.phase === 'scheduled'
      ? `Manutenção programada: ${windowText(notice.startsAt, notice.endsAt, now)}${affected ? ` · ${affected}` : ''}`
      : `Em manutenção${notice.endsAt ? ` até ${when(notice.endsAt, now)}` : ''}${affected ? ` · ${affected}` : ''}`;
  }
  if (notice.phase === 'scheduled') return `A partir de ${when(notice.startsAt, now)}`;
  if (notice.kind === 'incident') return `${affected ? `Afeta ${affected} · ` : ''}desde ${when(notice.startsAt, now)}`;
  return affected;
}
