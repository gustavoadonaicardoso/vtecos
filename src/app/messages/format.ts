import type { ChatMessage, MessageKind } from './types';
import type { Lead } from '@/types';
import { emptyContext } from '@/lib/automations/flow';
import { isKnownMessageVariable, messageVariableValue } from '@/lib/message-variables';

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
 * Variáveis das respostas rápidas: as mesmas das mensagens agendadas
 * ({{nome}}, {{primeiro_nome}}, {{email_acesso}}, {{campo.chave}}...),
 * {{atendente}} e os nomes das automações. Variável que o sistema não
 * conhece fica como está. A senha ({{senha_acesso}}) só entra quando
 * `password` vem preenchida (lida do servidor na hora de inserir); na
 * prévia aparece "••••••".
 */
export function fillTemplate(text: string, vars: { name: string; agent: string; lead?: Lead | null; password?: string | null }) {
  const lead = vars.lead;
  const ctx = emptyContext({
    lead: {
      ...emptyContext().lead,
      id: lead?.id || '',
      name: lead?.name || vars.name,
      phone: lead?.phone || '',
      email: lead?.email || '',
      cpf_cnpj: lead?.cpfCnpj || '',
      tags: lead?.tags || [],
      value: lead?.valueNumber || 0,
      source: lead?.source || '',
      created_at: lead?.createdAt || '',
      stage_changed_at: lead?.stageChangedAt || '',
      protocol: lead?.protocol || '',
      extra: lead?.extra || {},
      custom: lead?.customFields || {},
      access_password: vars.password === undefined ? '••••••' : vars.password || '',
    },
  });
  return text.replace(/\{\{\s*([\w.]+)\s*(?:\|([^}]*))?\}\}/g, (match, key: string, fallback?: string) => {
    if (!isKnownMessageVariable(key)) return match;
    return messageVariableValue(key, ctx, { agentName: vars.agent }) || (fallback ?? '').trim();
  });
}

export const EMOJIS = ['😀', '😂', '😊', '😍', '😉', '😎', '🤔', '😅', '🙏', '👍', '👏', '💪', '🙌', '🎉', '✅', '❤️', '🔥', '⭐', '📅', '📞', '💬', '📍', '💰', '🛒', '📦', '🚚', '⏰', '👋', '😢', '😮', '🤝', '✨'];
