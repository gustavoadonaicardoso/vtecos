/**
 * ============================================================
 * VTEC OS — Motor das Automações (server-only)
 * ============================================================
 * Executa os fluxos ativos de cada empresa:
 *   - gatilhos: mensagem recebida no WhatsApp, lead novo, lead entrou na
 *     etapa X (chamados por quem cria lead/recebe mensagem/move etapa);
 *   - cada execução (automation_runs) anda bloco a bloco e para quando
 *     precisa esperar: tempo (bloco Aguardar) ou resposta (bloco Pergunta);
 *   - o agendador (tick a cada minuto, ligado em src/instrumentation.ts)
 *     retoma as esperas vencidas.
 * Nada aqui pode derrubar o fluxo principal (salvar mensagem, criar
 * lead): tudo roda em segundo plano e os erros vão para a execução.
 * ============================================================
 */

import { supabaseAdmin } from '@/lib/supabase-admin';
import { assertPublicHttpsUrl } from '@/lib/integrations/safe-url';
import {
  evaluateCondition,
  messageMatches,
  nextNodeId,
  normalizeGraph,
  renderTemplate,
  triggerOf,
  type FlowGraph,
  type FlowNode,
  type PortName,
  type RunContext,
  type TriggerEvent,
} from './flow';

type FlowRow = { id: string; tenant_id: string; name: string; status: string; graph: unknown; trigger_event: string | null };
type RunRow = {
  id: string;
  tenant_id: string;
  flow_id: string;
  lead_id: string | null;
  status: string;
  current_node_id: string | null;
  waiting_for: 'delay' | 'reply' | null;
  resume_at: string | null;
  context: { vars?: Record<string, string>; message?: string };
  steps: Step[];
};
type Step = { node_id: string; label: string; at: string; ok: boolean; detail: string };

const MAX_STEPS_PER_RUN = 60;
const MAX_STEPS_PER_EXECUTION = 25;
/** Proteção contra fluxo em loop disparando para muita gente de uma vez. */
const MAX_STARTS_PER_MINUTE = 120;

const startsByTenant = new Map<string, number[]>();
function canStart(tenantId: string) {
  const now = Date.now();
  const recent = (startsByTenant.get(tenantId) || []).filter((at) => now - at < 60_000);
  if (recent.length >= MAX_STARTS_PER_MINUTE) return false;
  recent.push(now);
  startsByTenant.set(tenantId, recent);
  return true;
}

const log = (...args: unknown[]) => console.error('[automações]', ...args);

// ── Dados do lead ────────────────────────────────────────────

async function loadContext(tenantId: string, leadId: string, run?: Pick<RunRow, 'context'>, graph?: FlowGraph): Promise<{ ctx: RunContext; lead: Record<string, unknown> } | null> {
  const [{ data: lead }, { data: tenant }] = await Promise.all([
    supabaseAdmin.from('leads').select('*').eq('tenant_id', tenantId).eq('id', leadId).maybeSingle(),
    supabaseAdmin.from('tenants').select('name').eq('id', tenantId).maybeSingle(),
  ]);
  if (!lead) return null;

  let stage = '';
  if (lead.stage_id) {
    const { data } = await supabaseAdmin.from('pipeline_stages').select('name').eq('tenant_id', tenantId).eq('id', lead.stage_id).maybeSingle();
    stage = data?.name || String(lead.stage_id);
  }

  const constants = Object.fromEntries((graph?.variables || []).map((variable) => [variable.name, variable.value]));
  return {
    lead,
    ctx: {
      lead: {
        name: String(lead.name || ''),
        phone: String(lead.phone || ''),
        email: String(lead.email || ''),
        stage_id: String(lead.stage_id || ''),
        stage,
        tags: Array.isArray(lead.tags) ? lead.tags.map(String) : [],
        value: Number(lead.value) || 0,
        source: String(lead.source || ''),
      },
      company: tenant?.name || '',
      message: run?.context?.message || '',
      vars: run?.context?.vars || {},
      constants,
    },
  };
}

// ── Envio pelo WhatsApp da empresa ───────────────────────────

/** WhatsApp Web conectado tem prioridade; senão, a API oficial da Meta. */
async function sendWhatsApp(tenantId: string, leadId: string, phone: string, payload: { text?: string; mediaUrl?: string; mediaKind?: 'image' | 'document'; caption?: string }) {
  if (!phone) throw new Error('O lead não tem telefone.');
  const { getWhatsAppWebStatus, sendWhatsAppWebMessage, sendWhatsAppWebMedia } = await import('@/lib/whatsapp-web');
  let provider = 'whatsapp_web';

  if (getWhatsAppWebStatus(tenantId).connected) {
    if (payload.mediaUrl) {
      const url = await assertPublicHttpsUrl(payload.mediaUrl);
      const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`Não foi possível baixar o arquivo (${response.status}).`);
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length > 15 * 1024 * 1024) throw new Error('Arquivo acima de 15 MB.');
      const mimetype = response.headers.get('content-type') || (payload.mediaKind === 'image' ? 'image/jpeg' : 'application/pdf');
      const fileName = decodeURIComponent(url.pathname.split('/').pop() || 'arquivo');
      await sendWhatsAppWebMedia(tenantId, phone, buffer, payload.mediaKind === 'image' ? 'image' : 'document', { caption: payload.caption, fileName, mimetype });
    } else {
      await sendWhatsAppWebMessage(tenantId, phone, payload.text || '');
    }
  } else {
    const { WhatsAppService, getWhatsAppConfig } = await import('@/lib/whatsapp');
    const config = await getWhatsAppConfig(supabaseAdmin, tenantId).catch(() => null);
    if (!config) throw new Error('Nenhum WhatsApp conectado: conecte o WhatsApp Web ou a API oficial em Integrações.');
    provider = 'meta';
    const service = new WhatsAppService(config);
    const result = payload.mediaUrl
      ? payload.mediaKind === 'image'
        ? await service.sendImage(phone, payload.mediaUrl, payload.caption)
        : await service.sendDocument(phone, payload.mediaUrl, decodeURIComponent(payload.mediaUrl.split('/').pop() || 'arquivo'), payload.caption)
      : await service.sendText(phone, payload.text || '');
    if (!result.success) throw new Error(result.error || 'A Meta recusou a mensagem.');
  }

  // Aparece na conversa em Mensagens, como as respostas da equipe.
  const preview = payload.text || payload.caption || (payload.mediaKind === 'image' ? '📷 Imagem' : '📎 Arquivo');
  await supabaseAdmin.from('chat_messages').insert({
    tenant_id: tenantId,
    lead_id: leadId,
    text: payload.mediaUrl ? `${preview}\n${payload.mediaUrl}` : preview,
    sent_by_me: true,
    type: 'text',
    status: 'sent',
    provider,
  });
  await supabaseAdmin.from('leads').update({ last_msg: `🤖 ${preview}`.slice(0, 200) }).eq('tenant_id', tenantId).eq('id', leadId);
}

// ── Execução de um bloco ─────────────────────────────────────

type StepResult =
  | { kind: 'next'; port: PortName; detail: string }
  | { kind: 'wait'; waitingFor: 'delay' | 'reply'; resumeAt: Date; detail: string }
  | { kind: 'fail'; detail: string };

async function runNode(node: FlowNode, run: RunRow, ctx: RunContext, lead: Record<string, unknown>): Promise<StepResult> {
  const c = node.config;
  const tenantId = run.tenant_id;
  const leadId = run.lead_id!;

  switch (node.type) {
    case 'trigger-message':
    case 'trigger-lead':
    case 'trigger-stage':
      return { kind: 'next', port: 'default', detail: 'Fluxo iniciado.' };

    case 'send-message': {
      const text = renderTemplate(c.message || '', ctx).trim();
      if (!text) return { kind: 'fail', detail: 'Mensagem vazia depois de trocar as variáveis.' };
      await sendWhatsApp(tenantId, leadId, ctx.lead.phone, { text });
      return { kind: 'next', port: 'default', detail: `Enviou: ${text.slice(0, 120)}` };
    }

    case 'send-media': {
      await sendWhatsApp(tenantId, leadId, ctx.lead.phone, { mediaUrl: c.mediaUrl, mediaKind: c.mediaKind, caption: renderTemplate(c.caption || '', ctx) });
      return { kind: 'next', port: 'default', detail: `Enviou ${c.mediaKind === 'image' ? 'imagem' : 'arquivo'}.` };
    }

    case 'question': {
      const text = renderTemplate(c.question || '', ctx).trim();
      await sendWhatsApp(tenantId, leadId, ctx.lead.phone, { text });
      const hours = Math.min(168, Math.max(1, Number(c.timeoutHours) || 24));
      return { kind: 'wait', waitingFor: 'reply', resumeAt: new Date(Date.now() + hours * 3600_000), detail: `Perguntou e aguarda resposta por até ${hours}h: ${text.slice(0, 100)}` };
    }

    case 'condition': {
      const result = evaluateCondition(c, ctx);
      return { kind: 'next', port: result ? 'yes' : 'no', detail: result ? 'Condição: Sim' : 'Condição: Não' };
    }

    case 'delay': {
      const minutes = Math.max(1, Number(c.waitMinutes) || 1);
      return { kind: 'wait', waitingFor: 'delay', resumeAt: new Date(Date.now() + minutes * 60_000), detail: `Aguardando ${minutes} min.` };
    }

    case 'update-lead': {
      const value = renderTemplate(c.fieldValue || '', ctx).trim();
      const updates: Record<string, unknown> = {};
      if (c.field === 'stage') {
        const { data: stage } = await supabaseAdmin.from('pipeline_stages').select('id, name').eq('tenant_id', tenantId).eq('id', value).maybeSingle();
        if (!stage) return { kind: 'fail', detail: 'A etapa escolhida não existe mais no funil.' };
        updates.stage_id = stage.id;
      } else if (c.field === 'assigned_to') {
        const { data: member } = await supabaseAdmin.from('profiles').select('id').eq('tenant_id', tenantId).eq('id', value).maybeSingle();
        if (!member) return { kind: 'fail', detail: 'O responsável escolhido não faz mais parte da equipe.' };
        updates.assigned_to = member.id;
      } else if (c.field === 'value') {
        updates.value = Number(value.replace(/\./g, '').replace(',', '.')) || 0;
      } else if (c.field === 'name' || c.field === 'email') {
        updates[c.field] = value;
      }
      const { error } = await supabaseAdmin.from('leads').update(updates).eq('tenant_id', tenantId).eq('id', leadId);
      if (error) return { kind: 'fail', detail: error.message };
      // Mudar de etapa pela automação também dispara os fluxos daquela etapa.
      if (updates.stage_id && updates.stage_id !== lead.stage_id) fireAutomation(onStageChanged, tenantId, leadId, String(updates.stage_id));
      return { kind: 'next', port: 'default', detail: `Lead atualizado (${c.field}).` };
    }

    case 'tag-lead': {
      const tag = renderTemplate(c.tag || '', ctx).trim().slice(0, 40);
      const tags = Array.isArray(lead.tags) ? (lead.tags as string[]) : [];
      if (!tags.includes(tag)) {
        const { error } = await supabaseAdmin.from('leads').update({ tags: [...tags, tag] }).eq('tenant_id', tenantId).eq('id', leadId);
        if (error) return { kind: 'fail', detail: error.message };
      }
      return { kind: 'next', port: 'default', detail: `Etiqueta "${tag}".` };
    }

    case 'notify-team': {
      let recipients: string[] = [];
      if (c.target === 'assigned' && lead.assigned_to) recipients = [String(lead.assigned_to)];
      if (recipients.length === 0) {
        let query = supabaseAdmin.from('profiles').select('id').eq('tenant_id', tenantId).eq('status', 'ACTIVE');
        if (c.target !== 'everyone') query = query.in('role', ['ADMIN', 'MANAGER']);
        const { data } = await query;
        recipients = (data || []).map((row) => row.id);
      }
      if (recipients.length === 0) return { kind: 'next', port: 'default', detail: 'Ninguém para avisar.' };
      const content = renderTemplate(c.message || '', ctx).slice(0, 1000);
      await supabaseAdmin.from('system_notifications').insert(recipients.map((userId) => ({
        user_id: userId,
        type: 'automation',
        title: `Automação: ${node.label}`,
        content,
        is_read: false,
        link: `/messages?chatId=${leadId}`,
      })));
      return { kind: 'next', port: 'default', detail: `Avisou ${recipients.length} pessoa(s).` };
    }

    case 'webhook': {
      const url = await assertPublicHttpsUrl(c.url || '');
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'vtec-os-automations/1.0' },
        body: JSON.stringify({ event: 'automation.step', flow_id: run.flow_id, lead_id: leadId, lead: ctx.lead, variables: ctx.vars, message: ctx.message, sent_at: new Date().toISOString() }),
        redirect: 'manual',
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) return { kind: 'fail', detail: `A URL respondeu ${response.status}.` };
      return { kind: 'next', port: 'default', detail: `Webhook respondeu ${response.status}.` };
    }
  }
}

// ── Execução ─────────────────────────────────────────────────

async function loadFlow(flowId: string): Promise<(FlowRow & { graphParsed: FlowGraph }) | null> {
  // tenant-scope: ok (o motor recebe o id da execução, que já pertence a uma empresa; o tenant vem da linha)
  const { data } = await supabaseAdmin.from('automation_flows').select('id, tenant_id, name, status, graph, trigger_event').eq('id', flowId).maybeSingle();
  if (!data) return null;
  return { ...(data as FlowRow), graphParsed: normalizeGraph(data.graph) };
}

async function saveRun(run: RunRow, changes: Partial<RunRow> & { error?: string | null; finished_at?: string | null }) {
  await supabaseAdmin.from('automation_runs').update({ ...changes, updated_at: new Date().toISOString() }).eq('tenant_id', run.tenant_id).eq('id', run.id);
}

/**
 * Anda com a execução a partir de `startNodeId` até precisar esperar ou
 * acabar. A execução já precisa estar "running" (reivindicada).
 */
async function advance(run: RunRow, startNodeId: string | null) {
  const flow = await loadFlow(run.flow_id);
  if (!flow || !run.lead_id) {
    await saveRun(run, { status: 'failed', error: 'O fluxo foi excluído.', finished_at: new Date().toISOString() });
    return;
  }
  const graph = flow.graphParsed;
  const steps = [...(run.steps || [])];
  let nodeId = startNodeId;
  let executed = 0;

  while (nodeId) {
    if (executed >= MAX_STEPS_PER_EXECUTION || steps.length >= MAX_STEPS_PER_RUN) {
      await saveRun(run, { status: 'failed', steps, error: 'O fluxo passou do limite de passos (verifique se ele não está em loop).', finished_at: new Date().toISOString() });
      return;
    }
    const node = graph.nodes.find((item) => item.id === nodeId);
    if (!node) {
      await saveRun(run, { status: 'failed', steps, error: 'Um bloco do fluxo foi removido durante a execução.', finished_at: new Date().toISOString() });
      return;
    }

    const loaded = await loadContext(run.tenant_id, run.lead_id, run, graph);
    if (!loaded) {
      await saveRun(run, { status: 'failed', steps, error: 'O lead foi excluído.', finished_at: new Date().toISOString() });
      return;
    }

    executed += 1;
    let result: StepResult;
    try {
      result = await runNode(node, run, loaded.ctx, loaded.lead);
    } catch (error) {
      result = { kind: 'fail', detail: error instanceof Error ? error.message : 'Erro ao executar o bloco.' };
    }

    steps.push({ node_id: node.id, label: node.label, at: new Date().toISOString(), ok: result.kind !== 'fail', detail: result.detail });

    if (result.kind === 'fail') {
      await saveRun(run, { status: 'failed', steps, current_node_id: node.id, error: `${node.label}: ${result.detail}`, finished_at: new Date().toISOString() });
      return;
    }
    if (result.kind === 'wait') {
      await saveRun(run, { status: 'waiting', steps, current_node_id: node.id, waiting_for: result.waitingFor, resume_at: result.resumeAt.toISOString() });
      return;
    }
    nodeId = nextNodeId(graph, node.id, result.port);
    run.current_node_id = node.id;
  }

  await saveRun(run, { status: 'completed', steps, waiting_for: null, resume_at: null, finished_at: new Date().toISOString() });
}

/** Reivindica uma execução em espera (só um processo continua cada uma). */
async function claim(run: RunRow): Promise<RunRow | null> {
  const { data } = await supabaseAdmin
    .from('automation_runs')
    .update({ status: 'running', waiting_for: null, updated_at: new Date().toISOString() })
    .eq('tenant_id', run.tenant_id)
    .eq('id', run.id)
    .eq('status', 'waiting')
    .select()
    .maybeSingle();
  return (data as RunRow) || null;
}

async function startRun(flow: FlowRow & { graphParsed: FlowGraph }, leadId: string, message: string) {
  const trigger = triggerOf(flow.graphParsed);
  if (!trigger) return;

  // Não começa de novo para o mesmo lead se já está rodando, ou se rodou
  // há pouco (janela configurável no gatilho).
  const reentryHours = Math.max(0, Number(trigger.config.reentryHours) || 0);
  const { data: recent } = await supabaseAdmin
    .from('automation_runs')
    .select('id, status, started_at')
    .eq('tenant_id', flow.tenant_id)
    .eq('flow_id', flow.id)
    .eq('lead_id', leadId)
    .order('started_at', { ascending: false })
    .limit(1);
  const last = recent?.[0];
  if (last && ['running', 'waiting'].includes(last.status)) return;
  if (last && reentryHours > 0 && Date.now() - new Date(last.started_at).getTime() < reentryHours * 3600_000) return;

  // Contato bloqueado na tela de Leads não recebe automações.
  const { data: leadRow } = await supabaseAdmin.from('leads').select('blocked').eq('tenant_id', flow.tenant_id).eq('id', leadId).maybeSingle();
  if ((leadRow as { blocked?: boolean } | null)?.blocked) return;

  if (!canStart(flow.tenant_id)) {
    log('limite de inícios por minuto atingido para a empresa', flow.tenant_id);
    return;
  }

  const { data: run, error } = await supabaseAdmin
    .from('automation_runs')
    .insert({ tenant_id: flow.tenant_id, flow_id: flow.id, lead_id: leadId, status: 'running', current_node_id: trigger.id, context: { message, vars: {} } })
    .select()
    .single();
  if (error || !run) {
    log('não foi possível criar a execução', error?.message);
    return;
  }
  await advance(run as RunRow, trigger.id);
}

async function activeFlows(tenantId: string, event: TriggerEvent) {
  const { data } = await supabaseAdmin
    .from('automation_flows')
    .select('id, tenant_id, name, status, graph, trigger_event')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .eq('trigger_event', event);
  return (data || []).map((row) => ({ ...(row as FlowRow), graphParsed: normalizeGraph(row.graph) }));
}

// ── Gatilhos (chamados pelo resto do sistema) ────────────────

/**
 * Mensagem nova de um lead no WhatsApp. Primeiro entrega como resposta
 * para execuções esperando uma pergunta; se nenhuma estava esperando,
 * dispara os fluxos com gatilho "Mensagem recebida".
 */
export async function onInboundMessage(tenantId: string, leadId: string, text: string, options: { isNewContact: boolean }) {
  try {
    const { data: waiting } = await supabaseAdmin
      .from('automation_runs')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('lead_id', leadId)
      .eq('status', 'waiting')
      .eq('waiting_for', 'reply');

    let answered = false;
    for (const row of (waiting || []) as RunRow[]) {
      const run = await claim(row);
      if (!run) continue;
      answered = true;
      const flow = await loadFlow(run.flow_id);
      const node = flow?.graphParsed.nodes.find((item) => item.id === run.current_node_id);
      const variable = (node?.config.variable || 'resposta').trim();
      run.context = { ...(run.context || {}), message: text, vars: { ...(run.context?.vars || {}), [variable]: text } };
      await saveRun(run, { context: run.context });
      await advance(run, flow && node ? nextNodeId(flow.graphParsed, node.id, 'yes') : null);
    }
    if (answered) return;

    for (const flow of await activeFlows(tenantId, 'message_received')) {
      const trigger = triggerOf(flow.graphParsed);
      if (!trigger) continue;
      if (trigger.config.onlyNewContacts && !options.isNewContact) continue;
      if (!messageMatches(trigger.config, text)) continue;
      await startRun(flow, leadId, text);
    }
  } catch (error) {
    log('falha ao tratar mensagem recebida', error);
  }
}

/** Lead novo (manual, WhatsApp, formulário, totem). */
export async function onLeadCreated(tenantId: string, leadId: string, source: 'manual' | 'whatsapp' | 'form' | 'totem') {
  try {
    for (const flow of await activeFlows(tenantId, 'lead_created')) {
      const trigger = triggerOf(flow.graphParsed);
      const wanted = trigger?.config.source || 'any';
      if (wanted !== 'any' && wanted !== source) continue;
      await startRun(flow, leadId, '');
    }
  } catch (error) {
    log('falha ao tratar lead novo', error);
  }
}

/** Lead mudou de etapa no funil. */
export async function onStageChanged(tenantId: string, leadId: string, stageId: string) {
  try {
    for (const flow of await activeFlows(tenantId, 'stage_changed')) {
      if (triggerOf(flow.graphParsed)?.config.stageId !== stageId) continue;
      await startRun(flow, leadId, '');
    }
  } catch (error) {
    log('falha ao tratar mudança de etapa', error);
  }
}

/** Dispara sem esperar (quem chama não fica preso no envio de mensagens). */
export function fireAutomation<T extends unknown[]>(handler: (...args: T) => Promise<void>, ...args: T) {
  handler(...args).catch((error) => log('erro', error));
}

/** Pausar/excluir um fluxo cancela as execuções que estavam esperando. */
export async function cancelWaitingRuns(tenantId: string, flowId: string, reason: string) {
  await supabaseAdmin
    .from('automation_runs')
    .update({ status: 'cancelled', waiting_for: null, error: reason, finished_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('flow_id', flowId)
    .in('status', ['waiting', 'running']);
}

// ── Agendador ────────────────────────────────────────────────

async function tick() {
  // Execução presa em "running" (o servidor reiniciou no meio): encerra
  // para não bloquear o lead nesse fluxo para sempre.
  // tenant-scope: ok (limpeza geral do agendador)
  await supabaseAdmin
    .from('automation_runs')
    .update({ status: 'failed', error: 'Execução interrompida (o servidor reiniciou).', finished_at: new Date().toISOString() })
    .eq('status', 'running')
    .lt('updated_at', new Date(Date.now() - 10 * 60_000).toISOString());

  // tenant-scope: ok (o agendador atende todas as empresas; cada execução carrega o próprio tenant)
  const { data: due } = await supabaseAdmin
    .from('automation_runs')
    .select('*')
    .eq('status', 'waiting')
    .lte('resume_at', new Date().toISOString())
    .order('resume_at')
    .limit(50);

  for (const row of (due || []) as RunRow[]) {
    const run = await claim(row);
    if (!run) continue;
    const flow = await loadFlow(run.flow_id);
    if (!flow || flow.status !== 'active') {
      await saveRun(run, { status: 'cancelled', error: 'O fluxo foi pausado ou excluído.', finished_at: new Date().toISOString() });
      continue;
    }
    if (row.waiting_for === 'reply') {
      // Pergunta sem resposta no prazo: segue pela saída "Sem resposta" (se houver).
      const next = row.current_node_id ? nextNodeId(flow.graphParsed, row.current_node_id, 'no') : null;
      if (!next) {
        await saveRun(run, { status: 'expired', error: 'O contato não respondeu no prazo.', finished_at: new Date().toISOString() });
        continue;
      }
      await advance(run, next);
    } else {
      await advance(run, row.current_node_id ? nextNodeId(flow.graphParsed, row.current_node_id, 'default') : null);
    }
  }
}

type SchedulerState = { timer: ReturnType<typeof setInterval> | null; running: boolean };
const globalState = globalThis as typeof globalThis & { __vtecAutomationScheduler?: SchedulerState };
const scheduler = globalState.__vtecAutomationScheduler ?? { timer: null, running: false };
globalState.__vtecAutomationScheduler = scheduler;

export function startAutomationScheduler() {
  if (scheduler.timer) return;
  const run = async () => {
    if (scheduler.running) return;
    scheduler.running = true;
    try {
      await tick();
    } catch (error) {
      log('erro no agendador', error);
    } finally {
      scheduler.running = false;
    }
  };
  scheduler.timer = setInterval(() => void run(), 60_000);
  console.log('[automações] agendador iniciado (retoma esperas a cada 60s)');
  void run();
}
