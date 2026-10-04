/**
 * ============================================================
 * VTEC OS — Automações: formato do fluxo (navegador e servidor)
 * ============================================================
 * Arquivo puro (sem React, sem banco): tipos dos blocos, validação antes
 * de ativar, variáveis {{...}} e condições. O editor usa para mostrar os
 * problemas e simular; o motor (src/lib/automations/engine.ts) usa para
 * executar. Assim o que o editor promete é o mesmo que o servidor faz.
 * ============================================================
 */

export type NodeType =
  | 'trigger-message'
  | 'trigger-lead'
  | 'trigger-stage'
  | 'send-message'
  | 'send-media'
  | 'question'
  | 'condition'
  | 'delay'
  | 'update-lead'
  | 'tag-lead'
  | 'notify-team'
  | 'webhook';

export type PortName = 'default' | 'yes' | 'no';
export type TriggerEvent = 'message_received' | 'lead_created' | 'stage_changed';

export interface NodeConfig {
  // Gatilhos
  matchMode?: 'any' | 'keywords';
  keywords?: string;
  onlyNewContacts?: boolean;
  source?: 'any' | 'whatsapp' | 'form' | 'manual' | 'totem';
  stageId?: string;
  reentryHours?: number;
  // Mensagens
  message?: string;
  mediaUrl?: string;
  mediaKind?: 'image' | 'document';
  caption?: string;
  question?: string;
  variable?: string;
  timeoutHours?: number;
  // Lógica
  conditionField?: string;
  conditionOperator?: 'exists' | 'not_exists' | 'equals' | 'not_equals' | 'contains' | 'not_contains';
  conditionValue?: string;
  waitMinutes?: number;
  // CRM e integrações
  field?: 'stage' | 'assigned_to' | 'value' | 'name' | 'email';
  fieldValue?: string;
  tag?: string;
  target?: 'assigned' | 'admins' | 'everyone';
  url?: string;
}

export interface FlowNode {
  id: string;
  type: NodeType;
  label: string;
  x: number;
  y: number;
  config: NodeConfig;
}

export interface FlowConnection {
  id: string;
  fromId: string;
  toId: string;
  fromPort: PortName;
}

export interface FlowVariable {
  id: string;
  name: string;
  value: string;
}

export interface FlowGraph {
  nodes: FlowNode[];
  connections: FlowConnection[];
  variables: FlowVariable[];
}

export const TRIGGER_TYPES: NodeType[] = ['trigger-message', 'trigger-lead', 'trigger-stage'];
export const isTrigger = (type: NodeType) => TRIGGER_TYPES.includes(type);

export const TRIGGER_EVENT: Record<string, TriggerEvent> = {
  'trigger-message': 'message_received',
  'trigger-lead': 'lead_created',
  'trigger-stage': 'stage_changed',
};

/** Saídas de cada bloco (condição e pergunta têm dois caminhos). */
export function portsFor(type: NodeType): PortName[] {
  if (type === 'condition' || type === 'question') return ['yes', 'no'];
  return ['default'];
}

export function portLabel(type: NodeType, port: PortName) {
  if (type === 'condition') return port === 'yes' ? 'Sim' : 'Não';
  if (type === 'question') return port === 'yes' ? 'Respondeu' : 'Sem resposta';
  return '';
}

export const NODE_TYPES: NodeType[] = [
  'trigger-message', 'trigger-lead', 'trigger-stage',
  'send-message', 'send-media', 'question',
  'condition', 'delay',
  'update-lead', 'tag-lead', 'notify-team', 'webhook',
];

export const DEFAULT_CONFIG: Record<NodeType, NodeConfig> = {
  'trigger-message': { matchMode: 'any', keywords: '', onlyNewContacts: false, reentryHours: 24 },
  'trigger-lead': { source: 'any', reentryHours: 24 },
  'trigger-stage': { stageId: '', reentryHours: 0 },
  'send-message': { message: 'Olá, {{lead.first_name}}! Recebemos sua mensagem e já vamos te atender.' },
  'send-media': { mediaUrl: '', mediaKind: 'image', caption: '' },
  question: { question: 'Qual é o seu principal interesse?', variable: 'interesse', timeoutHours: 24 },
  condition: { conditionField: 'message', conditionOperator: 'contains', conditionValue: '' },
  delay: { waitMinutes: 60 },
  'update-lead': { field: 'stage', fieldValue: '' },
  'tag-lead': { tag: '' },
  'notify-team': { target: 'assigned', message: 'O lead {{lead.name}} precisa de atenção.' },
  webhook: { url: '' },
};

export const DEFAULT_LABEL: Record<NodeType, string> = {
  'trigger-message': 'Mensagem recebida',
  'trigger-lead': 'Lead novo',
  'trigger-stage': 'Lead entrou na etapa',
  'send-message': 'Enviar mensagem',
  'send-media': 'Enviar imagem ou arquivo',
  question: 'Fazer pergunta',
  condition: 'Condição',
  delay: 'Aguardar',
  'update-lead': 'Atualizar lead',
  'tag-lead': 'Adicionar etiqueta',
  'notify-team': 'Avisar a equipe',
  webhook: 'Chamar webhook',
};

const LIMIT_NODES = 80;
const str = (value: unknown, max: number) => (typeof value === 'string' ? value.slice(0, max) : '');
const num = (value: unknown, min: number, max: number, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
};

/** Limpa o que veio do navegador: só campos conhecidos e tamanhos razoáveis. */
export function normalizeGraph(raw: unknown): FlowGraph {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const rawNodes = Array.isArray(input.nodes) ? input.nodes.slice(0, LIMIT_NODES) : [];

  const nodes: FlowNode[] = rawNodes
    .map((item) => (item && typeof item === 'object' ? item : {}) as Record<string, unknown>)
    .filter((item) => NODE_TYPES.includes(item.type as NodeType) && typeof item.id === 'string')
    .map((item) => {
      const type = item.type as NodeType;
      const config = { ...DEFAULT_CONFIG[type], ...((item.config && typeof item.config === 'object' ? item.config : {}) as NodeConfig) };
      const clean: NodeConfig = {};
      for (const [key, value] of Object.entries(config)) {
        if (typeof value === 'string') (clean as Record<string, unknown>)[key] = value.slice(0, 4000);
        else if (typeof value === 'number' || typeof value === 'boolean') (clean as Record<string, unknown>)[key] = value;
      }
      return {
        id: str(item.id, 80),
        type,
        label: str(item.label, 80) || DEFAULT_LABEL[type],
        x: num(item.x, -5000, 20000, 100),
        y: num(item.y, -5000, 20000, 100),
        config: clean,
      };
    });

  const ids = new Set(nodes.map((node) => node.id));
  const rawConnections = Array.isArray(input.connections) ? input.connections.slice(0, LIMIT_NODES * 3) : [];
  const connections: FlowConnection[] = rawConnections
    .map((item) => (item && typeof item === 'object' ? item : {}) as Record<string, unknown>)
    .filter((item) => ids.has(item.fromId as string) && ids.has(item.toId as string) && item.fromId !== item.toId)
    .map((item) => ({
      id: str(item.id, 80) || `c-${item.fromId}-${item.toId}`,
      fromId: item.fromId as string,
      toId: item.toId as string,
      fromPort: (['default', 'yes', 'no'].includes(item.fromPort as string) ? item.fromPort : 'default') as PortName,
    }));

  const rawVariables = Array.isArray(input.variables) ? input.variables.slice(0, 40) : [];
  const variables: FlowVariable[] = rawVariables
    .map((item) => (item && typeof item === 'object' ? item : {}) as Record<string, unknown>)
    .map((item) => ({ id: str(item.id, 80) || str(item.name, 40), name: str(item.name, 40).replace(/[^\w.]/g, '_'), value: str(item.value, 1000) }))
    .filter((item) => item.name);

  return { nodes, connections, variables };
}

export function triggerOf(graph: FlowGraph) {
  return graph.nodes.find((node) => isTrigger(node.type)) || null;
}

export function nextNodeId(graph: FlowGraph, nodeId: string, port: PortName = 'default') {
  return graph.connections.find((connection) => connection.fromId === nodeId && connection.fromPort === port)?.toId ?? null;
}

const isHttps = (url?: string) => /^https:\/\/[^\s]+$/i.test(url || '');

/** Problemas que impedem ativar (errors) e avisos que só merecem atenção (warnings). */
export function validateFlow(graph: FlowGraph): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const triggers = graph.nodes.filter((node) => isTrigger(node.type));

  if (triggers.length === 0) errors.push('Adicione um gatilho (o bloco que diz quando o fluxo começa).');
  if (triggers.length > 1) errors.push('Use só um gatilho por fluxo. Para outro gatilho, crie outro fluxo.');

  const trigger = triggers[0];
  if (trigger && !nextNodeId(graph, trigger.id)) errors.push('Ligue o gatilho ao primeiro bloco do fluxo.');

  // Blocos que o gatilho alcança.
  const reachable = new Set<string>();
  const queue = trigger ? [trigger.id] : [];
  while (queue.length) {
    const id = queue.shift()!;
    if (reachable.has(id)) continue;
    reachable.add(id);
    graph.connections.filter((connection) => connection.fromId === id).forEach((connection) => queue.push(connection.toId));
  }

  for (const node of graph.nodes) {
    const name = `"${node.label}"`;
    const c = node.config;
    if (trigger && !reachable.has(node.id)) warnings.push(`${name} não está ligado ao fluxo e nunca vai rodar.`);
    switch (node.type) {
      case 'trigger-message':
        if (c.matchMode === 'keywords' && !(c.keywords || '').trim()) errors.push(`${name}: informe as palavras-chave.`);
        break;
      case 'trigger-stage':
        if (!c.stageId) errors.push(`${name}: escolha a etapa do funil.`);
        break;
      case 'send-message':
        if (!(c.message || '').trim()) errors.push(`${name}: escreva a mensagem.`);
        break;
      case 'send-media':
        if (!isHttps(c.mediaUrl)) errors.push(`${name}: informe o endereço https da imagem ou do arquivo.`);
        break;
      case 'question':
        if (!(c.question || '').trim()) errors.push(`${name}: escreva a pergunta.`);
        if (!(c.variable || '').trim()) errors.push(`${name}: dê um nome para guardar a resposta.`);
        if (!nextNodeId(graph, node.id, 'yes')) warnings.push(`${name}: ligue a saída "Respondeu" ao próximo passo.`);
        break;
      case 'condition':
        if (!c.conditionField) errors.push(`${name}: escolha o que comparar.`);
        if (!['exists', 'not_exists'].includes(c.conditionOperator || '') && !(c.conditionValue || '').trim()) errors.push(`${name}: informe o valor da comparação.`);
        if (!nextNodeId(graph, node.id, 'yes') && !nextNodeId(graph, node.id, 'no')) warnings.push(`${name}: ligue pelo menos uma saída (Sim ou Não).`);
        break;
      case 'delay':
        if (!(Number(c.waitMinutes) >= 1)) errors.push(`${name}: o tempo de espera precisa ser de pelo menos 1 minuto.`);
        break;
      case 'update-lead':
        if (!(c.fieldValue || '').trim()) errors.push(`${name}: informe o novo valor.`);
        break;
      case 'tag-lead':
        if (!(c.tag || '').trim()) errors.push(`${name}: informe a etiqueta.`);
        break;
      case 'notify-team':
        if (!(c.message || '').trim()) errors.push(`${name}: escreva o aviso.`);
        break;
      case 'webhook':
        if (!isHttps(c.url)) errors.push(`${name}: informe uma URL https.`);
        break;
    }
  }

  return { errors, warnings };
}

// ── Variáveis e condições ────────────────────────────────────

export interface RunContext {
  lead: { name: string; phone: string; email: string; stage_id: string; stage: string; tags: string[]; value: number; source: string };
  company: string;
  message: string;
  vars: Record<string, string>;
  constants: Record<string, string>;
}

/** Variáveis prontas que o editor oferece. */
export const BUILTIN_VARIABLES = [
  { name: 'lead.name', description: 'Nome do contato' },
  { name: 'lead.first_name', description: 'Primeiro nome' },
  { name: 'lead.phone', description: 'Telefone' },
  { name: 'lead.email', description: 'E-mail' },
  { name: 'lead.stage', description: 'Etapa do funil' },
  { name: 'message', description: 'Mensagem que disparou o fluxo' },
  { name: 'empresa', description: 'Nome da sua empresa' },
];

export function variableValue(name: string, ctx: RunContext): string {
  const key = name.trim();
  switch (key) {
    case 'lead.name': return ctx.lead.name;
    case 'lead.first_name': return ctx.lead.name.split(/\s+/)[0] || '';
    case 'lead.phone': return ctx.lead.phone;
    case 'lead.email': return ctx.lead.email;
    case 'lead.stage': return ctx.lead.stage;
    case 'lead.tags': return ctx.lead.tags.join(', ');
    case 'lead.source': return ctx.lead.source;
    case 'message': return ctx.message;
    case 'empresa': return ctx.company;
  }
  if (key in ctx.vars) return ctx.vars[key];
  if (key in ctx.constants) return ctx.constants[key];
  return '';
}

export function renderTemplate(text: string, ctx: RunContext) {
  return (text || '').replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, name: string) => variableValue(name, ctx));
}

/** Campos que a condição compara. "var:nome" = resposta guardada por uma pergunta. */
export const CONDITION_FIELDS = [
  { value: 'message', label: 'Última mensagem do contato' },
  { value: 'lead.name', label: 'Nome do lead' },
  { value: 'lead.email', label: 'E-mail do lead' },
  { value: 'lead.phone', label: 'Telefone do lead' },
  { value: 'lead.stage', label: 'Etapa do funil' },
  { value: 'lead.tags', label: 'Etiquetas do lead' },
  { value: 'lead.source', label: 'Origem do lead' },
];

const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export function evaluateCondition(config: NodeConfig, ctx: RunContext): boolean {
  const field = config.conditionField || '';
  const actual = fold(field.startsWith('var:') ? variableValue(field.slice(4), ctx) : variableValue(field, ctx));
  const expected = fold(renderTemplate(config.conditionValue || '', ctx));
  // Várias opções separadas por vírgula: "sim, quero, pode"
  const options = expected.split(',').map((item) => item.trim()).filter(Boolean);
  switch (config.conditionOperator) {
    case 'exists': return actual.length > 0;
    case 'not_exists': return actual.length === 0;
    case 'equals': return options.some((option) => actual === option);
    case 'not_equals': return !options.some((option) => actual === option);
    case 'contains': return options.some((option) => actual.includes(option));
    case 'not_contains': return !options.some((option) => actual.includes(option));
    default: return false;
  }
}

/** Gatilho por mensagem: confere palavras-chave (qualquer uma, sem diferenciar acento/maiúscula). */
export function messageMatches(config: NodeConfig, text: string) {
  if (config.matchMode !== 'keywords') return true;
  const message = fold(text);
  return (config.keywords || '').split(',').map(fold).filter(Boolean).some((keyword) => message.includes(keyword));
}

// ── Projetos antigos (salvos no navegador) ───────────────────

type LegacyNode = { id: string; type: string; label?: string; x?: number; y?: number; config?: Record<string, unknown>; content?: string };
type LegacyProject = { name?: string; description?: string; nodes?: LegacyNode[]; connections?: FlowConnection[]; variables?: { id?: string; name?: string; value?: string }[] };

/** Converte um projeto da versão antiga (localStorage) para o formato novo. */
export function graphFromLegacy(project: LegacyProject): FlowGraph {
  const nodes = (project.nodes || []).map((node) => {
    const config = (node.config || {}) as Record<string, unknown>;
    let type = node.type as NodeType;
    const extra: NodeConfig = {};
    if (node.type === 'trigger-webhook') { type = 'trigger-lead'; extra.source = 'form'; }
    if (node.type === 'update-lead' && !['stage', 'assigned_to', 'value', 'name', 'email'].includes(String(config.field))) extra.field = 'stage';
    if (node.type === 'send-message' && !config.message && node.content) extra.message = node.content;
    if (node.type === 'question' && !config.question && node.content) extra.question = node.content;
    return { id: node.id, type, label: node.label || '', x: node.x ?? 100, y: node.y ?? 100, config: { ...config, ...extra } };
  });
  return normalizeGraph({
    nodes,
    connections: project.connections || [],
    variables: (project.variables || []).filter((variable) => variable.name && !variable.name.startsWith('lead.')),
  });
}
