/**
 * ============================================================
 * VÓRTICE CRM — Respostas rápidas (regras do atalho)
 * ============================================================
 * Atalho = a palavra usada com "/" no campo de mensagem, como no
 * WhatsApp Business (/boasvindas). Só letras minúsculas sem acento,
 * números, "-" e "_", até 30 caracteres. Arquivo puro: usado no
 * navegador e no servidor.
 * ============================================================
 */

export const SHORTCUT_MAX = 30;
export const QUICK_REPLY_NAME_MAX = 60;
export const QUICK_REPLY_CONTENT_MAX = 2000;

export interface QuickReplyItem {
  id: string;
  name: string;
  content: string;
  shortcut: string | null;
}

/**
 * "/Boas Vindas!" → "boas-vindas". Vazio quando não sobra nada.
 * `typing`: enquanto a pessoa digita, mantém o "-" do fim ("boas-" → "boas-").
 */
export function normalizeShortcut(value: string, typing = false) {
  const clean = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/^\/+/, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(typing ? /^-+/ : /^-+|-+$/g, '');
  return clean.slice(0, SHORTCUT_MAX);
}

export const isValidShortcut = (value: string) => /^[a-z0-9_-]{1,30}$/.test(value);

/** Atalho sugerido a partir do nome ("Boas-vindas" → "boas-vindas"). */
export const suggestShortcut = (name: string) => normalizeShortcut(name);

/**
 * Respostas para o que foi digitado depois da "/": primeiro as de atalho
 * que começa com o termo, depois atalho que contém, depois nome que contém.
 */
export function matchQuickReplies<T extends QuickReplyItem>(replies: T[], term: string, limit = 8): T[] {
  const query = normalizeShortcut(term);
  if (!query) return replies.slice(0, limit);
  const plain = (text: string) => normalizeShortcut(text).replace(/[-_]/g, '');
  const bare = query.replace(/[-_]/g, '');
  const scored = replies
    .map((reply) => {
      const shortcut = reply.shortcut || '';
      const score = shortcut.startsWith(query) ? 0
        : plain(shortcut).startsWith(bare) ? 1
          : shortcut.includes(query) ? 2
            : plain(reply.name).includes(bare) ? 3
              : -1;
      return { reply, score };
    })
    .filter((item) => item.score >= 0)
    .sort((a, b) => a.score - b.score || (a.reply.shortcut || a.reply.name).localeCompare(b.reply.shortcut || b.reply.name));
  return scored.slice(0, limit).map((item) => item.reply);
}

/**
 * A "/termo" que está sendo digitada logo antes do cursor (início do texto
 * ou depois de espaço/quebra de linha). null quando não há.
 */
export function slashQueryAt(text: string, caret: number): { start: number; term: string } | null {
  const before = text.slice(0, caret);
  const match = before.match(/(^|\s)\/([^\s/]{0,30})$/);
  if (!match) return null;
  return { start: before.length - match[2].length - 1, term: match[2] };
}
