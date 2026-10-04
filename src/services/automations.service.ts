/**
 * ============================================================
 * VTEC OS — Automações: fluxos e execuções (server-only)
 * ============================================================
 * Tudo recebe o tenantId da sessão: cada empresa vê e edita só os
 * próprios fluxos. A execução fica em src/lib/automations/engine.ts.
 * ============================================================
 */

import { supabaseAdmin } from '@/lib/supabase-admin';
import { cancelWaitingRuns } from '@/lib/automations/engine';
import { DEFAULT_CONFIG, DEFAULT_LABEL, normalizeGraph, TRIGGER_EVENT, triggerOf, validateFlow, type FlowGraph } from '@/lib/automations/flow';
import type { ServiceResult } from '@/types';

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
}

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
    .select('id, name, description, status, trigger_event, updated_at, graph')
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
      created_by: userId,
    })
    .select('id, name, description, status, trigger_event, updated_at, graph')
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
export async function updateFlow(tenantId: string, id: string, input: { name?: unknown; description?: unknown; graph?: unknown; status?: unknown }): Promise<UpdateResult> {
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
    .select('id, name, description, status, trigger_event, updated_at, graph')
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

/** Etapas do funil, equipe e WhatsApp: o que o editor precisa para os campos de escolha. */
export async function editorOptions(tenantId: string) {
  const [{ data: stages }, { data: team }, { data: meta }] = await Promise.all([
    supabaseAdmin.from('pipeline_stages').select('id, name').eq('tenant_id', tenantId).order('position'),
    supabaseAdmin.from('profiles').select('id, name').eq('tenant_id', tenantId).eq('status', 'ACTIVE').order('name'),
    supabaseAdmin.from('integrations_config').select('provider').eq('tenant_id', tenantId).eq('provider', 'whatsapp_meta').maybeSingle(),
  ]);
  const { getWhatsAppWebStatus } = await import('@/lib/whatsapp-web');
  return {
    stages: stages || [],
    team: team || [],
    whatsapp: { web: getWhatsAppWebStatus(tenantId).connected, api: Boolean(meta) },
    scheduler: process.env.CONTENT_SCHEDULER_ENABLED === 'true',
  };
}
