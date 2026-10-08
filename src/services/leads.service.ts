/**
 * ============================================================
 * VÓRTICE CRM — Lead Service
 * ============================================================
 * Responsável por TODAS as operações de banco relacionadas
 * a Leads e Pipeline Stages. Nenhum componente ou context
 * deve fazer queries Supabase diretamente para leads.
 * ============================================================
 */

import { Lead, LeadTag, PipelineStage, ServiceResult } from '@/types';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';

type Row = Record<string, unknown>;

const CHANNEL_BY_SOURCE: Record<string, string> = {
  whatsapp: 'whatsapp',
  formulário: 'site',
  formulario: 'site',
  site: 'site',
  instagram: 'instagram',
  facebook: 'facebook',
};

export const brl = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);

/** "R$ 1.234,50", "1234.5" ou 1234.5 -> 1234.5 */
export function parseMoney(input: unknown): number {
  if (typeof input === 'number') return Number.isFinite(input) ? input : 0;
  const text = String(input ?? '').replace(/\s|R\$/gi, '');
  if (!text) return 0;
  // Com vírgula ou "15.000": formato brasileiro (ponto é milhar). Senão, ponto é decimal.
  const normalized = text.includes(',') || /^\d{1,3}(\.\d{3})+$/.test(text) ? text.replace(/\./g, '').replace(',', '.') : text;
  const value = Number.parseFloat(normalized.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(value) ? Math.max(0, Math.round(value * 100) / 100) : 0;
}

const digits = (value: unknown) => String(value ?? '').replace(/\D/g, '');

// ─── Mapeamento de dados do banco → tipo Lead ─────────────────

function mapDbRowToLead(row: Row): Lead {
  const value = Number(row.value) || 0;
  const source = String(row.source || '');
  const stored = Array.isArray(row.channels) ? (row.channels as string[]).map((item) => item.replace('whatsapp_meta', 'whatsapp')) : [];
  const inferred = CHANNEL_BY_SOURCE[source.toLowerCase()] || (row.phone ? 'whatsapp' : '');
  const channels = Array.from(new Set([...stored, inferred].filter(Boolean)));
  return {
    id: String(row.id),
    name: String(row.name || 'Sem nome'),
    email: String(row.email || ''),
    phone: String(row.phone || ''),
    cpfCnpj: String(row.cpf_cnpj || ''),
    value: brl(value),
    valueNumber: value,
    pipelineStage: String(row.stage_id || ''),
    tags: Array.isArray(row.tags) ? (row.tags as unknown[]).map(String).filter(Boolean) : [],
    channels,
    status: row.blocked === true ? 'Bloqueado' : 'Ativo',
    color: '#3b82f6',
    lastMsg: String(row.last_msg || ''),
    entryDate: row.created_at ? new Date(String(row.created_at)).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '',
    createdAt: row.created_at ? String(row.created_at) : undefined,
    source,
    waitTime: Number(row.wait_time_minutes) || 0,
    handlingTime: Number(row.handling_time_minutes) || 0,
    assignedTo: (row.assigned_to as string) || null,
    notes: String(row.notes || ''),
    lastActivityAt: (row.last_activity_at as string) || null,
    stageChangedAt: (row.stage_changed_at as string) || (row.created_at as string) || null,
    unreadCount: Number(row.unread_count) || 0,
    aiPausedUntil: (row.ai_paused_until as string) || null,
    chatChannel: row.chat_channel === 'instagram' || row.chat_channel === 'messenger' ? row.chat_channel : 'whatsapp',
    instagramUsername: (row.instagram_username as string) || null,
  };
}

/** Etiquetas: texto curto, sem repetir (ignora maiúsculas), no máximo 20. */
export function sanitizeTags(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const item of input) {
    const tag = String(item ?? '').trim().slice(0, 40);
    if (!tag || seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase());
    tags.push(tag);
  }
  return tags.slice(0, 20);
}

export type LeadInput = Partial<Pick<Lead, 'name' | 'email' | 'phone' | 'cpfCnpj' | 'pipelineStage' | 'assignedTo' | 'tags' | 'notes' | 'status'>> & {
  value?: unknown;
};

/** Valida e converte para colunas do banco. Erro = texto para a pessoa. */
export function leadInputToDb(input: LeadInput, { creating }: { creating: boolean }): { data: Row } | { error: string } {
  const data: Row = {};
  if (input.name !== undefined || creating) {
    const name = String(input.name ?? '').trim();
    if (!name) return { error: 'Informe o nome do lead.' };
    data.name = name.slice(0, 120);
  }
  if (input.phone !== undefined || creating) {
    const phone = String(input.phone ?? '').trim();
    // Cadastro: DDD + número. Edição aceita números antigos (WhatsApp de fora, etc.).
    const count = digits(phone).length;
    if (creating ? count < 10 || count > 15 : count < 8 || count > 20) return { error: 'Informe o telefone com DDD (10 a 13 números).' };
    data.phone = phone.slice(0, 30);
  }
  if (input.email !== undefined) {
    const email = String(input.email ?? '').trim().toLowerCase();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'E-mail inválido.' };
    data.email = email || null;
  }
  if (input.cpfCnpj !== undefined) {
    const doc = String(input.cpfCnpj ?? '').trim();
    if (doc && ![11, 14].includes(digits(doc).length)) return { error: 'CPF deve ter 11 números e CNPJ 14.' };
    data.cpf_cnpj = doc || null;
  }
  if (input.value !== undefined) data.value = parseMoney(input.value);
  if (input.pipelineStage !== undefined && input.pipelineStage) data.stage_id = String(input.pipelineStage);
  if (input.assignedTo !== undefined) data.assigned_to = input.assignedTo || null;
  if (input.tags !== undefined) data.tags = sanitizeTags(input.tags);
  if (input.notes !== undefined) data.notes = String(input.notes ?? '').slice(0, 4000) || null;
  if (input.status !== undefined) data.blocked = input.status === 'Bloqueado';
  return { data };
}

// ─── CRUD de Leads ────────────────────────────────────────────

/**
 * Busca todos os leads e stages do banco.
 * Retorna dados mapeados para o formato da aplicação.
 */
export async function fetchLeadsAndStages(tenantId: string, filters?: {
  userId?: string;
  role?: string;
}): Promise<{
  leads: Lead[];
  stages: PipelineStage[];
} | null> {
  try {
    let leadsQuery = supabase.from('leads').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(10000);

    if (filters?.role === 'SELLER' && filters?.userId) {
      leadsQuery = leadsQuery.eq('assigned_to', filters.userId);
    }

    const [stagesRes, leadsRes] = await Promise.all([
      supabase.from('pipeline_stages').select('*').eq('tenant_id', tenantId).order('position'),
      leadsQuery,
    ]);

    if (stagesRes.error || leadsRes.error) return null;
    if (!stagesRes.data || !leadsRes.data) return null;

    const leads = (leadsRes.data as Row[]).map(mapDbRowToLead);

    const stages: PipelineStage[] = stagesRes.data.map((s) => ({
      id: s.id,
      name: s.name,
      color: s.color,
      leads: leads.filter((l) => l.pipelineStage === s.id).map((l) => l.id),
    }));

    return { leads, stages };
  } catch (err) {
    console.error('[LeadService] fetchLeadsAndStages:', err);
    return null;
  }
}

/**
 * Um lead só (a tela atualiza o que mudou sem baixar a lista inteira).
 * Vendedor só recebe os próprios, como na lista.
 */
export async function fetchLeadById(tenantId: string, leadId: string, filters?: { userId?: string; role?: string }): Promise<Lead | null> {
  if (!/^[0-9a-f-]{36}$/i.test(leadId)) return null;
  let query = supabase.from('leads').select('*').eq('tenant_id', tenantId).eq('id', leadId);
  if (filters?.role === 'SELLER' && filters?.userId) query = query.eq('assigned_to', filters.userId);
  const { data } = await query.maybeSingle();
  return data ? mapDbRowToLead(data as Row) : null;
}

/** Lead desta empresa com o mesmo telefone (compara os últimos 8 números). */
export async function findLeadByPhone(tenantId: string, phone: string) {
  const suffix = digits(phone).slice(-8);
  if (suffix.length < 8) return null;
  const { data } = await supabase.from('leads').select('id, name, phone, assigned_to').eq('tenant_id', tenantId).ilike('phone', `%${suffix.slice(-4)}%`).limit(200);
  return ((data || []) as Row[]).find((row) => digits(row.phone).endsWith(suffix)) as { id: string; name: string; phone: string; assigned_to: string | null } | undefined ?? null;
}

/**
 * Cria um novo lead no banco e retorna o objeto mapeado.
 */
export async function createLead(tenantId: string, input: LeadInput): Promise<ServiceResult<Lead>> {
  const parsed = leadInputToDb(input, { creating: true });
  if ('error' in parsed) return { success: false, error: parsed.error };

  if (!parsed.data.stage_id) {
    const { data: first } = await supabase.from('pipeline_stages').select('id').eq('tenant_id', tenantId).order('position').limit(1).maybeSingle();
    if (first) parsed.data.stage_id = first.id;
  }

  const row: Row = { ...parsed.data, source: 'Manual' };
  let { data, error } = await supabase.from('leads').insert([{ ...row, tenant_id: tenantId }]).select().single();
  // Bancos sem as colunas novas (migration pendente): grava o básico.
  if (error && /column/i.test(error.message)) {
    const { tags: _tags, notes: _notes, blocked: _blocked, ...basic } = row as Row;
    void _tags; void _notes; void _blocked;
    ({ data, error } = await supabase.from('leads').insert([{ ...basic, tenant_id: tenantId }]).select().single());
  }

  if (error || !data) return { success: false, error: error?.message || 'Erro ao criar lead' };
  if (Array.isArray(row.tags)) await registerTags(tenantId, row.tags as string[]);
  return { success: true, data: mapDbRowToLead(data as Row) };
}

/**
 * Atualiza campos de um lead no banco.
 */
export async function updateLeadInDb(tenantId: string, leadId: string, updates: LeadInput): Promise<ServiceResult<Lead>> {
  const parsed = leadInputToDb(updates, { creating: false });
  if ('error' in parsed) return { success: false, error: parsed.error };
  if (Object.keys(parsed.data).length === 0) return { success: true };

  const { data, error } = await supabase
    .from('leads')
    .update(parsed.data)
    .eq('tenant_id', tenantId)
    .eq('id', leadId)
    .select()
    .maybeSingle();

  if (error) return { success: false, error: /column/i.test(error.message) ? 'Rode a migration 202610100001_leads_review.sql no Supabase para salvar etiquetas, observações e bloqueio.' : error.message };
  if (!data) return { success: false, error: 'Lead não encontrado.' };
  if (parsed.data.tags) await registerTags(tenantId, parsed.data.tags as string[]);
  return { success: true, data: mapDbRowToLead(data as Row) };
}

/** Etapa atual do lead (para saber se a mudança é de verdade). */
export async function fetchLeadStage(tenantId: string, leadId: string): Promise<string | null> {
  const { data } = await supabase.from('leads').select('stage_id').eq('tenant_id', tenantId).eq('id', leadId).maybeSingle();
  return (data?.stage_id as string) ?? null;
}

/**
 * Move um lead para outra stage no banco.
 */
export async function moveLeadToStage(tenantId: string, leadId: string, stageId: string): Promise<ServiceResult> {
  const { error } = await supabase.from('leads').update({ stage_id: stageId }).eq('tenant_id', tenantId).eq('id', leadId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/**
 * Remove um lead permanentemente do banco.
 */
export async function deleteLeadFromDb(tenantId: string, leadId: string): Promise<ServiceResult> {
  const { error } = await supabase.from('leads').delete().eq('tenant_id', tenantId).eq('id', leadId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/**
 * Busca só o dono (assigned_to) de um lead -- usado pra checar
 * propriedade antes de deixar um SELLER editar/apagar.
 */
export async function fetchLeadOwner(tenantId: string, leadId: string): Promise<string | null> {
  const { data } = await supabase.from('leads').select('assigned_to').eq('tenant_id', tenantId).eq('id', leadId).maybeSingle();
  return data?.assigned_to ?? null;
}

/** Nome do lead (para o registro de auditoria). */
export async function fetchLeadName(tenantId: string, leadId: string): Promise<string | null> {
  const { data } = await supabase.from('leads').select('name').eq('tenant_id', tenantId).eq('id', leadId).maybeSingle();
  return (data?.name as string) ?? null;
}

// ─── Ações em massa ───────────────────────────────────────────

export type BulkAction = 'assign' | 'stage' | 'addTag' | 'removeTag' | 'block' | 'unblock' | 'delete';

/**
 * Aplica uma ação a vários leads da empresa. `ownerId`: quando informado
 * (vendedor), só mexe nos leads dele.
 */
export async function bulkUpdateLeads(
  tenantId: string,
  ids: string[],
  action: BulkAction,
  value: string | null,
  ownerId: string | null
): Promise<ServiceResult<{ count: number; ids: string[]; changed: string[] }>> {
  let query = supabase.from('leads').select('id, tags, stage_id').eq('tenant_id', tenantId).in('id', ids);
  if (ownerId) query = query.eq('assigned_to', ownerId);
  const { data: rows, error } = await query;
  if (error) return { success: false, error: error.message };
  const targets = (rows || []) as { id: string; tags: string[] | null; stage_id: string | null }[];
  if (targets.length === 0) return { success: true, data: { count: 0, ids: [], changed: [] } };
  const targetIds = targets.map((row) => row.id);
  // Leads que de fato mudaram (ex.: ganharam a etiqueta agora) -- disparam automações.
  const changed: string[] = [];

  if (action === 'delete') {
    const { error: deleteError } = await supabase.from('leads').delete().eq('tenant_id', tenantId).in('id', targetIds);
    if (deleteError) return { success: false, error: deleteError.message };
  } else if (action === 'assign' || action === 'stage' || action === 'block' || action === 'unblock') {
    const update: Row =
      action === 'assign' ? { assigned_to: value || null }
        : action === 'stage' ? { stage_id: value }
          : { blocked: action === 'block' };
    const { error: updateError } = await supabase.from('leads').update(update).eq('tenant_id', tenantId).in('id', targetIds);
    if (updateError) return { success: false, error: updateError.message };
  } else {
    const tag = String(value || '').trim().slice(0, 40);
    if (!tag) return { success: false, error: 'Escolha a etiqueta.' };
    for (const row of targets) {
      const current = Array.isArray(row.tags) ? row.tags : [];
      const has = current.some((item) => item.toLowerCase() === tag.toLowerCase());
      if (action === 'addTag' && has) continue;
      if (action === 'removeTag' && !has) continue;
      const next = action === 'addTag' ? sanitizeTags([...current, tag]) : current.filter((item) => item.toLowerCase() !== tag.toLowerCase());
      const { error: tagError } = await supabase.from('leads').update({ tags: next }).eq('tenant_id', tenantId).eq('id', row.id);
      if (tagError) return { success: false, error: tagError.message };
      changed.push(row.id);
    }
    if (action === 'addTag') await registerTags(tenantId, [tag]);
  }

  return { success: true, data: { count: targetIds.length, ids: targetIds, changed } };
}

// ─── Etiquetas da empresa ─────────────────────────────────────

const TAG_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#64748b'];

/** Garante que as etiquetas usadas existam no cadastro da empresa. */
export async function registerTags(tenantId: string, tags: string[]) {
  if (tags.length === 0) return;
  const { data } = await supabase.from('lead_tags').select('name').eq('tenant_id', tenantId);
  if (!data) return; // tabela ainda não criada
  const known = new Set(data.map((row) => String(row.name).toLowerCase()));
  const missing = tags.filter((tag) => !known.has(tag.toLowerCase()));
  if (missing.length === 0) return;
  await supabase.from('lead_tags').insert(missing.map((name, index) => ({ tenant_id: tenantId, name, color: TAG_COLORS[(known.size + index) % TAG_COLORS.length] })));
}

export async function listLeadTags(tenantId: string): Promise<ServiceResult<LeadTag[]>> {
  const [tagsRes, leadsRes] = await Promise.all([
    supabase.from('lead_tags').select('name, color').eq('tenant_id', tenantId).order('name'),
    supabase.from('leads').select('tags').eq('tenant_id', tenantId).limit(10000),
  ]);
  if (tagsRes.error) {
    return /lead_tags|schema cache|does not exist/i.test(tagsRes.error.message)
      ? { success: false, error: 'Rode a migration 202610100001_leads_review.sql no Supabase para cadastrar etiquetas.' }
      : { success: false, error: tagsRes.error.message };
  }
  const counts = new Map<string, number>();
  for (const row of (leadsRes.data || []) as { tags: unknown }[]) {
    for (const tag of Array.isArray(row.tags) ? row.tags : []) {
      const key = String(tag).toLowerCase();
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  return { success: true, data: (tagsRes.data || []).map((tag) => ({ name: tag.name, color: tag.color, count: counts.get(String(tag.name).toLowerCase()) || 0 })) };
}

export async function createLeadTag(tenantId: string, name: string, color: string): Promise<ServiceResult> {
  const tag = name.trim().slice(0, 40);
  if (!tag) return { success: false, error: 'Dê um nome à etiqueta.' };
  const { error } = await supabase.from('lead_tags').insert({ tenant_id: tenantId, name: tag, color: /^#[0-9a-f]{6}$/i.test(color) ? color : TAG_COLORS[0] });
  if (error) return { success: false, error: /duplicate|unique/i.test(error.message) ? 'Já existe uma etiqueta com esse nome.' : error.message };
  return { success: true };
}

/** Renomeia ou recolore; renomear troca também nos leads. */
export async function updateLeadTag(tenantId: string, name: string, changes: { name?: string; color?: string }): Promise<ServiceResult<{ leads: number }>> {
  const nextName = changes.name?.trim().slice(0, 40);
  const update: Row = {};
  if (nextName) update.name = nextName;
  if (changes.color && /^#[0-9a-f]{6}$/i.test(changes.color)) update.color = changes.color;
  if (Object.keys(update).length === 0) return { success: true, data: { leads: 0 } };

  const id = await tagId(tenantId, name);
  if (!id) return { success: false, error: 'Etiqueta não encontrada.' };
  const { error } = await supabase.from('lead_tags').update(update).eq('tenant_id', tenantId).eq('id', id);
  if (error) return { success: false, error: /duplicate|unique/i.test(error.message) ? 'Já existe uma etiqueta com esse nome.' : error.message };

  let changed = 0;
  if (nextName && nextName !== name) changed = await replaceTagOnLeads(tenantId, name, nextName);
  return { success: true, data: { leads: changed } };
}

/** Apaga a etiqueta do cadastro e tira dos leads. */
export async function deleteLeadTag(tenantId: string, name: string): Promise<ServiceResult<{ leads: number }>> {
  const id = await tagId(tenantId, name);
  if (id) {
    const { error } = await supabase.from('lead_tags').delete().eq('tenant_id', tenantId).eq('id', id);
    if (error) return { success: false, error: error.message };
  }
  return { success: true, data: { leads: await replaceTagOnLeads(tenantId, name, null) } };
}

async function tagId(tenantId: string, name: string) {
  const { data } = await supabase.from('lead_tags').select('id, name').eq('tenant_id', tenantId);
  return (data || []).find((row) => String(row.name).toLowerCase() === name.toLowerCase())?.id as string | undefined;
}

async function replaceTagOnLeads(tenantId: string, from: string, to: string | null) {
  const { data } = await supabase.from('leads').select('id, tags').eq('tenant_id', tenantId).limit(10000);
  let changed = 0;
  for (const row of (data || []) as { id: string; tags: unknown }[]) {
    const tags = Array.isArray(row.tags) ? (row.tags as string[]) : [];
    if (!tags.some((tag) => tag.toLowerCase() === from.toLowerCase())) continue;
    const next = sanitizeTags(tags.map((tag) => (tag.toLowerCase() === from.toLowerCase() ? to : tag)).filter(Boolean));
    await supabase.from('leads').update({ tags: next }).eq('tenant_id', tenantId).eq('id', row.id);
    changed += 1;
  }
  return changed;
}

/**
 * Verifica se um ID é local (mock/dev) ou real (banco UUID).
 * IDs mock seguem o padrão 'lead-<número>'.
 */
export function isLocalLeadId(leadId: string): boolean {
  return leadId.startsWith('lead-');
}
