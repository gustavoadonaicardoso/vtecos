/**
 * ============================================================
 * VÓRTICE CRM — Respostas rápidas (Message Templates Service)
 * ============================================================
 * Respostas rápidas da empresa (tabela message_templates), sempre da
 * empresa da sessão. Cada uma tem nome, mensagem e um atalho opcional
 * para usar com "/" nas Mensagens (migration 202611020001).
 * ============================================================
 */

import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import {
  QUICK_REPLY_CONTENT_MAX,
  QUICK_REPLY_NAME_MAX,
  isValidShortcut,
  normalizeShortcut,
  type QuickReplyItem,
} from '@/lib/quick-replies';
import type { ServiceResult } from '@/types';

type Row = { id: string; name: string | null; content: string | null; shortcut?: string | null };

const toItem = (row: Row): QuickReplyItem => ({
  id: row.id,
  name: row.name || '',
  content: row.content || '',
  shortcut: row.shortcut || null,
});

const MISSING_COLUMN = 'Para usar atalhos, rode a migration 202611020001_quick_reply_shortcuts.sql no Supabase.';
const missingShortcutColumn = (message?: string) => Boolean(message && /shortcut/i.test(message) && /column|coluna/i.test(message));

/**
 * Respostas rápidas ativas da empresa. Com `all`, todas (para quem
 * gerencia); sem, só as liberadas para o usuário em Equipe > Acessos
 * (allowed_templates vazio = todas).
 */
export async function fetchVisibleTemplates(tenantId: string, userId: string, options: { all?: boolean } = {}) {
  const { data: templates, error } = await supabase
    .from('message_templates')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (error) return { success: false as const, error: error.message };
  const items = (templates || []).map((row) => toItem(row as Row));
  if (options.all) return { success: true as const, data: items };

  const { data: profile } = await supabase
    .from('profiles')
    .select('allowed_templates')
    .eq('tenant_id', tenantId)
    .eq('id', userId)
    .single();

  const allowed: string[] = profile?.allowed_templates ?? [];
  const visible = allowed.length > 0 ? items.filter((item) => allowed.includes(item.id)) : items;
  return { success: true as const, data: visible };
}

export interface QuickReplyInput {
  name?: string;
  content?: string;
  /** '' ou null = sem atalho. */
  shortcut?: string | null;
}

/** Confere e limpa o que veio do formulário. `partial` = edição (campos ausentes ficam como estão). */
export function parseQuickReply(body: Record<string, unknown>, partial: boolean): { ok: true; value: QuickReplyInput } | { ok: false; error: string } {
  const value: QuickReplyInput = {};
  if (!partial || body.name !== undefined) {
    const name = String(body.name ?? '').trim();
    if (!name) return { ok: false, error: 'Dê um nome para a resposta rápida.' };
    if (name.length > QUICK_REPLY_NAME_MAX) return { ok: false, error: `O nome pode ter até ${QUICK_REPLY_NAME_MAX} caracteres.` };
    value.name = name;
  }
  if (!partial || body.content !== undefined) {
    const content = String(body.content ?? '').trim();
    if (!content) return { ok: false, error: 'Escreva a mensagem.' };
    if (content.length > QUICK_REPLY_CONTENT_MAX) return { ok: false, error: `A mensagem pode ter até ${QUICK_REPLY_CONTENT_MAX} caracteres.` };
    value.content = content;
  }
  if (body.shortcut !== undefined) {
    const raw = body.shortcut === null ? '' : String(body.shortcut);
    const shortcut = normalizeShortcut(raw);
    if (raw.replace(/^\/+/, '').trim() && !shortcut) return { ok: false, error: 'O atalho usa só letras, números, "-" e "_".' };
    if (shortcut && !isValidShortcut(shortcut)) return { ok: false, error: 'O atalho usa só letras, números, "-" e "_", até 30 caracteres.' };
    value.shortcut = shortcut || null;
  }
  return { ok: true, value };
}

async function shortcutTaken(tenantId: string, shortcut: string, exceptId?: string) {
  let query = supabase
    .from('message_templates')
    .select('id, name')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .eq('shortcut', shortcut)
    .limit(1);
  if (exceptId) query = query.neq('id', exceptId);
  const { data, error } = await query;
  if (error) return { error: missingShortcutColumn(error.message) ? MISSING_COLUMN : error.message };
  const row = (data || [])[0] as { name?: string } | undefined;
  return { taken: row ? row.name || 'outra resposta' : null };
}

const takenMessage = (shortcut: string, owner: string) => `O atalho /${shortcut} já é usado em "${owner}". Escolha outro.`;

function saveError(message: string, shortcut?: string | null) {
  if (missingShortcutColumn(message)) return MISSING_COLUMN;
  if (/duplicate key|unique/i.test(message) && shortcut) return `O atalho /${shortcut} já está em uso. Escolha outro.`;
  return message;
}

export async function createTemplate(tenantId: string, input: QuickReplyInput): Promise<ServiceResult<QuickReplyItem>> {
  if (input.shortcut) {
    const check = await shortcutTaken(tenantId, input.shortcut);
    if (check.error) return { success: false, error: check.error };
    if (check.taken) return { success: false, error: takenMessage(input.shortcut, check.taken) };
  }
  const fields: Record<string, unknown> = { name: input.name, content: input.content };
  if (input.shortcut) fields.shortcut = input.shortcut;
  const { data, error } = await supabase
    .from('message_templates')
    .insert([{ ...fields, tenant_id: tenantId }])
    .select()
    .single();
  if (error) return { success: false, error: saveError(error.message, input.shortcut) };
  return { success: true, data: toItem(data as Row) };
}

export async function updateTemplate(tenantId: string, id: string, input: QuickReplyInput): Promise<ServiceResult> {
  if (input.shortcut) {
    const check = await shortcutTaken(tenantId, input.shortcut, id);
    if (check.error) return { success: false, error: check.error };
    if (check.taken) return { success: false, error: takenMessage(input.shortcut, check.taken) };
  }
  const updates: Record<string, unknown> = {};
  if (input.name !== undefined) updates.name = input.name;
  if (input.content !== undefined) updates.content = input.content;
  if (input.shortcut !== undefined) updates.shortcut = input.shortcut;
  if (Object.keys(updates).length === 0) return { success: true };

  let { data, error } = await supabase
    .from('message_templates')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .eq('is_active', true)
    .select('id');
  // Sem a migration não existe updated_at: salva o resto (sem atalho, ele já deu erro acima).
  if (error && /updated_at/i.test(error.message)) {
    ({ data, error } = await supabase.from('message_templates').update(updates).eq('tenant_id', tenantId).eq('id', id).eq('is_active', true).select('id'));
  }
  if (error) return { success: false, error: saveError(error.message, input.shortcut) };
  if (!data || data.length === 0) return { success: false, error: 'Resposta rápida não encontrada.' };
  return { success: true };
}

/** Soft delete — marca como inativa em vez de apagar. */
export async function deactivateTemplate(tenantId: string, id: string): Promise<ServiceResult> {
  const { error } = await supabase
    .from('message_templates')
    .update({ is_active: false })
    .eq('tenant_id', tenantId)
    .eq('id', id);

  if (error) return { success: false, error: error.message };
  return { success: true };
}
