/**
 * ============================================================
 * VTEC OS — Motor das Automações (server-only)
 * ============================================================
 * Executa os fluxos ativos de cada empresa:
 *   - gatilhos: mensagem recebida, lead novo, mudança de etapa,
 *     etiqueta adicionada (chamados por quem cria/edita o lead ou recebe
 *     a mensagem); lead parado e data/hora marcada (o agendador procura);
 *     chamada de outro sistema (rota /api/automations/hooks/[token]) e
 *     iniciado pela equipe (rota /api/automations/[id]/start);
 *   - cada execução (automation_runs) anda bloco a bloco e para quando
 *     precisa esperar: tempo (Aguardar, fila) ou resposta (Pergunta,
 *     Menu, Aguardar resposta);
 *   - o agendador (tick a cada minuto, ligado em src/instrumentation.ts)
 *     retoma as esperas vencidas e dispara os gatilhos de tempo.
 * Nada aqui pode derrubar o fluxo principal (salvar mensagem, criar
 * lead): tudo roda em segundo plano e os erros vão para a execução.
 * ============================================================
 */

import { randomBytes } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { beat } from '@/lib/heartbeat';
import { assertPublicHttpsUrl } from '@/lib/integrations/safe-url';
import { deliverWhatsApp, sendToLead } from '@/lib/whatsapp-outbound';
import {
  aiCategories,
  applySetVariable,
  businessHours,
  cleanVariableName,
  evaluateCondition,
  flattenInput,
  fold,
  inBusinessHours,
  keyValues,
  matchMenuOption,
  matchSwitch,
  menuOptions,
  menuText,
  messageMatches,
  nextNodeId,
  nextTimeOfDay,
  normalizeGraph,
  parseNumber,
  pickMessage,
  readPath,
  renderTemplate,
  responseMappings,
  scheduleSlot,
  stringList,
  triggerOf,
  validateAnswer,
  VALIDATION_LABEL,
  variableValue,
  zonedParts,
  type FlowGraph,
  type FlowNode,
  type NodeConfig,
  type PortName,
  type RunContext,
  type TriggerEvent,
} from './flow';

type FlowRow = { id: string; tenant_id: string; name: string; status: string; graph: unknown; trigger_event: string | null; state?: Record<string, unknown> | null };
type LoadedFlow = FlowRow & { graphParsed: FlowGraph };
/** Atendente com IA: resposta pendente, quantas respostas deu, falhas seguidas e a última mensagem do cliente já vista. */
type AiChatState = { pending?: boolean; turns?: number; errors?: number; lastSeenAt?: string; handedOff?: boolean };
type StoredContext = { vars?: Record<string, string>; message?: string; input?: Record<string, string>; attempts?: number; depth?: number; aiChat?: AiChatState };
type RunRow = {
  id: string;
  tenant_id: string;
  flow_id: string;
  lead_id: string | null;
  status: string;
  current_node_id: string | null;
  waiting_for: 'delay' | 'reply' | null;
  resume_at: string | null;
  context: StoredContext;
  steps: Step[];
  started_at?: string;
};
type Step = { node_id: string; label: string; at: string; ok: boolean; detail: string };

const FLOW_COLUMNS = 'id, tenant_id, name, status, graph, trigger_event, state';
const MAX_STEPS_PER_RUN = 80;
const MAX_STEPS_PER_EXECUTION = 30;
/** Proteção contra fluxo em loop disparando para muita gente de uma vez. */
const MAX_STARTS_PER_MINUTE = 120;
/** Execuções retomadas por minuto (fila do agendado, do "lead parado" e esperas). */
const RESUMES_PER_TICK = 60;
const MAX_FLOW_DEPTH = 3;

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
const nowIso = () => new Date().toISOString();

export const newWebhookToken = () => `wh_${randomBytes(16).toString('hex')}`;

// ── Dados do lead ────────────────────────────────────────────

async function loadContext(tenantId: string, leadId: string, run: Pick<RunRow, 'context'>, flow: LoadedFlow): Promise<{ ctx: RunContext; lead: Record<string, unknown> } | null> {
  const [{ data: lead }, { data: tenant }] = await Promise.all([
    supabaseAdmin.from('leads').select('*').eq('tenant_id', tenantId).eq('id', leadId).maybeSingle(),
    // tenant-scope: ok (dados da própria empresa da execução)
    supabaseAdmin.from('tenants').select('*').eq('id', tenantId).maybeSingle(),
  ]);
  if (!lead) return null;

  const [stage, owner] = await Promise.all([
    lead.stage_id ? supabaseAdmin.from('pipeline_stages').select('name').eq('tenant_id', tenantId).eq('id', lead.stage_id).maybeSingle() : Promise.resolve({ data: null }),
    lead.assigned_to ? supabaseAdmin.from('profiles').select('name').eq('tenant_id', tenantId).eq('id', lead.assigned_to).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  const constants = Object.fromEntries(flow.graphParsed.variables.map((variable) => [variable.name, variable.value]));
  return {
    lead,
    ctx: {
      lead: {
        id: String(lead.id),
        name: String(lead.name || ''),
        phone: String(lead.phone || ''),
        email: String(lead.email || ''),
        cpf_cnpj: String(lead.cpf_cnpj || ''),
        stage_id: String(lead.stage_id || ''),
        stage: (stage.data as { name?: string } | null)?.name || String(lead.stage_id || ''),
        tags: Array.isArray(lead.tags) ? lead.tags.map(String) : [],
        value: Number(lead.value) || 0,
        source: String(lead.source || ''),
        assigned_to: String(lead.assigned_to || ''),
        assigned_name: String((owner.data as { name?: string } | null)?.name || ''),
        created_at: String(lead.created_at || ''),
        stage_changed_at: String(lead.stage_changed_at || lead.created_at || ''),
      },
      company: {
        name: String(tenant?.name || ''),
        phone: String(tenant?.phone || ''),
        website: String(tenant?.website || ''),
        address: String(tenant?.address || ''),
      },
      flow: { name: flow.name },
      message: run.context?.message || '',
      vars: run.context?.vars || {},
      constants,
      input: run.context?.input || {},
      now: new Date(),
    },
  };
}

// ── IA ───────────────────────────────────────────────────────

async function askAi(prompt: string, tenantId: string): Promise<Record<string, unknown>> {
  const { callAI } = await import('@/lib/ai');
  const result = await callAI(prompt, { temperature: 0.4, maxOutputTokens: 800, tenantId });
  if (!result.success) throw new Error(result.error);
  try {
    const parsed = JSON.parse(result.text.replace(/^```(?:json)?\s*|\s*```$/g, ''));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    throw new Error('A IA respondeu num formato inesperado.');
  }
}

async function conversationFor(tenantId: string, leadId: string) {
  const { data } = await supabaseAdmin
    .from('chat_messages')
    .select('text, sent_by_me, created_at')
    .eq('tenant_id', tenantId)
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(12);
  return (data || []).reverse().map((row) => `${row.sent_by_me ? 'Empresa' : 'Cliente'}: ${String(row.text || '').slice(0, 400)}`).join('\n');
}

// ── Execução de um bloco ─────────────────────────────────────

type StepResult =
  | { kind: 'next'; port: PortName; detail: string; vars?: Record<string, string> }
  | { kind: 'wait'; waitingFor: 'delay' | 'reply'; resumeAt: Date; detail: string; wakeInMs?: number }
  | { kind: 'fail'; detail: string }
  | { kind: 'end'; detail: string };

/** Erro num bloco com saída "Erro": segue por ela; sem a saída, a execução falha. */
const failOrBranch = (graph: FlowGraph, node: FlowNode, detail: string, vars?: Record<string, string>): StepResult =>
  nextNodeId(graph, node.id, 'no') ? { kind: 'next', port: 'no', detail: `Erro: ${detail}`, vars } : { kind: 'fail', detail };

/** Texto com {{variáveis}} escapadas para dentro de um JSON. */
const renderJson = (text: string, ctx: RunContext) =>
  (text || '').replace(/\{\{\s*([\w.]+)\s*(?:\|([^}]*))?\}\}/g, (_, name: string, fallback?: string) => JSON.stringify(variableValue(name, ctx) || (fallback ?? '').trim()).slice(1, -1));

const replyTimeout = (c: NodeConfig) => new Date(Date.now() + Math.min(168, Math.max(1, Number(c.timeoutHours) || 24)) * 3600_000);

async function teamMembers(tenantId: string, ids?: string[]) {
  let query = supabaseAdmin.from('profiles').select('id, name, phone, role').eq('tenant_id', tenantId).eq('status', 'ACTIVE');
  if (ids && ids.length) query = query.in('id', ids);
  const { data } = await query;
  return (data || []) as { id: string; name: string; phone: string | null; role: string }[];
}

async function notifyUsers(userIds: string[], title: string, content: string, link: string) {
  if (userIds.length === 0) return;
  await supabaseAdmin.from('system_notifications').insert(userIds.map((userId) => ({ user_id: userId, type: 'automation', title, content, is_read: false, link })));
}

async function runNode(node: FlowNode, run: RunRow, flow: LoadedFlow, ctx: RunContext, lead: Record<string, unknown>): Promise<StepResult> {
  const c = node.config;
  const graph = flow.graphParsed;
  const tenantId = run.tenant_id;
  const leadId = run.lead_id!;

  switch (node.type) {
    case 'trigger-message':
    case 'trigger-lead':
    case 'trigger-stage':
    case 'trigger-tag':
    case 'trigger-inactive':
    case 'trigger-schedule':
    case 'trigger-webhook':
    case 'trigger-manual':
      return { kind: 'next', port: 'default', detail: 'Fluxo iniciado.' };

    case 'send-message': {
      const text = renderTemplate(pickMessage(c), ctx).trim();
      if (!text) return { kind: 'fail', detail: 'Mensagem vazia depois de trocar as variáveis.' };
      await sendToLead(tenantId, leadId, ctx.lead.phone, { text, typingSeconds: c.typingSeconds });
      return { kind: 'next', port: 'default', detail: `Enviou: ${text.slice(0, 160)}` };
    }

    case 'send-media': {
      await sendToLead(tenantId, leadId, ctx.lead.phone, { mediaUrl: c.mediaUrl, mediaKind: c.mediaKind, caption: renderTemplate(c.caption || '', ctx), fileName: c.fileName });
      return { kind: 'next', port: 'default', detail: `Enviou ${{ image: 'imagem', video: 'vídeo', audio: 'áudio', document: 'arquivo' }[c.mediaKind || 'document']}.` };
    }

    case 'question': {
      const text = renderTemplate(c.question || '', ctx).trim();
      await sendToLead(tenantId, leadId, ctx.lead.phone, { text, typingSeconds: 1 });
      run.context.attempts = 0;
      return { kind: 'wait', waitingFor: 'reply', resumeAt: replyTimeout(c), detail: `Perguntou e aguarda resposta: ${text.slice(0, 120)}` };
    }

    case 'menu': {
      const options = menuOptions(c);
      const useButtons = Boolean(c.useButtons) && options.length <= 10;
      const body = renderTemplate(c.question || '', ctx).trim();
      await sendToLead(tenantId, leadId, ctx.lead.phone, {
        text: useButtons ? undefined : menuText(c, ctx),
        menu: useButtons ? { body, buttonLabel: c.buttonLabel || 'Ver opções', options: options.map((option) => ({ id: option.id, title: option.label })) } : undefined,
        typingSeconds: 1,
      });
      run.context.attempts = 0;
      return { kind: 'wait', waitingFor: 'reply', resumeAt: replyTimeout(c), detail: `Mandou o menu (${options.length} opções) e aguarda a escolha.` };
    }

    case 'wait-reply':
      return { kind: 'wait', waitingFor: 'reply', resumeAt: replyTimeout(c), detail: `Aguardando resposta por até ${Math.min(168, Math.max(1, Number(c.timeoutHours) || 24))}h.` };

    case 'condition': {
      const result = evaluateCondition(c, ctx);
      return { kind: 'next', port: result ? 'yes' : 'no', detail: result ? 'Condição: Sim' : 'Condição: Não' };
    }

    case 'switch': {
      const match = matchSwitch(c, ctx);
      return { kind: 'next', port: match ? match.id : 'no', detail: match ? `Caso: ${match.label || match.value}` : 'Nenhum caso bateu.' };
    }

    case 'business-hours': {
      const inside = inBusinessHours(businessHours(c), new Date());
      return { kind: 'next', port: inside ? 'yes' : 'no', detail: inside ? 'Dentro do horário de atendimento.' : 'Fora do horário de atendimento.' };
    }

    case 'split-ab': {
      const percentA = Math.min(99, Math.max(1, Math.round(Number(c.percentA) || 50)));
      const pathA = Math.random() * 100 < percentA;
      return { kind: 'next', port: pathA ? 'a' : 'b', detail: `Sorteado: caminho ${pathA ? 'A' : 'B'}.` };
    }

    case 'delay': {
      if (c.delayMode === 'until_time') {
        const resumeAt = nextTimeOfDay(c.untilTime || '09:00', Boolean(c.untilWeekdays), new Date());
        return { kind: 'wait', waitingFor: 'delay', resumeAt, detail: `Aguardando até ${resumeAt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}.` };
      }
      const minutes = Math.max(1, Number(c.waitMinutes) || 1);
      return { kind: 'wait', waitingFor: 'delay', resumeAt: new Date(Date.now() + minutes * 60_000), detail: `Aguardando ${minutes} min.` };
    }

    case 'set-variable': {
      const { name, value } = applySetVariable(c, ctx);
      if (!name) return { kind: 'fail', detail: 'Valor sem nome.' };
      return { kind: 'next', port: 'default', detail: `{{${name}}} = ${value.slice(0, 120) || '(vazio)'}`, vars: { [name]: value } };
    }

    case 'start-flow': {
      if (!c.flowId || c.flowId === run.flow_id) return { kind: 'fail', detail: 'Escolha outro fluxo (não pode ser o próprio).' };
      const depth = (run.context.depth || 0) + 1;
      if (depth > MAX_FLOW_DEPTH) return { kind: 'fail', detail: `Um fluxo chama outro mais de ${MAX_FLOW_DEPTH} vezes seguidas.` };
      const target = await loadFlow(c.flowId);
      if (!target || target.tenant_id !== tenantId) return { kind: 'fail', detail: 'O fluxo escolhido não existe mais.' };
      if (target.status !== 'active') return { kind: 'fail', detail: `O fluxo "${target.name}" não está ativo.` };
      const started = await startRun(target, leadId, { message: ctx.message, vars: { ...ctx.vars }, input: ctx.input, depth }, { ignoreLimits: true, background: true });
      return { kind: 'next', port: 'default', detail: 'runId' in started ? `Iniciou o fluxo "${target.name}".` : `Não iniciou "${target.name}": ${started.skipped}` };
    }

    case 'end': {
      if (c.stopOthers) {
        await supabaseAdmin
          .from('automation_runs')
          .update({ status: 'cancelled', waiting_for: null, error: `Encerrada pelo fluxo "${flow.name}".`, finished_at: nowIso(), updated_at: nowIso() })
          .eq('tenant_id', tenantId)
          .eq('lead_id', leadId)
          .neq('id', run.id)
          .in('status', ['waiting', 'running']);
      }
      return { kind: 'end', detail: c.stopOthers ? 'Fluxo encerrado (e as outras automações deste contato).' : 'Fluxo encerrado.' };
    }

    case 'update-lead': {
      const value = renderTemplate(c.fieldValue || '', ctx).trim();
      const updates: Record<string, unknown> = {};
      if (c.field === 'stage' || !c.field) {
        const { data: stage } = await supabaseAdmin.from('pipeline_stages').select('id, name').eq('tenant_id', tenantId).eq('id', value).maybeSingle();
        if (!stage) return { kind: 'fail', detail: 'A etapa escolhida não existe mais no funil.' };
        updates.stage_id = stage.id;
        if (stage.id !== lead.stage_id) updates.stage_changed_at = nowIso();
      } else if (c.field === 'assigned_to') {
        const { data: member } = await supabaseAdmin.from('profiles').select('id').eq('tenant_id', tenantId).eq('id', value).eq('status', 'ACTIVE').maybeSingle();
        if (!member) return { kind: 'fail', detail: 'O responsável escolhido não faz mais parte da equipe.' };
        updates.assigned_to = member.id;
      } else if (c.field === 'value') {
        const parsed = parseNumber(value);
        if (!Number.isFinite(parsed)) return { kind: 'fail', detail: `"${value}" não é um valor válido.` };
        updates.value = parsed;
      } else if (c.field === 'cpf_cnpj') {
        updates.cpf_cnpj = value.replace(/\D/g, '').slice(0, 14) || null;
      } else if (c.field === 'email') {
        updates.email = value.toLowerCase().slice(0, 160) || null;
      } else if (c.field === 'name' || c.field === 'source') {
        if (!value && c.field === 'name') return { kind: 'fail', detail: 'O nome ficaria vazio.' };
        updates[c.field] = value.slice(0, 120);
      }
      let { error } = await supabaseAdmin.from('leads').update(updates).eq('tenant_id', tenantId).eq('id', leadId);
      // Banco sem stage_changed_at (migration 202610110001) ainda move o lead.
      if (error && /stage_changed_at/.test(error.message)) {
        delete updates.stage_changed_at;
        ({ error } = await supabaseAdmin.from('leads').update(updates).eq('tenant_id', tenantId).eq('id', leadId));
      }
      if (error) return { kind: 'fail', detail: error.message };
      // Mudar de etapa pela automação também dispara os fluxos daquela etapa.
      if (updates.stage_id && updates.stage_id !== lead.stage_id) fireAutomation(onStageChanged, tenantId, leadId, String(updates.stage_id));
      return { kind: 'next', port: 'default', detail: `Lead atualizado (${c.field || 'stage'}).` };
    }

    case 'tag-lead': {
      const wanted = renderTemplate(c.tag || '', ctx).split(',').map((tag) => tag.trim().slice(0, 40)).filter(Boolean);
      if (wanted.length === 0) return { kind: 'fail', detail: 'Etiqueta vazia.' };
      const tags = Array.isArray(lead.tags) ? (lead.tags as string[]) : [];
      const has = (tag: string) => tags.some((item) => item.toLowerCase() === tag.toLowerCase());
      const added = c.tagAction === 'remove' ? [] : wanted.filter((tag) => !has(tag));
      const next = c.tagAction === 'remove' ? tags.filter((item) => !wanted.some((tag) => tag.toLowerCase() === item.toLowerCase())) : [...tags, ...added];
      if (next.length !== tags.length) {
        const { error } = await supabaseAdmin.from('leads').update({ tags: next.slice(0, 30) }).eq('tenant_id', tenantId).eq('id', leadId);
        if (error) return { kind: 'fail', detail: error.message };
      }
      if (added.length) {
        const { registerTags } = await import('@/services/leads.service');
        await registerTags(tenantId, added).catch(() => {});
        for (const tag of added) fireAutomation(onTagAdded, tenantId, leadId, tag);
      }
      return { kind: 'next', port: 'default', detail: `${c.tagAction === 'remove' ? 'Removeu' : 'Adicionou'} etiqueta: ${wanted.join(', ')}.` };
    }

    case 'assign-lead': {
      if (c.onlyIfUnassigned && lead.assigned_to) return { kind: 'next', port: 'default', detail: `O lead já tinha responsável (${ctx.lead.assigned_name || 'definido'}).` };
      const chosen = stringList(c.assignees);
      let candidates = await teamMembers(tenantId, chosen.length ? chosen : undefined);
      // Sem ninguém escolhido: vendedores e gerentes (admins só se não houver mais ninguém).
      if (!chosen.length && candidates.some((member) => member.role !== 'ADMIN')) candidates = candidates.filter((member) => member.role !== 'ADMIN');
      // Mantém a ordem escolhida no editor (o rodízio segue essa ordem).
      if (chosen.length) candidates.sort((a, b) => chosen.indexOf(a.id) - chosen.indexOf(b.id));
      else candidates.sort((a, b) => a.name.localeCompare(b.name));
      if (candidates.length === 0) return { kind: 'fail', detail: 'Ninguém ativo na equipe para receber o lead.' };

      let member = candidates[0];
      if (c.assignMode === 'round_robin' && candidates.length > 1) {
        const state = (flow.state || {}) as { rr?: Record<string, number> };
        const pointer = Number(state.rr?.[node.id]) || 0;
        member = candidates[pointer % candidates.length];
        const nextState = { ...state, rr: { ...(state.rr || {}), [node.id]: (pointer + 1) % candidates.length } };
        flow.state = nextState;
        await supabaseAdmin.from('automation_flows').update({ state: nextState }).eq('tenant_id', tenantId).eq('id', flow.id);
      } else if (c.assignMode === 'least_busy' && candidates.length > 1) {
        const loads = await Promise.all(candidates.map(async (candidate) => {
          const { count } = await supabaseAdmin.from('leads').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('assigned_to', candidate.id);
          return { candidate, count: count || 0 };
        }));
        member = loads.sort((a, b) => a.count - b.count)[0].candidate;
      }

      if (member.id !== lead.assigned_to) {
        const { error } = await supabaseAdmin.from('leads').update({ assigned_to: member.id }).eq('tenant_id', tenantId).eq('id', leadId);
        if (error) return { kind: 'fail', detail: error.message };
        if (c.notifyAssignee) await notifyUsers([member.id], 'Novo lead para você', `A automação "${flow.name}" passou ${ctx.lead.name || 'um contato'} para você.`, `/messages?chatId=${leadId}`);
      }
      return { kind: 'next', port: 'default', detail: `Responsável: ${member.name}.` };
    }

    case 'add-note': {
      const text = renderTemplate(c.note || '', ctx).trim().slice(0, 1000);
      if (!text) return { kind: 'fail', detail: 'Anotação vazia.' };
      const p = zonedParts(new Date());
      const stamp = `${String(p.day).padStart(2, '0')}/${String(p.month).padStart(2, '0')}/${p.year} ${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
      const notes = `${String(lead.notes || '').trim()}\n[${stamp}] 🤖 ${text}`.trim().slice(-10000);
      const { error } = await supabaseAdmin.from('leads').update({ notes }).eq('tenant_id', tenantId).eq('id', leadId);
      if (error) return { kind: 'fail', detail: error.message };
      return { kind: 'next', port: 'default', detail: `Anotou: ${text.slice(0, 120)}` };
    }

    case 'create-task': {
      const title = renderTemplate(c.taskTitle || '', ctx).trim().slice(0, 160);
      if (!title) return { kind: 'fail', detail: 'Tarefa sem título.' };
      let assignee: string | null = c.taskAssignee && c.taskAssignee !== 'assigned' ? c.taskAssignee : String(lead.assigned_to || '') || null;
      if (assignee && !(await teamMembers(tenantId, [assignee])).length) assignee = null;
      const due = new Date(Date.now() + Math.max(0, Number(c.dueMinutes) || 0) * 60_000);
      const p = zonedParts(due);
      const pad = (value: number) => String(value).padStart(2, '0');
      const { error } = await supabaseAdmin.from('scheduling_items').insert({
        tenant_id: tenantId,
        title,
        description: renderTemplate(c.taskDescription || '', ctx).trim().slice(0, 4000) || `Criada pela automação "${flow.name}".`,
        type: 'task',
        priority: ['low', 'medium', 'high'].includes(c.priority || '') ? c.priority : 'medium',
        status: 'todo',
        date: `${p.year}-${pad(p.month)}-${pad(p.day)}`,
        time: `${pad(p.hour)}:${pad(p.minute)}`,
        starts_at: due.toISOString(),
        remind_minutes: 0,
        lead_id: leadId,
        assigned_to: assignee,
      });
      if (error) return { kind: 'fail', detail: error.message };
      if (assignee) await notifyUsers([assignee], 'Nova tarefa da automação', `${title} — para ${p.day.toString().padStart(2, '0')}/${pad(p.month)} às ${pad(p.hour)}:${pad(p.minute)}.`, '/scheduling');
      return { kind: 'next', port: 'default', detail: `Criou a tarefa "${title}".` };
    }

    case 'notify-team': {
      let recipients: { id: string; name: string; phone: string | null }[] = [];
      if (c.target === 'specific') recipients = await teamMembers(tenantId, stringList(c.targetUsers));
      else if (c.target === 'assigned' && lead.assigned_to) recipients = await teamMembers(tenantId, [String(lead.assigned_to)]);
      if (recipients.length === 0 && c.target !== 'specific') {
        const members = await teamMembers(tenantId);
        recipients = c.target === 'everyone' ? members : members.filter((member) => ['ADMIN', 'MANAGER'].includes(member.role));
      }
      if (recipients.length === 0) return { kind: 'next', port: 'default', detail: 'Ninguém para avisar.' };
      const content = renderTemplate(c.message || '', ctx).slice(0, 1000);
      await notifyUsers(recipients.map((member) => member.id), `Automação: ${node.label}`, content, `/messages?chatId=${leadId}`);
      let whatsapp = 0;
      if (c.alsoWhatsApp) {
        for (const member of recipients.filter((item) => item.phone)) {
          try {
            await deliverWhatsApp(tenantId, String(member.phone), { text: `🔔 ${content}` });
            whatsapp += 1;
          } catch (error) {
            log('aviso por WhatsApp para a equipe falhou', error instanceof Error ? error.message : error);
          }
        }
      }
      return { kind: 'next', port: 'default', detail: `Avisou ${recipients.length} pessoa(s)${c.alsoWhatsApp ? ` (${whatsapp} pelo WhatsApp)` : ''}.` };
    }

    case 'webhook': {
      const method = ['GET', 'PUT', 'PATCH'].includes(c.method || '') ? c.method! : 'POST';
      const headers: Record<string, string> = { 'User-Agent': 'vtec-os-automations/2.0' };
      for (const header of keyValues(c.headers)) {
        const key = header.key.trim();
        if (/^[\w-]{1,60}$/.test(key) && !/^(host|content-length|connection|transfer-encoding)$/i.test(key)) headers[key] = renderTemplate(header.value, ctx).slice(0, 2000);
      }
      let body: string | undefined;
      if (method !== 'GET') {
        if (c.bodyMode === 'custom') {
          const rendered = renderJson(c.body || '', ctx);
          body = rendered;
          if (!Object.keys(headers).some((key) => key.toLowerCase() === 'content-type')) {
            let isJson = true;
            try { JSON.parse(rendered); } catch { isJson = false; }
            headers['Content-Type'] = isJson ? 'application/json' : 'text/plain; charset=utf-8';
          }
        } else {
          body = JSON.stringify({ event: 'automation.step', flow_id: run.flow_id, flow_name: flow.name, run_id: run.id, lead_id: leadId, lead: ctx.lead, variables: ctx.vars, input: ctx.input, message: ctx.message, sent_at: nowIso() });
          headers['Content-Type'] = 'application/json';
        }
      }
      let response: Response;
      try {
        const url = await assertPublicHttpsUrl(renderTemplate(c.url || '', ctx).trim());
        response = await fetch(url, { method, headers, body, redirect: 'manual', signal: AbortSignal.timeout(10000) });
      } catch (error) {
        return failOrBranch(graph, node, error instanceof Error ? error.message : 'Não foi possível chamar a URL.', { webhook_status: '0' });
      }
      const text = (await response.text().catch(() => '')).slice(0, 100_000);
      const vars: Record<string, string> = { webhook_status: String(response.status) };
      if (!response.ok) return failOrBranch(graph, node, `A URL respondeu ${response.status}.`, vars);
      let json: unknown = null;
      try { json = JSON.parse(text); } catch { json = null; }
      for (const mapping of responseMappings(c.responseMap)) vars[mapping.variable] = json === null ? (mapping.path === '.' ? text.slice(0, 1000) : '') : readPath(json, mapping.path);
      return { kind: 'next', port: 'default', detail: `Webhook respondeu ${response.status}.`, vars };
    }

    case 'ai-reply': {
      const variable = cleanVariableName(c.variable || '');
      try {
        const history = await conversationFor(tenantId, leadId);
        const answer = await askAi([
          'Você responde mensagens de WhatsApp em nome de uma empresa. Siga as instruções da empresa.',
          `Instruções da empresa:\n${renderTemplate(c.aiInstructions || '', ctx).slice(0, 4000)}`,
          `Empresa: ${ctx.company.name}${ctx.company.phone ? ` · telefone ${ctx.company.phone}` : ''}${ctx.company.website ? ` · site ${ctx.company.website}` : ''}${ctx.company.address ? ` · endereço ${ctx.company.address}` : ''}`,
          `Contato: ${ctx.lead.name || 'sem nome'}`,
          history ? `Conversa até agora:\n${history}` : '',
          `Mensagem a responder:\n${renderTemplate(c.aiInput || '{{message}}', ctx).slice(0, 2000)}`,
          'Responda só com JSON no formato {"reply": "texto da resposta"}. A resposta deve ser curta (até 600 caracteres), em português do Brasil, sem inventar preços, prazos ou dados que não estejam nas instruções.',
        ].filter(Boolean).join('\n\n'), tenantId);
        const reply = String(answer.reply || '').trim().slice(0, 1200);
        if (!reply) return failOrBranch(graph, node, 'A IA não respondeu nada.');
        if (c.aiSend) await sendToLead(tenantId, leadId, ctx.lead.phone, { text: reply, typingSeconds: 2 }, 'ai');
        return { kind: 'next', port: 'default', detail: `${c.aiSend ? 'IA respondeu' : 'IA gerou'}: ${reply.slice(0, 160)}`, vars: variable ? { [variable]: reply } : undefined };
      } catch (error) {
        return failOrBranch(graph, node, error instanceof Error ? error.message : 'Falha na IA.');
      }
    }

    case 'ai-chat': {
      // A conversa abre aqui; a resposta sai depois de juntar as mensagens.
      const ms = groupMs(c);
      run.context.aiChat = { pending: true, turns: 0, errors: 0 };
      return { kind: 'wait', waitingFor: 'reply', resumeAt: new Date(Date.now() + ms), wakeInMs: ms, detail: 'Atendente com IA: conversa aberta.' };
    }

    case 'ai-classify': {
      const categories = aiCategories(c);
      const variable = cleanVariableName(c.variable || '');
      try {
        const answer = await askAi([
          'Classifique a mensagem de um cliente em UMA das categorias abaixo.',
          categories.map((item) => `- id "${item.id}": ${item.label}${item.description ? ` — ${item.description}` : ''}`).join('\n'),
          `Mensagem:\n${renderTemplate(c.aiInput || '{{message}}', ctx).slice(0, 2000)}`,
          'Responda só com JSON no formato {"category": "id da categoria"}. Se nenhuma servir, use {"category": "none"}.',
        ].join('\n\n'), tenantId);
        const match = categories.find((item) => item.id === String(answer.category || '')) || categories.find((item) => fold(item.label) === fold(String(answer.category || '')));
        if (!match) return { kind: 'next', port: 'no', detail: 'A IA não identificou nenhuma categoria.', vars: variable ? { [variable]: '' } : undefined };
        return { kind: 'next', port: match.id, detail: `IA classificou como: ${match.label}`, vars: variable ? { [variable]: match.label } : undefined };
      } catch (error) {
        return failOrBranch(graph, node, error instanceof Error ? error.message : 'Falha na IA.');
      }
    }
  }
}

// ── Execução ─────────────────────────────────────────────────

async function loadFlow(flowId: string): Promise<LoadedFlow | null> {
  // tenant-scope: ok (o motor recebe o id da execução, que já pertence a uma empresa; o tenant vem da linha)
  const { data } = await supabaseAdmin.from('automation_flows').select(FLOW_COLUMNS).eq('id', flowId).maybeSingle();
  if (!data) return null;
  return { ...(data as FlowRow), graphParsed: normalizeGraph(data.graph) };
}

async function saveRun(run: RunRow, changes: Partial<RunRow> & { error?: string | null; finished_at?: string | null }) {
  await supabaseAdmin.from('automation_runs').update({ ...changes, updated_at: nowIso() }).eq('tenant_id', run.tenant_id).eq('id', run.id);
}

const finish = (run: RunRow, status: 'completed' | 'failed' | 'expired' | 'cancelled', changes: Partial<RunRow> & { error?: string | null } = {}) =>
  saveRun(run, { status, waiting_for: null, resume_at: null, finished_at: nowIso(), context: run.context, ...changes });

/**
 * Anda com a execução a partir de `startNodeId` até precisar esperar ou
 * acabar. A execução já precisa estar "running" (reivindicada).
 */
async function advance(run: RunRow, startNodeId: string | null, preloaded?: LoadedFlow | null) {
  const flow = preloaded ?? (await loadFlow(run.flow_id));
  run.context = { ...(run.context || {}) };
  if (!flow || !run.lead_id) {
    await finish(run, 'failed', { error: 'O fluxo foi excluído.' });
    return;
  }
  const graph = flow.graphParsed;
  const steps = [...(run.steps || [])];
  let nodeId = startNodeId;
  let executed = 0;

  while (nodeId) {
    if (executed >= MAX_STEPS_PER_EXECUTION || steps.length >= MAX_STEPS_PER_RUN) {
      await finish(run, 'failed', { steps, error: 'O fluxo passou do limite de passos (verifique se ele não está em loop).' });
      return;
    }
    const node = graph.nodes.find((item) => item.id === nodeId);
    if (!node) {
      await finish(run, 'failed', { steps, error: 'Um bloco do fluxo foi removido durante a execução.' });
      return;
    }

    const loaded = await loadContext(run.tenant_id, run.lead_id, run, flow);
    if (!loaded) {
      await finish(run, 'failed', { steps, error: 'O lead foi excluído.' });
      return;
    }

    executed += 1;
    let result: StepResult;
    try {
      result = await runNode(node, run, flow, loaded.ctx, loaded.lead);
    } catch (error) {
      result = { kind: 'fail', detail: error instanceof Error ? error.message : 'Erro ao executar o bloco.' };
    }

    steps.push({ node_id: node.id, label: node.label, at: nowIso(), ok: result.kind !== 'fail' && !(result.kind === 'next' && result.detail.startsWith('Erro:')), detail: result.detail.slice(0, 400) });
    if ((result.kind === 'next') && result.vars) run.context.vars = { ...(run.context.vars || {}), ...result.vars };

    if (result.kind === 'fail') {
      await finish(run, 'failed', { steps, current_node_id: node.id, error: `${node.label}: ${result.detail}` });
      return;
    }
    if (result.kind === 'end') {
      await finish(run, 'completed', { steps, current_node_id: node.id });
      return;
    }
    if (result.kind === 'wait') {
      await saveRun(run, { status: 'waiting', steps, current_node_id: node.id, waiting_for: result.waitingFor, resume_at: result.resumeAt.toISOString(), context: run.context });
      if (result.wakeInMs !== undefined) scheduleWake(run, result.wakeInMs);
      return;
    }
    nodeId = nextNodeId(graph, node.id, result.port);
    run.current_node_id = node.id;
  }

  await finish(run, 'completed', { steps });
}

/** Reivindica uma execução em espera (só um processo continua cada uma). */
async function claim(run: Pick<RunRow, 'id' | 'tenant_id'>, options: { dueBy?: Date } = {}): Promise<RunRow | null> {
  let query = supabaseAdmin
    .from('automation_runs')
    .update({ status: 'running', updated_at: nowIso() })
    .eq('tenant_id', run.tenant_id)
    .eq('id', run.id)
    .eq('status', 'waiting');
  // Só se a espera já venceu (outra mensagem pode ter adiado a resposta).
  if (options.dueBy) query = query.lte('resume_at', options.dueBy.toISOString());
  const { data } = await query.select().maybeSingle();
  return (data as RunRow) || null;
}

type StartOptions = {
  /** Ignora "não repetir por X horas" e o limite de vezes (equipe iniciou ou outro fluxo chamou). */
  ignoreLimits?: boolean;
  /** Entra na fila do agendador em vez de rodar agora (disparos para muitos leads). */
  queued?: boolean;
  /** Roda sem esperar terminar (quem chamou responde na hora). */
  background?: boolean;
  /** Para o gatilho "Lead parado": só uma vez por período sem conversa. */
  inactiveSince?: string;
};

type Eligibility = { running: boolean; lastStarted: string | null; count: number };

/** Execuções anteriores deste fluxo para vários leads de uma vez. */
async function runHistory(flow: FlowRow, leadIds: string[]): Promise<Map<string, Eligibility>> {
  const out = new Map<string, Eligibility>(leadIds.map((id) => [id, { running: false, lastStarted: null, count: 0 }]));
  for (let index = 0; index < leadIds.length; index += 150) {
    const chunk = leadIds.slice(index, index + 150);
    const { data } = await supabaseAdmin
      .from('automation_runs')
      .select('lead_id, status, started_at')
      .eq('tenant_id', flow.tenant_id)
      .eq('flow_id', flow.id)
      .in('lead_id', chunk)
      .limit(10000);
    for (const row of data || []) {
      const item = out.get(row.lead_id);
      if (!item) continue;
      item.count += 1;
      if (['running', 'waiting'].includes(row.status)) item.running = true;
      if (!item.lastStarted || row.started_at > item.lastStarted) item.lastStarted = row.started_at;
    }
  }
  return out;
}

function skipReason(history: Eligibility | undefined, trigger: FlowNode, options: StartOptions): string | null {
  if (!history) return null;
  if (history.running) return 'já está rodando para este contato.';
  if (options.ignoreLimits) return null;
  const reentryHours = Math.max(0, Number(trigger.config.reentryHours) || 0);
  if (history.lastStarted && reentryHours > 0 && Date.now() - new Date(history.lastStarted).getTime() < reentryHours * 3600_000) return `rodou há menos de ${reentryHours}h.`;
  const maxRuns = Math.max(0, Number(trigger.config.maxRunsPerLead) || 0);
  if (maxRuns > 0 && history.count >= maxRuns) return `já rodou ${history.count} vez(es) para este contato (limite ${maxRuns}).`;
  if (options.inactiveSince && history.lastStarted && history.lastStarted >= options.inactiveSince) return 'já rodou neste período sem conversa.';
  return null;
}

async function startRun(flow: LoadedFlow, leadId: string, context: StoredContext, options: StartOptions = {}): Promise<{ runId: string } | { skipped: string }> {
  const trigger = triggerOf(flow.graphParsed);
  if (!trigger) return { skipped: 'o fluxo não tem gatilho.' };

  // Não começa de novo para o mesmo lead se já está rodando, rodou há pouco
  // ou já passou do limite de vezes (configurável no gatilho).
  const history = (await runHistory(flow, [leadId])).get(leadId);
  const reason = skipReason(history, trigger, options);
  if (reason) return { skipped: reason };

  // Contato bloqueado na tela de Leads não recebe automações.
  const { data: leadRow } = await supabaseAdmin.from('leads').select('blocked').eq('tenant_id', flow.tenant_id).eq('id', leadId).maybeSingle();
  if (!leadRow) return { skipped: 'lead não encontrado.' };
  if ((leadRow as { blocked?: boolean }).blocked) return { skipped: 'contato bloqueado.' };

  if (!options.queued && !canStart(flow.tenant_id)) {
    log('limite de inícios por minuto atingido para a empresa', flow.tenant_id);
    return { skipped: 'muitos inícios no mesmo minuto.' };
  }

  const stored: StoredContext = { message: context.message || '', vars: context.vars || {}, input: context.input || {}, depth: context.depth || 0 };
  const { data: run, error } = await supabaseAdmin
    .from('automation_runs')
    .insert({
      tenant_id: flow.tenant_id,
      flow_id: flow.id,
      lead_id: leadId,
      status: options.queued ? 'waiting' : 'running',
      waiting_for: options.queued ? 'delay' : null,
      resume_at: options.queued ? nowIso() : null,
      current_node_id: trigger.id,
      context: stored,
      steps: options.queued ? [{ node_id: trigger.id, label: trigger.label, at: nowIso(), ok: true, detail: 'Na fila para começar.' }] : [],
    })
    .select()
    .single();
  if (error || !run) {
    log('não foi possível criar a execução', error?.message);
    return { skipped: 'não foi possível criar a execução.' };
  }
  if (!options.queued) {
    const work = advance(run as RunRow, trigger.id, flow);
    if (options.background) work.catch((failure) => log('erro', failure));
    else await work;
  }
  return { runId: run.id };
}

/** Coloca vários leads na fila de um fluxo (agendado, lead parado, equipe). */
async function enqueueMany(flow: LoadedFlow, leads: { id: string; since?: string }[], context: StoredContext, options: StartOptions) {
  const trigger = triggerOf(flow.graphParsed);
  if (!trigger || leads.length === 0) return { started: 0, skipped: leads.length };
  const history = await runHistory(flow, leads.map((lead) => lead.id));
  const eligible = leads.filter((lead) => !skipReason(history.get(lead.id), trigger, { ...options, inactiveSince: lead.since }));
  const at = nowIso();
  for (let index = 0; index < eligible.length; index += 200) {
    const rows = eligible.slice(index, index + 200).map((lead) => ({
      tenant_id: flow.tenant_id,
      flow_id: flow.id,
      lead_id: lead.id,
      status: 'waiting',
      waiting_for: 'delay',
      resume_at: at,
      current_node_id: trigger.id,
      context: { message: context.message || '', vars: {}, input: context.input || {}, depth: context.depth || 0 },
      steps: [{ node_id: trigger.id, label: trigger.label, at, ok: true, detail: 'Na fila para começar.' }],
    }));
    // tenant-scope: ok (cada linha leva o tenant_id do fluxo)
    const { error } = await supabaseAdmin.from('automation_runs').insert(rows);
    if (error) log('não foi possível enfileirar execuções', error.message);
  }
  return { started: eligible.length, skipped: leads.length - eligible.length };
}

async function activeFlows(tenantId: string, event: TriggerEvent) {
  const { data } = await supabaseAdmin
    .from('automation_flows')
    .select(FLOW_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .eq('trigger_event', event);
  return (data || []).map((row) => ({ ...(row as FlowRow), graphParsed: normalizeGraph(row.graph) }));
}

// ── Respostas do contato ─────────────────────────────────────

const RETRY_TEXT: Record<string, string> = {
  number: 'Não entendi. Responda só com números, por favor.',
  email: 'Esse e-mail parece incompleto. Pode enviar de novo? (ex.: nome@email.com)',
  phone: 'Não consegui entender o telefone. Envie com DDD, por favor.',
  cpf: 'Esse CPF não parece válido. Pode conferir e enviar de novo?',
  cnpj: 'Esse CNPJ não parece válido. Pode conferir e enviar de novo?',
  cpf_cnpj: 'Esse CPF/CNPJ não parece válido. Pode conferir e enviar de novo?',
  date: 'Não entendi a data. Envie no formato dd/mm/aaaa, por favor.',
  yesno: 'Responda com "sim" ou "não", por favor.',
};

/** Grava a resposta validada num campo do lead (bloco Pergunta → "Salvar também no lead"). */
async function saveAnswerToLead(tenantId: string, leadId: string, field: string, value: string) {
  const updates: Record<string, unknown> = {};
  if (field === 'name') updates.name = value.slice(0, 120);
  if (field === 'email') updates.email = value.toLowerCase().slice(0, 160);
  if (field === 'cpf_cnpj') updates.cpf_cnpj = value.replace(/\D/g, '').slice(0, 14);
  if (field === 'value' && Number.isFinite(parseNumber(value))) updates.value = parseNumber(value);
  if (field === 'notes') {
    const { data } = await supabaseAdmin.from('leads').select('notes').eq('tenant_id', tenantId).eq('id', leadId).maybeSingle();
    updates.notes = `${String(data?.notes || '').trim()}\n${value}`.trim().slice(-10000);
  }
  if (Object.keys(updates).length) await supabaseAdmin.from('leads').update(updates).eq('tenant_id', tenantId).eq('id', leadId);
}

/** A execução estava esperando resposta e o contato respondeu. */
async function handleReply(run: RunRow, text: string) {
  const flow = await loadFlow(run.flow_id);
  if (!flow || flow.status !== 'active') {
    await finish(run, 'cancelled', { error: 'O fluxo foi pausado ou excluído.' });
    return;
  }
  const graph = flow.graphParsed;
  const node = graph.nodes.find((item) => item.id === run.current_node_id);
  if (!node) {
    await finish(run, 'failed', { error: 'O bloco que esperava a resposta foi removido.' });
    return;
  }
  const c = node.config;
  run.context = { ...(run.context || {}), message: text, vars: { ...(run.context?.vars || {}) } };

  if (node.type === 'ai-chat') {
    // Junta as mensagens: cada nova adia a resposta mais um pouco.
    const ms = groupMs(c);
    run.context.aiChat = { ...(run.context.aiChat || {}), pending: true };
    await saveRun(run, { status: 'waiting', waiting_for: 'reply', resume_at: new Date(Date.now() + ms).toISOString(), context: run.context });
    scheduleWake(run, ms);
    return;
  }

  const steps = [...(run.steps || [])];
  const step = (detail: string, ok = true) => steps.push({ node_id: node.id, label: node.label, at: nowIso(), ok, detail: detail.slice(0, 400) });

  const retryOrGiveUp = async (fallbackText: string) => {
    const attempts = (Number(run.context.attempts) || 0) + 1;
    run.context.attempts = attempts;
    const maxAttempts = Math.min(5, Math.max(1, Number(c.maxAttempts) || 2));
    if (attempts < maxAttempts) {
      step(`Resposta inválida: "${text.slice(0, 80)}". Pediu de novo (${attempts}/${maxAttempts - 1}).`, false);
      const loaded = await loadContext(run.tenant_id, run.lead_id!, run, flow);
      if (!loaded) {
        await finish(run, 'failed', { steps, error: 'O lead foi excluído.' });
        return;
      }
      try {
        const retry = renderTemplate(c.retryMessage || fallbackText, loaded.ctx).trim() || fallbackText;
        await sendToLead(run.tenant_id, run.lead_id!, loaded.ctx.lead.phone, { text: node.type === 'menu' ? `${retry}\n\n${menuText({ ...c, question: '' }, loaded.ctx)}` : retry });
      } catch (error) {
        await finish(run, 'failed', { steps, error: `${node.label}: ${error instanceof Error ? error.message : 'falha ao pedir de novo.'}` });
        return;
      }
      await saveRun(run, { status: 'waiting', waiting_for: 'reply', resume_at: replyTimeout(c).toISOString(), steps, context: run.context });
      return;
    }
    step(`Resposta inválida depois de ${attempts} tentativa(s).`, false);
    const next = nextNodeId(graph, node.id, 'invalid') ?? nextNodeId(graph, node.id, 'no');
    run.steps = steps;
    if (!next) {
      await finish(run, 'expired', { steps, error: 'O contato não respondeu de um jeito válido.' });
      return;
    }
    await advance(run, next, flow);
  };

  if (node.type === 'question') {
    const result = validateAnswer(c.validation, text);
    if (!result.ok) {
      await retryOrGiveUp(RETRY_TEXT[c.validation || ''] || 'Não entendi. Pode responder de novo?');
      return;
    }
    const variable = cleanVariableName(c.variable || 'resposta') || 'resposta';
    run.context.vars![variable] = result.value;
    if (c.saveTo) await saveAnswerToLead(run.tenant_id, run.lead_id!, c.saveTo, result.value).catch((error) => log('falha ao salvar resposta no lead', error));
    step(`Contato respondeu: "${text.slice(0, 120)}"${c.validation && c.validation !== 'text' ? ` (${VALIDATION_LABEL[c.validation]} ok)` : ''}`);
    run.steps = steps;
    await advance(run, nextNodeId(graph, node.id, 'yes'), flow);
    return;
  }

  if (node.type === 'menu') {
    const option = matchMenuOption(menuOptions(c), text);
    if (!option) {
      await retryOrGiveUp('Não entendi. Responda só com o número da opção, por favor.');
      return;
    }
    const variable = cleanVariableName(c.variable || '');
    if (variable) run.context.vars![variable] = option.label;
    step(`Contato escolheu: ${option.label}`);
    run.steps = steps;
    await advance(run, nextNodeId(graph, node.id, option.id), flow);
    return;
  }

  // Aguardar resposta (e blocos antigos que esperavam).
  const variable = cleanVariableName(c.variable || '');
  if (variable) run.context.vars![variable] = text.slice(0, 1000);
  step(`Contato respondeu: "${text.slice(0, 120)}"`);
  run.steps = steps;
  await advance(run, nextNodeId(graph, node.id, 'yes'), flow);
}

// ── Atendente com IA ─────────────────────────────────────────
// O bloco fica "esperando resposta" enquanto a conversa está aberta.
// Cada mensagem do cliente adia a resposta alguns segundos (junta
// mensagens seguidas); quando o tempo vence, a IA lê o que chegou desde
// a última resposta e responde tudo de uma vez. Mensagens que chegam
// enquanto a IA pensa entram na próxima resposta. A IA fica quieta se
// a equipe pausou ou respondeu há pouco, e passa a conversa para uma
// pessoa quando o cliente pede.

const groupMs = (c: NodeConfig) => Math.max(1, Math.min(60, Number(c.groupSeconds ?? 8))) * 1000;
const time = (value?: string | null) => (value ? new Date(value).getTime() || 0 : 0);
/** Passos guardados de uma conversa longa (o limite da execução é 80). */
const KEEP_STEPS = 70;

type WakeTimers = Map<string, ReturnType<typeof setTimeout>>;
const wakeTimers = (): WakeTimers => {
  const holder = globalThis as typeof globalThis & { __vtecAiChatWakes?: WakeTimers };
  holder.__vtecAiChatWakes ??= new Map();
  return holder.__vtecAiChatWakes;
};

/** Acorda a execução daqui a `ms` (se o servidor reiniciar, o agendador pega em até 1 min). */
function scheduleWake(run: Pick<RunRow, 'id' | 'tenant_id'>, ms: number) {
  const timers = wakeTimers();
  const previous = timers.get(run.id);
  if (previous) clearTimeout(previous);
  const timer = setTimeout(() => {
    timers.delete(run.id);
    void wakeAiChat({ id: run.id, tenant_id: run.tenant_id }).catch((error) => log('atendente com IA', error));
  }, Math.max(500, ms));
  timer.unref?.();
  timers.set(run.id, timer);
}

async function wakeAiChat(row: Pick<RunRow, 'id' | 'tenant_id'>) {
  const run = await claim(row, { dueBy: new Date(Date.now() + 1000) });
  if (!run) return;
  const flow = await loadFlow(run.flow_id);
  if (!flow || flow.status !== 'active') {
    await finish(run, 'cancelled', { error: 'O fluxo foi pausado ou excluído.' });
    return;
  }
  const node = flow.graphParsed.nodes.find((item) => item.id === run.current_node_id);
  if (node?.type !== 'ai-chat' || !run.context?.aiChat?.pending) {
    await saveRun(run, { status: 'waiting' });
    return;
  }
  await aiChatTurn(run, flow, node);
}

/** Por que a IA deve ficar quieta agora (ou null). */
function aiPauseReason(lead: Record<string, unknown>, c: NodeConfig): string | null {
  const now = Date.now();
  const until = time(lead.ai_paused_until as string | null);
  if (until > now) return `IA pausada até ${new Date(until).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`;
  const hours = Math.max(0, Number(c.humanPauseHours ?? 2));
  if (hours > 0 && time(lead.human_replied_at as string | null) > now - hours * 3600_000) return `alguém da equipe respondeu há menos de ${hours}h`;
  return null;
}

/** Chegou mensagem do cliente depois de `since`? */
async function newerInbound(tenantId: string, leadId: string, since: string) {
  const { count } = await supabaseAdmin
    .from('chat_messages')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('lead_id', leadId)
    .eq('sent_by_me', false)
    .gt('created_at', since);
  return (count || 0) > 0;
}

/**
 * Já salvou a execução esperando o cliente: se uma mensagem chegou no
 * meio do caminho (com a execução ocupada), marca para responder.
 */
async function catchLateMessages(run: RunRow, c: NodeConfig, since: string) {
  if (!(await newerInbound(run.tenant_id, run.lead_id!, since))) return;
  const ms = groupMs(c);
  const context = { ...run.context, aiChat: { ...(run.context.aiChat || {}), pending: true } };
  const { count } = await supabaseAdmin
    .from('automation_runs')
    .update({ context, resume_at: new Date(Date.now() + ms).toISOString(), updated_at: nowIso() }, { count: 'exact' })
    .eq('tenant_id', run.tenant_id)
    .eq('id', run.id)
    .eq('status', 'waiting');
  if (count) {
    run.context = context;
    scheduleWake(run, ms);
  }
}

/** Uma vez do Atendente com IA: lê as mensagens novas e responde (ou passa para a equipe). */
async function aiChatTurn(run: RunRow, flow: LoadedFlow, node: FlowNode) {
  const c = node.config;
  const tenantId = run.tenant_id;
  const leadId = run.lead_id!;
  run.context = { ...(run.context || {}) };
  const previousSeen = run.context.aiChat?.lastSeenAt;
  const chat: AiChatState = { turns: 0, errors: 0, ...(run.context.aiChat || {}), pending: false };
  run.context.aiChat = chat;
  const steps = [...(run.steps || [])];
  const step = (detail: string, ok = true) => steps.push({ node_id: node.id, label: node.label, at: nowIso(), ok, detail: detail.slice(0, 400) });
  const allowHandoff = c.allowHandoff !== false;

  const waitForCustomer = async () => {
    await saveRun(run, { status: 'waiting', waiting_for: 'reply', resume_at: replyTimeout(c).toISOString(), steps: steps.slice(-KEEP_STEPS), context: run.context });
    await catchLateMessages(run, c, chat.lastSeenAt || run.started_at || nowIso());
  };
  const retryLater = async () => {
    chat.pending = true;
    chat.lastSeenAt = previousSeen;
    await saveRun(run, { status: 'waiting', waiting_for: 'reply', resume_at: new Date(Date.now() + 60_000).toISOString(), steps: steps.slice(-KEEP_STEPS), context: run.context });
    scheduleWake(run, 60_000);
  };

  const loaded = await loadContext(tenantId, leadId, run, flow);
  if (!loaded) {
    await finish(run, 'failed', { steps, error: 'O lead foi excluído.' });
    return;
  }

  const handoff = async (reason: string) => {
    const text = renderTemplate(c.handoffMessage || '', loaded.ctx).trim();
    chat.handedOff = true;
    if (text) await sendToLead(tenantId, leadId, loaded.ctx.lead.phone, { text, typingSeconds: 1 }, 'ai').catch((error) => log('atendente com IA: aviso de passagem', error));
    const hours = Math.max(0, Math.min(720, Number(c.handoffPauseHours ?? 24)));
    if (hours > 0) await supabaseAdmin.from('leads').update({ ai_paused_until: new Date(Date.now() + hours * 3600_000).toISOString() }).eq('tenant_id', tenantId).eq('id', leadId);
    step(`Passou para a equipe: ${reason}.`);
    run.steps = steps.slice(-KEEP_STEPS);
    const next = nextNodeId(flow.graphParsed, node.id, 'handoff');
    if (!next) {
      await finish(run, 'completed', { steps: run.steps, current_node_id: node.id });
      return;
    }
    await advance(run, next, flow);
  };

  // O que o cliente mandou depois da última mensagem que a IA já leu
  // (na primeira vez, depois da última resposta da empresa).
  const { data } = await supabaseAdmin
    .from('chat_messages')
    .select('text, sent_by_me, created_at')
    .eq('tenant_id', tenantId)
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(30);
  const history = (data || []).reverse() as { text: string | null; sent_by_me: boolean; created_at: string }[];
  const inbound = history.filter((row) => !row.sent_by_me);
  const lastOutbound = [...history].reverse().find((row) => row.sent_by_me)?.created_at;
  const floor = previousSeen ? time(previousSeen) : Math.max(time(lastOutbound), run.started_at ? time(run.started_at) - 120_000 : 0);
  const fresh = inbound.filter((row) => time(row.created_at) > floor && String(row.text || '').trim());
  if (inbound.length) chat.lastSeenAt = inbound[inbound.length - 1].created_at;

  const paused = aiPauseReason(loaded.lead, c);
  if (paused) {
    if (fresh.length) step(`Ficou em silêncio: ${paused}.`);
    await waitForCustomer();
    return;
  }
  if (fresh.length === 0) {
    await waitForCustomer();
    return;
  }

  const customerText = fresh.map((row) => String(row.text).slice(0, 800)).join('\n');
  run.context.message = customerText.slice(0, 2000);
  const maxTurns = Math.max(1, Math.min(200, Number(c.maxTurns) || 30));
  if ((chat.turns || 0) >= maxTurns) {
    await handoff(`a IA já respondeu ${chat.turns} vezes nesta conversa`);
    return;
  }

  let answer: Record<string, unknown>;
  try {
    const ctx = loaded.ctx;
    answer = await askAi([
      'Você é o atendente virtual de uma empresa no WhatsApp. Siga as instruções da empresa.',
      `Instruções da empresa:\n${renderTemplate(c.aiInstructions || '', ctx).slice(0, 6000)}`,
      `Empresa: ${ctx.company.name}${ctx.company.phone ? ` · telefone ${ctx.company.phone}` : ''}${ctx.company.website ? ` · site ${ctx.company.website}` : ''}${ctx.company.address ? ` · endereço ${ctx.company.address}` : ''}`,
      `Contato: ${ctx.lead.name || 'sem nome'}`,
      `Conversa até agora (mais antigas primeiro):\n${history.slice(-20).map((row) => `${row.sent_by_me ? 'Empresa' : 'Cliente'}: ${String(row.text || '').slice(0, 400)}`).join('\n')}`,
      `Mensagens novas do cliente (responda todas numa só resposta):\n${customerText.slice(0, 2000)}`,
      allowHandoff
        ? 'Responda só com JSON no formato {"reply": "texto da resposta", "handoff": false}. Use "handoff": true (com "reply" vazio) se o cliente pedir para falar com uma pessoa, atendente ou humano, quiser reclamar, ou se a resposta depender de algo importante que não está nas instruções.'
        : 'Responda só com JSON no formato {"reply": "texto da resposta"}.',
      'A resposta deve ser curta (até 600 caracteres), em português do Brasil, sem inventar preços, prazos ou dados que não estejam nas instruções. Não repita a saudação se a conversa já começou.',
    ].join('\n\n'), tenantId);
  } catch (error) {
    chat.errors = (chat.errors || 0) + 1;
    step(`A IA falhou (${chat.errors}ª vez): ${error instanceof Error ? error.message : 'erro desconhecido'}`, false);
    if (chat.errors >= 2 && allowHandoff) {
      await handoff('a IA não conseguiu responder');
      return;
    }
    if (chat.errors >= 3) {
      await waitForCustomer();
      return;
    }
    await retryLater();
    return;
  }

  chat.errors = 0;
  if (allowHandoff && (answer.handoff === true || answer.handoff === 'true')) {
    await handoff('o cliente pediu uma pessoa');
    return;
  }
  const reply = String(answer.reply || '').trim().slice(0, 1500);
  if (!reply) {
    step('A IA não escreveu nenhuma resposta.', false);
    await waitForCustomer();
    return;
  }
  try {
    await sendToLead(tenantId, leadId, loaded.ctx.lead.phone, { text: reply, typingSeconds: 2 }, 'ai');
  } catch (error) {
    step(`Não conseguiu enviar a resposta: ${error instanceof Error ? error.message : 'erro no WhatsApp'}`, false);
    await waitForCustomer();
    return;
  }
  chat.turns = (chat.turns || 0) + 1;
  step(`Cliente: "${customerText.replace(/\s+/g, ' ').slice(0, 120)}" → IA: ${reply.slice(0, 220)}`);
  await waitForCustomer();
}

// ── Gatilhos (chamados pelo resto do sistema) ────────────────

/**
 * Mensagem nova de um lead no WhatsApp. Primeiro entrega como resposta
 * para execuções esperando (Pergunta, Menu, Aguardar resposta); se
 * nenhuma estava esperando, dispara os fluxos com gatilho "Mensagem recebida".
 */
export async function onInboundMessage(tenantId: string, leadId: string, text: string, options: { isNewContact: boolean }) {
  try {
    const { data: waiting } = await supabaseAdmin
      .from('automation_runs')
      .select('id, tenant_id')
      .eq('tenant_id', tenantId)
      .eq('lead_id', leadId)
      .eq('status', 'waiting')
      .eq('waiting_for', 'reply');

    let answered = false;
    for (const row of waiting || []) {
      const run = await claim(row);
      if (!run) continue;
      answered = true;
      await handleReply(run, text);
    }
    if (answered) return;

    for (const flow of await activeFlows(tenantId, 'message_received')) {
      const trigger = triggerOf(flow.graphParsed);
      if (!trigger) continue;
      if (trigger.config.onlyNewContacts && !options.isNewContact) continue;
      if (!messageMatches(trigger.config, text)) continue;
      await startRun(flow, leadId, { message: text });
    }
  } catch (error) {
    log('falha ao tratar mensagem recebida', error);
  }
}

/** Lead novo (manual, WhatsApp, Instagram, Messenger, formulário, totem, outro sistema). */
export async function onLeadCreated(tenantId: string, leadId: string, source: 'manual' | 'whatsapp' | 'form' | 'totem' | 'webhook' | 'instagram' | 'messenger') {
  try {
    for (const flow of await activeFlows(tenantId, 'lead_created')) {
      const wanted = triggerOf(flow.graphParsed)?.config.source || 'any';
      if (wanted !== 'any' && wanted !== source) continue;
      await startRun(flow, leadId, {});
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
      await startRun(flow, leadId, {});
    }
  } catch (error) {
    log('falha ao tratar mudança de etapa', error);
  }
}

/** Etiqueta adicionada ao lead (tela de Leads, ação em massa ou outra automação). */
export async function onTagAdded(tenantId: string, leadId: string, tag: string) {
  try {
    for (const flow of await activeFlows(tenantId, 'tag_added')) {
      if (fold(triggerOf(flow.graphParsed)?.config.tag || '') !== fold(tag)) continue;
      await startRun(flow, leadId, { vars: { etiqueta: tag } });
    }
  } catch (error) {
    log('falha ao tratar etiqueta', error);
  }
}

/** Equipe iniciou o fluxo para leads escolhidos (editor > "Rodar para leads"). */
export async function startFlowForLeads(tenantId: string, flowId: string, leadIds: string[]) {
  const flow = await loadFlow(flowId);
  if (!flow || flow.tenant_id !== tenantId) return { error: 'Fluxo não encontrado.', status: 404 };
  if (flow.status !== 'active') return { error: 'Ative o fluxo antes de rodar para os leads.', status: 409 };
  const ids = [...new Set(leadIds.filter((id) => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id)))].slice(0, 500);
  if (ids.length === 0) return { error: 'Escolha pelo menos um lead.', status: 400 };
  const { data } = await supabaseAdmin.from('leads').select('id, blocked').eq('tenant_id', tenantId).in('id', ids);
  const valid = (data || []).filter((row) => !(row as { blocked?: boolean }).blocked).map((row) => ({ id: row.id as string }));

  // Poucos leads: começa agora. Muitos: fila (60 por minuto, protege o WhatsApp).
  if (valid.length <= 10) {
    let started = 0;
    for (const lead of valid) if ('runId' in (await startRun(flow, lead.id, {}, { ignoreLimits: true, background: true }))) started += 1;
    return { started, skipped: ids.length - started };
  }
  const result = await enqueueMany(flow, valid, {}, { ignoreLimits: true });
  return { started: result.started, skipped: ids.length - result.started };
}

// ── Chamada de outro sistema (webhook de entrada) ────────────

const hookHits = new Map<string, number[]>();
function hookLimited(token: string) {
  const now = Date.now();
  const recent = (hookHits.get(token) || []).filter((at) => now - at < 60_000);
  recent.push(now);
  hookHits.set(token, recent);
  return recent.length > 60;
}

const phoneVariants = (digits: string) => {
  const local = digits.startsWith('55') && digits.length >= 12 ? digits.slice(2) : digits;
  const full = local.length === 10 || local.length === 11 ? `55${local}` : digits;
  return [...new Set([full, local, `+${full}`])];
};

/** POST /api/automations/hooks/[token]: acha (ou cria) o lead pelo telefone e inicia o fluxo. */
export async function handleAutomationWebhook(token: string, payload: Record<string, unknown>): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!/^wh_[a-f0-9]{32}$/.test(token)) return { status: 404, body: { error: 'Endereço inválido.' } };
  if (hookLimited(token)) return { status: 429, body: { error: 'Muitas chamadas seguidas. Tente de novo em um minuto.' } };

  // tenant-scope: ok (o token é que diz de qual empresa é o fluxo)
  const { data } = await supabaseAdmin.from('automation_flows').select(FLOW_COLUMNS).eq('webhook_token', token).maybeSingle();
  if (!data) return { status: 404, body: { error: 'Endereço inválido.' } };
  const flow: LoadedFlow = { ...(data as FlowRow), graphParsed: normalizeGraph(data.graph) };
  if (flow.status !== 'active' || flow.trigger_event !== 'webhook') return { status: 409, body: { error: 'O fluxo não está ativo.' } };
  // tenant-scope: ok (situação da empresa dona do fluxo)
  const { data: tenant } = await supabaseAdmin.from('tenants').select('status, is_platform').eq('id', flow.tenant_id).maybeSingle();
  if (!tenant || (!tenant.is_platform && tenant.status !== 'ACTIVE')) return { status: 403, body: { error: 'Empresa com acesso suspenso.' } };

  const c = triggerOf(flow.graphParsed)!.config;
  const pick = (path: string | undefined, ...fallbacks: string[]) => [path, ...fallbacks].filter(Boolean).map((item) => readPath(payload, item!)).find(Boolean) || '';
  let digits = pick(c.phoneField, 'phone', 'telefone', 'whatsapp', 'celular').replace(/\D/g, '');
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  if (digits.length < 10 || digits.length > 15) return { status: 400, body: { error: `Informe o telefone do contato no campo "${c.phoneField || 'phone'}".` } };

  const { data: found } = await supabaseAdmin.from('leads').select('id').eq('tenant_id', flow.tenant_id).in('phone', phoneVariants(digits)).limit(1);
  let leadId = found?.[0]?.id as string | undefined;
  let created = false;
  if (!leadId) {
    if (c.createLead === false) return { status: 404, body: { error: 'Nenhum lead com esse telefone.' } };
    const email = pick(c.emailField, 'email').toLowerCase().slice(0, 160);
    const { data: stage } = await supabaseAdmin.from('pipeline_stages').select('id').eq('tenant_id', flow.tenant_id).order('position').limit(1).maybeSingle();
    const { data: lead, error } = await supabaseAdmin
      .from('leads')
      .insert({
        tenant_id: flow.tenant_id,
        name: pick(c.nameField, 'name', 'nome').slice(0, 120) || digits,
        phone: digits,
        email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null,
        stage_id: stage?.id ?? null,
        source: 'Webhook',
        last_msg: `🔗 ${flow.name}`.slice(0, 200),
      })
      .select('id')
      .single();
    if (error || !lead) return { status: 500, body: { error: 'Não foi possível criar o lead.' } };
    leadId = lead.id as string;
    created = true;
    fireAutomation(onLeadCreated, flow.tenant_id, leadId, 'webhook');
  }

  const result = await startRun(flow, leadId, { message: pick('message', 'mensagem').slice(0, 1000), input: flattenInput(payload) }, { background: true });
  return { status: 202, body: { ok: true, lead_id: leadId, lead_created: created, started: 'runId' in result, ...('skipped' in result ? { reason: result.skipped } : { run_id: result.runId }) } };
}

/** Dispara sem esperar (quem chama não fica preso no envio de mensagens). */
export function fireAutomation<T extends unknown[]>(handler: (...args: T) => Promise<unknown>, ...args: T) {
  handler(...args).catch((error) => log('erro', error));
}

/** Pausar/excluir um fluxo cancela as execuções que estavam esperando. */
export async function cancelWaitingRuns(tenantId: string, flowId: string, reason: string) {
  await supabaseAdmin
    .from('automation_runs')
    .update({ status: 'cancelled', waiting_for: null, error: reason, finished_at: nowIso(), updated_at: nowIso() })
    .eq('tenant_id', tenantId)
    .eq('flow_id', flowId)
    .in('status', ['waiting', 'running']);
}

// ── Agendador ────────────────────────────────────────────────

/** Gatilho "Data e hora marcadas": dispara uma vez por horário. */
async function fireSchedules(now: Date) {
  // tenant-scope: ok (o agendador atende todas as empresas; cada fluxo carrega o próprio tenant)
  const { data } = await supabaseAdmin.from('automation_flows').select(`${FLOW_COLUMNS}, last_fired_at`).eq('status', 'active').eq('trigger_event', 'schedule').limit(500);
  for (const row of data || []) {
    const flow: LoadedFlow = { ...(row as FlowRow), graphParsed: normalizeGraph(row.graph) };
    const trigger = triggerOf(flow.graphParsed);
    if (!trigger) continue;
    const slot = scheduleSlot(trigger.config, now);
    // Até 1h de atraso (servidor reiniciando); depois disso espera o próximo horário.
    if (!slot || slot > now || now.getTime() - slot.getTime() > 3600_000) continue;
    if (row.last_fired_at && new Date(row.last_fired_at) >= slot) continue;
    // Só um processo dispara cada horário: conta as linhas que mudaram (o
    // retorno da linha não serve, o PostgREST filtra o retorno com o valor novo).
    const { count: claimed } = await supabaseAdmin
      .from('automation_flows')
      .update({ last_fired_at: slot.toISOString() }, { count: 'exact' })
      .eq('tenant_id', flow.tenant_id)
      .eq('id', flow.id)
      .or(`last_fired_at.is.null,last_fired_at.lt.${slot.toISOString()}`);
    if (!claimed) continue;

    let query = supabaseAdmin.from('leads').select('id').eq('tenant_id', flow.tenant_id).eq('blocked', false).order('created_at').limit(1000);
    if (trigger.config.filterStageId) query = query.eq('stage_id', trigger.config.filterStageId);
    if (trigger.config.filterTag) query = query.contains('tags', [trigger.config.filterTag]);
    const { data: leads } = await query;
    const result = await enqueueMany(flow, (leads || []).map((lead) => ({ id: lead.id as string })), {}, {});
    console.log(`[automações] "${flow.name}" agendado: ${result.started} lead(s) na fila`);
  }
}

/** Gatilho "Lead parado": leads sem conversa há X horas. */
async function scanInactive(now: Date) {
  // tenant-scope: ok (o agendador atende todas as empresas; cada fluxo carrega o próprio tenant)
  const { data } = await supabaseAdmin.from('automation_flows').select(FLOW_COLUMNS).eq('status', 'active').eq('trigger_event', 'lead_inactive').limit(500);
  for (const row of data || []) {
    const flow: LoadedFlow = { ...(row as FlowRow), graphParsed: normalizeGraph(row.graph) };
    const c = triggerOf(flow.graphParsed)?.config;
    if (!c) continue;
    const hours = Math.max(1, Number(c.inactiveHours) || 48);
    const cutoff = new Date(now.getTime() - hours * 3600_000);
    // Só quem parou há pouco (até 7 dias além do prazo): ativar o fluxo não
    // dispara para a base inteira de leads antigos.
    const floor = new Date(cutoff.getTime() - 7 * 86400_000);
    let query = supabaseAdmin
      .from('leads')
      .select('id, last_activity_at')
      .eq('tenant_id', flow.tenant_id)
      .eq('blocked', false)
      .lte('last_activity_at', cutoff.toISOString())
      .gte('last_activity_at', floor.toISOString())
      .order('last_activity_at', { ascending: false })
      .limit(200);
    if (c.stageId) query = query.eq('stage_id', c.stageId);
    if (c.inactiveWho === 'customer_waiting') query = query.gt('unread_count', 0);
    if (c.inactiveWho === 'customer_silent') query = query.eq('unread_count', 0);
    const { data: leads, error } = await query;
    if (error) {
      log('lead parado: consulta falhou', error.message);
      continue;
    }
    await enqueueMany(flow, (leads || []).map((lead) => ({ id: lead.id as string, since: lead.last_activity_at as string })), {}, {});
  }
}

async function tick() {
  const now = new Date();
  // Execução presa em "running" (o servidor reiniciou no meio): encerra
  // para não bloquear o lead nesse fluxo para sempre.
  // tenant-scope: ok (limpeza geral do agendador)
  await supabaseAdmin
    .from('automation_runs')
    .update({ status: 'failed', error: 'Execução interrompida (o servidor reiniciou).', finished_at: nowIso() })
    .eq('status', 'running')
    .lt('updated_at', new Date(Date.now() - 10 * 60_000).toISOString());

  await fireSchedules(now).catch((error) => log('agendados', error));
  if (Date.now() - scheduler.lastInactiveScan > 5 * 60_000) {
    scheduler.lastInactiveScan = Date.now();
    await scanInactive(now).catch((error) => log('lead parado', error));
  }

  // tenant-scope: ok (o agendador atende todas as empresas; cada execução carrega o próprio tenant)
  const { data: due } = await supabaseAdmin
    .from('automation_runs')
    .select('id, tenant_id, waiting_for, current_node_id')
    .eq('status', 'waiting')
    .lte('resume_at', nowIso())
    .order('resume_at')
    .limit(RESUMES_PER_TICK);

  for (const row of due || []) {
    const run = await claim(row);
    if (!run) continue;
    const flow = await loadFlow(run.flow_id);
    if (!flow || flow.status !== 'active') {
      await finish(run, 'cancelled', { error: 'O fluxo foi pausado ou excluído.' });
      continue;
    }
    if (row.waiting_for === 'reply') {
      const node = flow.graphParsed.nodes.find((item) => item.id === row.current_node_id);
      // Atendente com IA com resposta pendente (o servidor reiniciou antes do horário).
      if (node?.type === 'ai-chat' && run.context?.aiChat?.pending) {
        await aiChatTurn(run, flow, node);
        continue;
      }
      // Sem resposta no prazo: segue pela saída "Sem resposta" (se houver).
      const next = row.current_node_id ? nextNodeId(flow.graphParsed, row.current_node_id, 'no') : null;
      run.steps = [...(run.steps || []), { node_id: row.current_node_id || '', label: node?.label || 'Resposta', at: nowIso(), ok: true, detail: 'O contato não respondeu no prazo.' }];
      if (!next) {
        await finish(run, 'expired', { steps: run.steps, error: 'O contato não respondeu no prazo.' });
        continue;
      }
      await advance(run, next, flow);
    } else {
      await advance(run, row.current_node_id ? nextNodeId(flow.graphParsed, row.current_node_id, 'default') : null, flow);
    }
  }
}

type SchedulerState = { timer: ReturnType<typeof setInterval> | null; running: boolean; lastInactiveScan: number };
const globalState = globalThis as typeof globalThis & { __vtecAutomationScheduler?: SchedulerState };
const scheduler = globalState.__vtecAutomationScheduler ?? { timer: null, running: false, lastInactiveScan: 0 };
globalState.__vtecAutomationScheduler = scheduler;

export function startAutomationScheduler() {
  if (scheduler.timer) return;
  const run = async () => {
    if (scheduler.running) return;
    scheduler.running = true;
    try {
      await tick();
      beat('automacoes');
    } catch (error) {
      log('erro no agendador', error);
      beat('automacoes', error);
    } finally {
      scheduler.running = false;
    }
  };
  scheduler.timer = setInterval(() => void run(), 60_000);
  console.log('[automações] agendador iniciado (esperas, filas e gatilhos de tempo a cada 60s)');
  void run();
}

/** Só para testes: roda um ciclo do agendador agora. */
export const runSchedulerTickForTests = () => tick();
