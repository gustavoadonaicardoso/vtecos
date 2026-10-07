/**
 * ============================================================
 * VTEC OS — Automações: fluxos e execuções (server-only)
 * ============================================================
 * Tudo recebe o tenantId da sessão: cada empresa vê e edita só os
 * próprios fluxos. A execução fica em src/lib/automations/engine.ts.
 * ============================================================
 */

import { supabaseAdmin } from '@/lib/supabase-admin';
import { randomUUID } from 'crypto';
import { cancelWaitingRuns, newWebhookToken } from '@/lib/automations/engine';
import { DEFAULT_CONFIG, DEFAULT_LABEL, normalizeGraph, TRIGGER_EVENT, triggerOf, validateFlow, type FlowGraph } from '@/lib/automations/flow';
import type { ServiceResult } from '@/types';
import { aiConfigured } from '@/lib/ai';

export interface FlowSummary {
  id: string;
  name: string;
  description: string;
  status: 'draft' | 'active' | 'paused';
  trigger_event: string | null;
  updated_at: string;
  nodes: number;
  runs_7d: number;
  failed_7d: number;
}

export interface FlowDetail extends Omit<FlowSummary, 'nodes' | 'runs_7d' | 'failed_7d'> {
  graph: FlowGraph;
  /** Só aparece para quem edita (é o segredo do gatilho "Chamada de outro sistema"). */
  webhook_token?: string | null;
}

const DETAIL_COLUMNS = 'id, name, description, status, trigger_event, updated_at, graph, webhook_token';

const missingTable = (message?: string) => Boolean(message && /automation_(flows|runs)|schema cache|does not exist/i.test(message));
const MIGRATION_HINT = 'Rode a migration 202610090001_automations.sql no Supabase para usar as automações.';

export function starterGraph(): FlowGraph {
  return {
    nodes: [{ id: 'trigger', type: 'trigger-message', label: DEFAULT_LABEL['trigger-message'], x: 80, y: 160, config: { ...DEFAULT_CONFIG['trigger-message'] } }],
    connections: [],
    variables: [],
  };
}

export async function listFlows(tenantId: string): Promise<ServiceResult<FlowSummary[]>> {
  const { data, error } = await supabaseAdmin
    .from('automation_flows')
    .select('id, name, description, status, trigger_event, updated_at, graph')
    .eq('tenant_id', tenantId)
    .order('updated_at', { ascending: false });
  if (error) return { success: false, error: missingTable(error.message) ? MIGRATION_HINT : error.message };

  const since = new Date(Date.now() - 7 * 86400_000).toISOString();
  const { data: runs } = await supabaseAdmin.from('automation_runs').select('flow_id, status').eq('tenant_id', tenantId).gte('started_at', since).limit(5000);
  const stats = new Map<string, { total: number; failed: number }>();
  for (const run of runs || []) {
    const item = stats.get(run.flow_id) || { total: 0, failed: 0 };
    item.total += 1;
    if (run.status === 'failed') item.failed += 1;
    stats.set(run.flow_id, item);
  }

  return {
    success: true,
    data: (data || []).map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      status: row.status,
      trigger_event: row.trigger_event,
      updated_at: row.updated_at,
      nodes: Array.isArray(row.graph?.nodes) ? row.graph.nodes.length : 0,
      runs_7d: stats.get(row.id)?.total || 0,
      failed_7d: stats.get(row.id)?.failed || 0,
    })),
  };
}

export async function getFlow(tenantId: string, id: string): Promise<FlowDetail | null> {
  const { data } = await supabaseAdmin
    .from('automation_flows')
    .select(DETAIL_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .maybeSingle();
  if (!data) return null;
  return { ...data, graph: normalizeGraph(data.graph) } as FlowDetail;
}

const cleanText = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

export async function createFlow(tenantId: string, userId: string, input: { name?: unknown; description?: unknown; graph?: unknown }): Promise<ServiceResult<FlowDetail>> {
  const name = cleanText(input.name, 80);
  if (!name) return { success: false, error: 'Dê um nome ao fluxo.' };
  const graph = input.graph ? normalizeGraph(input.graph) : starterGraph();
  const trigger = triggerOf(graph);

  const { data, error } = await supabaseAdmin
    .from('automation_flows')
    .insert({
      tenant_id: tenantId,
      name,
      description: cleanText(input.description, 300),
      status: 'draft',
      graph,
      trigger_event: trigger ? TRIGGER_EVENT[trigger.type] : null,
      webhook_token: trigger?.type === 'trigger-webhook' ? newWebhookToken() : null,
      created_by: userId,
    })
    .select(DETAIL_COLUMNS)
    .single();
  if (error) return { success: false, error: missingTable(error.message) ? MIGRATION_HINT : error.message };
  return { success: true, data: { ...data, graph: normalizeGraph(data.graph) } as FlowDetail };
}

export type UpdateResult = ServiceResult<FlowDetail> & { problems?: string[]; paused?: boolean };

/**
 * Salva nome, descrição, grafo e/ou status. Ativar exige um fluxo sem
 * problemas; salvar um fluxo ativo com problemas pausa o fluxo (assim
 * nada sai pela metade enquanto ele é editado).
 */
export async function updateFlow(tenantId: string, id: string, input: { name?: unknown; description?: unknown; graph?: unknown; status?: unknown; regenerateToken?: unknown }): Promise<UpdateResult> {
  const current = await getFlow(tenantId, id);
  if (!current) return { success: false, error: 'Fluxo não encontrado.' };

  const graph = input.graph !== undefined ? normalizeGraph(input.graph) : current.graph;
  const requested = ['draft', 'active', 'paused'].includes(input.status as string) ? (input.status as FlowDetail['status']) : current.status;
  const { errors } = validateFlow(graph);

  if (requested === 'active' && current.status !== 'active' && errors.length > 0) {
    return { success: false, error: 'Corrija o fluxo antes de ativar.', problems: errors };
  }

  let status = requested;
  let paused = false;
  if (status === 'active' && errors.length > 0) {
    status = 'paused';
    paused = true;
  }

  const trigger = triggerOf(graph);
  const updates: Record<string, unknown> = {
    graph,
    status,
    trigger_event: trigger ? TRIGGER_EVENT[trigger.type] : null,
    updated_at: new Date().toISOString(),
  };
  // Gatilho "Chamada de outro sistema" precisa de um endereço secreto.
  if (trigger?.type === 'trigger-webhook' && (!current.webhook_token || input.regenerateToken === true)) updates.webhook_token = newWebhookToken();
  // Ativou agora: horários que já passaram hoje não disparam de uma vez.
  if (status === 'active' && current.status !== 'active') updates.last_fired_at = new Date().toISOString();
  if (input.name !== undefined) {
    const name = cleanText(input.name, 80);
    if (!name) return { success: false, error: 'Dê um nome ao fluxo.' };
    updates.name = name;
  }
  if (input.description !== undefined) updates.description = cleanText(input.description, 300);

  const { data, error } = await supabaseAdmin
    .from('automation_flows')
    .update(updates)
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .select(DETAIL_COLUMNS)
    .single();
  if (error) return { success: false, error: error.message };

  if (current.status === 'active' && status !== 'active') {
    await cancelWaitingRuns(tenantId, id, paused ? 'Fluxo pausado: ficou com problemas depois de uma edição.' : 'Fluxo pausado.');
  }

  return { success: true, data: { ...data, graph: normalizeGraph(data.graph) } as FlowDetail, problems: errors, paused };
}

export async function deleteFlow(tenantId: string, id: string): Promise<ServiceResult> {
  const { error } = await supabaseAdmin.from('automation_flows').delete().eq('tenant_id', tenantId).eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function listRuns(tenantId: string, flowId: string) {
  const { data } = await supabaseAdmin
    .from('automation_runs')
    .select('id, lead_id, status, waiting_for, resume_at, steps, error, started_at, finished_at')
    .eq('tenant_id', tenantId)
    .eq('flow_id', flowId)
    .order('started_at', { ascending: false })
    .limit(50);

  const leadIds = [...new Set((data || []).map((run) => run.lead_id).filter(Boolean))];
  const { data: leads } = leadIds.length
    ? await supabaseAdmin.from('leads').select('id, name, phone').eq('tenant_id', tenantId).in('id', leadIds)
    : { data: [] as { id: string; name: string; phone: string }[] };
  const byId = new Map((leads || []).map((lead) => [lead.id, lead]));

  return (data || []).map((run) => ({ ...run, lead: run.lead_id ? byId.get(run.lead_id) || null : null }));
}

export async function cancelRun(tenantId: string, runId: string): Promise<ServiceResult> {
  const { data, error } = await supabaseAdmin
    .from('automation_runs')
    .update({ status: 'cancelled', waiting_for: null, error: 'Cancelada manualmente.', finished_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('id', runId)
    .in('status', ['waiting', 'running'])
    .select('id')
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  if (!data) return { success: false, error: 'Essa execução já terminou.' };
  return { success: true };
}

/** Etapas do funil, equipe, etiquetas, fluxos e WhatsApp: o que o editor precisa para os campos de escolha. */
export async function editorOptions(tenantId: string) {
  const [{ data: stages }, { data: team }, { data: meta }, { data: tags }, { data: flows }] = await Promise.all([
    supabaseAdmin.from('pipeline_stages').select('id, name').eq('tenant_id', tenantId).order('position'),
    supabaseAdmin.from('profiles').select('id, name, role, phone').eq('tenant_id', tenantId).eq('status', 'ACTIVE').order('name'),
    supabaseAdmin.from('integrations_config').select('provider').eq('tenant_id', tenantId).eq('provider', 'whatsapp_meta').maybeSingle(),
    supabaseAdmin.from('lead_tags').select('name').eq('tenant_id', tenantId).order('name'),
    supabaseAdmin.from('automation_flows').select('id, name, status').eq('tenant_id', tenantId).order('name'),
  ]);
  const { getWhatsAppWebStatus } = await import('@/lib/whatsapp-web');
  return {
    stages: stages || [],
    team: (team || []).map((member) => ({ id: member.id, name: member.name, role: member.role, hasPhone: Boolean(member.phone) })),
    tags: (tags || []).map((tag) => String(tag.name)),
    flows: flows || [],
    whatsapp: { web: getWhatsAppWebStatus(tenantId).connected, api: Boolean(meta) },
    scheduler: process.env.CONTENT_SCHEDULER_ENABLED === 'true',
    ai: aiConfigured(),
  };
}

/** Busca de leads para "Rodar para leads" (nome, telefone ou e-mail). */
export async function searchLeads(tenantId: string, q: string) {
  const term = q.trim().replace(/[,()*%\\]/g, ' ').slice(0, 60);
  let query = supabaseAdmin.from('leads').select('id, name, phone, blocked').eq('tenant_id', tenantId).order('last_activity_at', { ascending: false, nullsFirst: false }).limit(20);
  if (term) query = query.or(`name.ilike.%${term}%,phone.ilike.%${term.replace(/\D/g, '') || term}%,email.ilike.%${term}%`);
  const { data } = await query;
  return (data || []).map((lead) => ({ id: lead.id, name: lead.name, phone: lead.phone, blocked: Boolean(lead.blocked) }));
}

const MEDIA_KIND: Record<string, 'image' | 'video' | 'audio' | 'document'> = {
  'image/jpeg': 'image', 'image/png': 'image', 'image/webp': 'image', 'image/gif': 'image',
  'video/mp4': 'video', 'video/3gpp': 'video',
  'audio/mpeg': 'audio', 'audio/ogg': 'audio', 'audio/mp4': 'audio', 'audio/aac': 'audio', 'audio/amr': 'audio',
};
const DOCUMENT_TYPES = new Set([
  'application/pdf', 'text/plain', 'text/csv', 'application/zip',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

/** Arquivo do bloco "Enviar arquivo" (bucket público automation-media). */
export async function uploadAutomationMedia(tenantId: string, file: { buffer: Buffer; type: string; size: number; name: string }) {
  const kind = MEDIA_KIND[file.type] || (DOCUMENT_TYPES.has(file.type) ? 'document' : null);
  if (!kind) return { error: 'Tipo de arquivo não aceito. Use imagem, vídeo MP4, áudio, PDF ou documento do Office.' };
  if (file.size > 16 * 1024 * 1024) return { error: 'O arquivo pode ter no máximo 16 MB.' };
  const safeName = (file.name || 'arquivo').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w.-]/g, '_').slice(-80);
  const path = `${tenantId}/${randomUUID()}/${safeName}`;
  const { error } = await supabaseAdmin.storage.from('automation-media').upload(path, file.buffer, { contentType: file.type, upsert: false });
  if (error) return { error: /bucket/i.test(error.message) ? 'Rode a migration 202610170001_automations_v2.sql no Supabase para enviar arquivos.' : error.message };
  return { url: supabaseAdmin.storage.from('automation-media').getPublicUrl(path).data.publicUrl, kind, fileName: file.name.slice(0, 120) };
}
