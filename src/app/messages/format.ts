import type { ChatMessage, MessageKind } from './types';

const KINDS: MessageKind[] = ['text', 'audio', 'image', 'document'];

export function mapMessage(row: Record<string, unknown>): ChatMessage {
  const type = KINDS.includes(row.type as MessageKind) ? (row.type as MessageKind) : 'text';
  return {
    id: String(row.id),
    type,
    text: String(row.text ?? row.content ?? ''),
    mediaUrl: (row.audio_url as string) || null,
    sent: row.sent_by_me === true,
    status: (row.status as ChatMessage['status']) || null,
    createdAt: String(row.created_at || new Date().toISOString()),
    provider: (row.provider as string) || null,
  };
}

export const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

/** "Hoje", "Ontem" ou a data, para separar os dias na conversa. */
export function dayLabel(iso: string, now: number) {
  const date = new Date(iso);
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((start(new Date(now)) - start(date)) / 86400_000);
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Ontem';
  if (diff < 7) return date.toLocaleDateString('pt-BR', { weekday: 'long' });
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Hora (hoje), "ontem" ou data curta -- na lista de conversas. */
export function listTime(iso: string | null | undefined, now: number) {
  if (!iso) return '';
  const label = dayLabel(iso, now);
  return label === 'Hoje' ? timeOf(iso) : label === 'Ontem' ? 'ontem' : new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return `${parts[0]?.[0] || '?'}${parts.length > 1 ? parts[parts.length - 1][0] : ''}`.toUpperCase();
}

/**
 * Variáveis das respostas rápidas: {{nome}}, {{primeiro_nome}},
 * {{atendente}} (e os nomes das automações: {{lead.name}}, {{lead.first_name}}).
 */
export function fillTemplate(text: string, vars: { name: string; agent: string }) {
  const first = vars.name.trim().split(/\s+/)[0] || '';
  const map: Record<string, string> = {
    nome: vars.name,
    'lead.name': vars.name,
    primeiro_nome: first,
    'lead.first_name': first,
    atendente: vars.agent,
  };
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, key: string) => map[key.toLowerCase()] ?? match);
}

export const EMOJIS = ['😀', '😂', '😊', '😍', '😉', '😎', '🤔', '😅', '🙏', '👍', '👏', '💪', '🙌', '🎉', '✅', '❤️', '🔥', '⭐', '📅', '📞', '💬', '📍', '💰', '🛒', '📦', '🚚', '⏰', '👋', '😢', '😮', '🤝', '✨'];
