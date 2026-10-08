/**
 * ============================================================
 * VTEC OS — Automações: formato do fluxo (navegador e servidor)
 * ============================================================
 * Arquivo puro (sem React, sem banco): tipos dos blocos, saídas de cada
 * bloco, validação antes de ativar, variáveis {{...}}, condições,
 * horário de atendimento e respostas do contato. O editor usa para
 * mostrar os problemas e simular; o motor (src/lib/automations/engine.ts)
 * usa para executar. Assim o que o editor promete é o mesmo que o
 * servidor faz.
 * ============================================================
 */

export type NodeType =
  // Gatilhos
  | 'trigger-message'
  | 'trigger-lead'
  | 'trigger-stage'
  | 'trigger-tag'
  | 'trigger-inactive'
  | 'trigger-schedule'
  | 'trigger-webhook'
  | 'trigger-manual'
  // Conversa
  | 'send-message'
  | 'send-media'
  | 'question'
  | 'menu'
  | 'wait-reply'
  // Lógica
  | 'condition'
  | 'switch'
  | 'business-hours'
  | 'split-ab'
  | 'delay'
  | 'set-variable'
  | 'start-flow'
  | 'end'
  // CRM e equipe
  | 'update-lead'
  | 'tag-lead'
  | 'assign-lead'
  | 'add-note'
  | 'create-task'
  | 'notify-team'
  | 'webhook'
  // Inteligência artificial
  | 'ai-reply'
  | 'ai-classify'
  | 'ai-chat';

/** Nome da saída de um bloco ("default", "yes", "no", "invalid", "a", "b" ou o id de uma opção). */
export type PortName = string;

export type TriggerEvent =
  | 'message_received'
  | 'lead_created'
  | 'stage_changed'
  | 'tag_added'
  | 'lead_inactive'
  | 'schedule'
  | 'webhook'
  | 'manual';

export type AnswerValidation = 'text' | 'number' | 'email' | 'phone' | 'cpf' | 'cnpj' | 'cpf_cnpj' | 'date' | 'yesno';
export type ConditionOperator =
  | 'exists' | 'not_exists' | 'equals' | 'not_equals' | 'contains' | 'not_contains'
  | 'starts_with' | 'ends_with' | 'gt' | 'gte' | 'lt' | 'lte';

export interface MenuOption { id: string; label: string; keywords?: string }
export interface SwitchCase { id: string; label: string; value: string }
export interface AiCategory { id: string; label: string; description?: string }
export interface ConditionRule { field: string; operator: ConditionOperator; value?: string }
export interface BusinessHour { day: number; start: string; end: string }
export interface KeyValue { key: string; value: string }
export interface ResponseMapping { path: string; variable: string }

export interface NodeConfig {
  // ── Gatilhos ──
  matchMode?: 'any' | 'keywords' | 'exact';
  keywords?: string;
  onlyNewContacts?: boolean;
  source?: 'any' | 'whatsapp' | 'instagram' | 'messenger' | 'form' | 'manual' | 'totem' | 'webhook';
  stageId?: string;
  reentryHours?: number;
  /** Quantas vezes, no máximo, o mesmo lead passa por este fluxo (0 = sem limite). */
  maxRunsPerLead?: number;
  tag?: string;
  inactiveHours?: number;
  inactiveWho?: 'any' | 'customer_waiting' | 'customer_silent';
  scheduleMode?: 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'once';
  scheduleTime?: string;
  scheduleWeekday?: number;
  scheduleDay?: number;
  scheduleDate?: string;
  filterStageId?: string;
  filterTag?: string;
  phoneField?: string;
  nameField?: string;
  emailField?: string;
  createLead?: boolean;
  // ── Conversa ──
  message?: string;
  variants?: string[];
  typingSeconds?: number;
  mediaUrl?: string;
  mediaKind?: 'image' | 'document' | 'audio' | 'video';
  fileName?: string;
  caption?: string;
  question?: string;
  variable?: string;
  timeoutHours?: number;
  validation?: AnswerValidation;
  retryMessage?: string;
  maxAttempts?: number;
  saveTo?: '' | 'name' | 'email' | 'cpf_cnpj' | 'value' | 'notes';
  options?: MenuOption[];
  useButtons?: boolean;
  buttonLabel?: string;
  // ── Lógica ──
  conditionField?: string;
  conditionOperator?: ConditionOperator;
  conditionValue?: string;
  rules?: ConditionRule[];
  logic?: 'all' | 'any';
  switchField?: string;
  switchMode?: 'equals' | 'contains';
  cases?: SwitchCase[];
  hours?: BusinessHour[];
  percentA?: number;
  waitMinutes?: number;
  delayMode?: 'duration' | 'until_time';
  untilTime?: string;
  untilWeekdays?: boolean;
  operation?: 'set' | 'append' | 'increment' | 'decrement' | 'clear';
  value?: string;
  flowId?: string;
  stopOthers?: boolean;
  // ── CRM e integrações ──
  field?: 'stage' | 'assigned_to' | 'value' | 'name' | 'email' | 'cpf_cnpj' | 'source';
  fieldValue?: string;
  tagAction?: 'add' | 'remove';
  assignMode?: 'specific' | 'round_robin' | 'least_busy';
  assignees?: string[];
  onlyIfUnassigned?: boolean;
  notifyAssignee?: boolean;
  note?: string;
  taskTitle?: string;
  taskDescription?: string;
  dueMinutes?: number;
  taskAssignee?: string;
  priority?: 'low' | 'medium' | 'high';
  target?: 'assigned' | 'admins' | 'everyone' | 'specific';
  targetUsers?: string[];
  alsoWhatsApp?: boolean;
  url?: string;
  method?: 'POST' | 'GET' | 'PUT' | 'PATCH';
  headers?: KeyValue[];
  bodyMode?: 'default' | 'custom';
  body?: string;
  responseMap?: ResponseMapping[];
  // ── IA ──
  aiInstructions?: string;
  aiSend?: boolean;
  aiInput?: string;
  categories?: AiCategory[];
  /** Atendente com IA: espera X segundos depois da última mensagem para responder tudo junto. */
  groupSeconds?: number;
  /** Atendente com IA: quantas respostas, no máximo, antes de passar para a equipe. */
  maxTurns?: number;
  /** Atendente com IA: horas em silêncio depois que alguém da equipe responde (0 = não pausa). */
  humanPauseHours?: number;
  /** Atendente com IA: o cliente pode pedir uma pessoa (sai por "Pediu atendente"). */
  allowHandoff?: boolean;
  handoffMessage?: string;
  /** Atendente com IA: horas em silêncio depois de passar para a equipe. */
  handoffPauseHours?: number;
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

export const TRIGGER_EVENT: Record<string, TriggerEvent> = {
  'trigger-message': 'message_received',
  'trigger-lead': 'lead_created',
  'trigger-stage': 'stage_changed',
  'trigger-tag': 'tag_added',
  'trigger-inactive': 'lead_inactive',
  'trigger-schedule': 'schedule',
  'trigger-webhook': 'webhook',
  'trigger-manual': 'manual',
};

export const TRIGGER_TYPES = Object.keys(TRIGGER_EVENT) as NodeType[];
export const isTrigger = (type: NodeType) => TRIGGER_TYPES.includes(type);

/** Blocos que mandam algo para o contato (precisam de WhatsApp conectado). */
export const SENDS_WHATSAPP: NodeType[] = ['send-message', 'send-media', 'question', 'menu', 'ai-chat'];
/** Blocos que usam a IA (Gemini ou IA local configurada no servidor). */
export const USES_AI: NodeType[] = ['ai-reply', 'ai-classify', 'ai-chat'];

export const NODE_TYPES: NodeType[] = [
  ...TRIGGER_TYPES,
  'send-message', 'send-media', 'question', 'menu', 'wait-reply',
  'condition', 'switch', 'business-hours', 'split-ab', 'delay', 'set-variable', 'start-flow', 'end',
  'update-lead', 'tag-lead', 'assign-lead', 'add-note', 'create-task', 'notify-team', 'webhook',
  'ai-reply', 'ai-classify', 'ai-chat',
];

export const DEFAULT_HOURS: BusinessHour[] = [1, 2, 3, 4, 5].map((day) => ({ day, start: '08:00', end: '18:00' })).concat([{ day: 6, start: '08:00', end: '12:00' }]);

export const DEFAULT_CONFIG: Record<NodeType, NodeConfig> = {
  'trigger-message': { matchMode: 'any', keywords: '', onlyNewContacts: false, reentryHours: 24, maxRunsPerLead: 0 },
  'trigger-lead': { source: 'any', reentryHours: 24, maxRunsPerLead: 0 },
  'trigger-stage': { stageId: '', reentryHours: 0, maxRunsPerLead: 0 },
  'trigger-tag': { tag: '', reentryHours: 0, maxRunsPerLead: 0 },
  'trigger-inactive': { inactiveHours: 48, inactiveWho: 'customer_silent', stageId: '', reentryHours: 0, maxRunsPerLead: 2 },
  'trigger-schedule': { scheduleMode: 'weekdays', scheduleTime: '09:00', scheduleWeekday: 1, scheduleDay: 1, scheduleDate: '', filterStageId: '', filterTag: '', reentryHours: 0, maxRunsPerLead: 0 },
  'trigger-webhook': { phoneField: 'phone', nameField: 'name', emailField: 'email', createLead: true, reentryHours: 0, maxRunsPerLead: 0 },
  'trigger-manual': { reentryHours: 0, maxRunsPerLead: 0 },
  'send-message': { message: '{{saudacao}}, {{lead.first_name|tudo bem}}! Recebemos sua mensagem e já vamos te atender.', variants: [], typingSeconds: 2 },
  'send-media': { mediaUrl: '', mediaKind: 'image', caption: '', fileName: '' },
  question: { question: 'Qual é o seu principal interesse?', variable: 'interesse', timeoutHours: 24, validation: 'text', retryMessage: '', maxAttempts: 2, saveTo: '' },
  menu: {
    question: 'Como podemos te ajudar? Responda com o número:',
    options: [
      { id: 'opt_1', label: 'Quero um orçamento', keywords: 'orçamento, preço, valor' },
      { id: 'opt_2', label: 'Suporte', keywords: 'ajuda, problema, suporte' },
      { id: 'opt_3', label: 'Falar com uma pessoa', keywords: 'atendente, humano, pessoa' },
    ],
    variable: 'opcao',
    timeoutHours: 24,
    maxAttempts: 2,
    retryMessage: 'Não entendi. Responda só com o número da opção, por favor.',
    useButtons: false,
    buttonLabel: 'Ver opções',
  },
  'wait-reply': { timeoutHours: 24, variable: '' },
  condition: { rules: [{ field: 'message', operator: 'contains', value: '' }], logic: 'all' },
  switch: {
    switchField: 'message',
    switchMode: 'contains',
    cases: [
      { id: 'case_1', label: 'Vendas', value: 'comprar, orçamento, preço' },
      { id: 'case_2', label: 'Financeiro', value: 'boleto, pagamento, nota' },
    ],
  },
  'business-hours': { hours: DEFAULT_HOURS },
  'split-ab': { percentA: 50 },
  delay: { waitMinutes: 60, delayMode: 'duration', untilTime: '09:00', untilWeekdays: false },
  'set-variable': { variable: 'contador', operation: 'set', value: '' },
  'start-flow': { flowId: '' },
  end: { stopOthers: false },
  'update-lead': { field: 'stage', fieldValue: '' },
  'tag-lead': { tag: '', tagAction: 'add' },
  'assign-lead': { assignMode: 'round_robin', assignees: [], onlyIfUnassigned: true, notifyAssignee: true },
  'add-note': { note: 'Contato passou pela automação em {{data.hoje}} às {{hora.agora}}.' },
  'create-task': { taskTitle: 'Retornar para {{lead.name}}', taskDescription: '', dueMinutes: 60, taskAssignee: 'assigned', priority: 'medium' },
  'notify-team': { target: 'assigned', targetUsers: [], message: 'O lead {{lead.name}} precisa de atenção.', alsoWhatsApp: false },
  webhook: { url: '', method: 'POST', headers: [], bodyMode: 'default', body: '', responseMap: [] },
  'ai-reply': { aiInstructions: 'Você é o atendente da {{empresa}}. Responda de forma curta, educada e em português. Se não souber, diga que um atendente vai continuar a conversa.', aiSend: true, aiInput: '{{message}}', variable: 'resposta_ia' },
  'ai-classify': {
    aiInput: '{{message}}',
    variable: 'categoria',
    categories: [
      { id: 'cat_1', label: 'Quer comprar', description: 'Pede preço, orçamento ou quer contratar' },
      { id: 'cat_2', label: 'Suporte', description: 'Tem um problema ou dúvida sobre algo que já comprou' },
      { id: 'cat_3', label: 'Outro', description: 'Qualquer outro assunto' },
    ],
  },
  'ai-chat': {
    aiInstructions: 'Você é o atendente da {{empresa}} no WhatsApp. Responda de forma curta, educada e em português.\n\nSobre a empresa: (descreva o que vocês fazem, produtos/serviços, horários, endereço e formas de pagamento)\n\nRegras: não invente preços, prazos ou condições que não estejam aqui. Se não souber, diga que vai chamar alguém da equipe.',
    groupSeconds: 8,
    timeoutHours: 24,
    maxTurns: 30,
    humanPauseHours: 2,
    allowHandoff: true,
    handoffMessage: 'Certo, {{lead.first_name|}}! Vou chamar alguém da nossa equipe para continuar com você. 😊',
    handoffPauseHours: 24,
  },
};

export const DEFAULT_LABEL: Record<NodeType, string> = {
  'trigger-message': 'Mensagem recebida',
  'trigger-lead': 'Lead novo',
  'trigger-stage': 'Lead entrou na etapa',
  'trigger-tag': 'Etiqueta adicionada',
  'trigger-inactive': 'Lead parado',
  'trigger-schedule': 'Data e hora marcadas',
  'trigger-webhook': 'Chamada de outro sistema',
  'trigger-manual': 'Iniciado pela equipe',
  'send-message': 'Enviar mensagem',
  'send-media': 'Enviar arquivo',
  question: 'Fazer pergunta',
  menu: 'Menu de opções',
  'wait-reply': 'Aguardar resposta',
  condition: 'Condição',
  switch: 'Dividir por valor',
  'business-hours': 'Horário de atendimento',
  'split-ab': 'Teste A/B',
  delay: 'Aguardar',
  'set-variable': 'Guardar valor',
  'start-flow': 'Iniciar outro fluxo',
  end: 'Encerrar fluxo',
  'update-lead': 'Atualizar lead',
  'tag-lead': 'Etiqueta',
  'assign-lead': 'Distribuir lead',
  'add-note': 'Anotar no lead',
  'create-task': 'Criar tarefa',
  'notify-team': 'Avisar a equipe',
  webhook: 'Chamar webhook',
  'ai-reply': 'Resposta com IA',
  'ai-classify': 'Classificar com IA',
  'ai-chat': 'Atendente com IA',
};

// ── Listas da configuração ───────────────────────────────────

type Loose = Record<string, unknown>;
const asList = (value: unknown): Loose[] => (Array.isArray(value) ? value.filter((item) => item && typeof item === 'object') as Loose[] : []);
const s = (value: unknown) => (typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '');

export function menuOptions(c: NodeConfig): MenuOption[] {
  return asList(c.options).map((item, index) => ({ id: s(item.id) || `opt_${index + 1}`, label: s(item.label), keywords: s(item.keywords) }));
}

export function switchCases(c: NodeConfig): SwitchCase[] {
  return asList(c.cases).map((item, index) => ({ id: s(item.id) || `case_${index + 1}`, label: s(item.label), value: s(item.value) }));
}

export function aiCategories(c: NodeConfig): AiCategory[] {
  return asList(c.categories).map((item, index) => ({ id: s(item.id) || `cat_${index + 1}`, label: s(item.label), description: s(item.description) }));
}

const OPERATORS: ConditionOperator[] = ['exists', 'not_exists', 'equals', 'not_equals', 'contains', 'not_contains', 'starts_with', 'ends_with', 'gt', 'gte', 'lt', 'lte'];
export const NO_VALUE_OPERATORS: ConditionOperator[] = ['exists', 'not_exists'];

/** Regras da condição (fluxos antigos tinham uma regra só, em campos soltos). */
export function conditionRules(c: NodeConfig): ConditionRule[] {
  const rules = asList(c.rules).map((item) => ({
    field: s(item.field).replace(/^var:/, ''),
    operator: (OPERATORS.includes(item.operator as ConditionOperator) ? item.operator : 'contains') as ConditionOperator,
    value: s(item.value),
  }));
  if (rules.length > 0) return rules;
  if (c.conditionField) return [{ field: c.conditionField.replace(/^var:/, ''), operator: c.conditionOperator || 'contains', value: c.conditionValue || '' }];
  return [];
}

export function businessHours(c: NodeConfig): BusinessHour[] {
  return asList(c.hours)
    .map((item) => ({ day: Number(item.day), start: s(item.start), end: s(item.end) }))
    .filter((item) => item.day >= 0 && item.day <= 6 && TIME_RE.test(item.start) && TIME_RE.test(item.end));
}

export const stringList = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.length > 0) : []);
export const keyValues = (value: unknown): KeyValue[] => asList(value).map((item) => ({ key: s(item.key), value: s(item.value) })).filter((item) => item.key);
export const responseMappings = (value: unknown): ResponseMapping[] =>
  asList(value).map((item) => ({ path: s(item.path), variable: cleanVariableName(s(item.variable)) })).filter((item) => item.path && item.variable);

export const cleanVariableName = (value: string) => value.trim().toLowerCase().replace(/[^\w]/g, '_').slice(0, 40);

// ── Saídas de cada bloco ─────────────────────────────────────

export interface Port {
  id: PortName;
  label: string;
  tone: 'default' | 'yes' | 'no' | 'option';
}

const YES = (label: string): Port => ({ id: 'yes', label, tone: 'yes' });
const NO = (label: string): Port => ({ id: 'no', label, tone: 'no' });

/** Saídas de um bloco: a maioria tem uma; perguntas, menus e divisões têm várias. */
export function portsFor(node: Pick<FlowNode, 'type' | 'config'>): Port[] {
  const c = node.config || {};
  switch (node.type) {
    case 'end':
      return [];
    case 'question':
      return [YES('Respondeu'), ...(c.validation && c.validation !== 'text' ? [{ id: 'invalid', label: 'Resposta inválida', tone: 'no' } as Port] : []), NO('Sem resposta')];
    case 'menu':
      return [
        ...menuOptions(c).map((option, index): Port => ({ id: option.id, label: `${index + 1}. ${option.label || 'Opção'}`, tone: 'option' })),
        { id: 'invalid', label: 'Opção inválida', tone: 'no' },
        NO('Sem resposta'),
      ];
    case 'wait-reply':
      return [YES('Respondeu'), NO('Sem resposta')];
    case 'condition':
      return [YES('Sim'), NO('Não')];
    case 'switch':
      return [...switchCases(c).map((item): Port => ({ id: item.id, label: item.label || item.value || 'Caso', tone: 'option' })), NO('Nenhum')];
    case 'business-hours':
      return [YES('Dentro do horário'), NO('Fora do horário')];
    case 'split-ab': {
      const a = Math.min(99, Math.max(1, Math.round(Number(c.percentA) || 50)));
      return [{ id: 'a', label: `A · ${a}%`, tone: 'option' }, { id: 'b', label: `B · ${100 - a}%`, tone: 'option' }];
    }
    case 'webhook':
      return [{ id: 'default', label: 'Sucesso', tone: 'default' }, NO('Erro')];
    case 'ai-reply':
      return [{ id: 'default', label: 'Pronto', tone: 'default' }, NO('Erro')];
    case 'ai-classify':
      return [...aiCategories(c).map((item): Port => ({ id: item.id, label: item.label || 'Categoria', tone: 'option' })), NO('Não identificou')];
    case 'ai-chat':
      return [{ id: 'handoff', label: 'Pediu atendente', tone: 'option' }, NO('Cliente parou de responder')];
    default:
      return [{ id: 'default', label: '', tone: 'default' }];
  }
}

export function portLabel(node: Pick<FlowNode, 'type' | 'config'>, port: PortName) {
  return portsFor(node).find((item) => item.id === port)?.label || '';
}

// ── Normalização (o que vem do navegador) ────────────────────

const LIMIT_NODES = 120;
const PORT_RE = /^[\w-]{1,40}$/;
const str = (value: unknown, max: number) => (typeof value === 'string' ? value.slice(0, max) : '');
const num = (value: unknown, min: number, max: number, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
};

/** Só texto, número, sim/não e listas rasas (opções, regras, horários...). */
// depth 0 = a configuração; 1 = um campo; 2 = item de lista; 3 = campo de um item.
function cleanValue(value: unknown, depth: number): unknown {
  if (typeof value === 'string') return value.slice(0, depth <= 2 ? 4000 : 1000);
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'boolean') return value;
  if (depth >= 3 || !value || typeof value !== 'object') return undefined;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => cleanValue(item, depth + 1)).filter((item) => item !== undefined);
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Loose).slice(0, 20)) {
    if (!/^\w{1,40}$/.test(key)) continue;
    const clean = cleanValue(item, depth + 1);
    if (clean !== undefined) out[key] = clean;
  }
  return out;
}

/** Ids das opções/casos/categorias: únicos e válidos como nome de saída. */
function fixListIds(config: NodeConfig, key: 'options' | 'cases' | 'categories', prefix: string) {
  const list = asList(config[key]);
  const seen = new Set<string>();
  (config as Loose)[key] = list.map((item, index) => {
    let id = s(item.id);
    if (!/^[a-z]+_[\w]{1,24}$/.test(id) || seen.has(id)) id = `${prefix}_${index + 1}_${seen.size}`;
    seen.add(id);
    return { ...item, id };
  });
}

/** Limpa o que veio do navegador: só campos conhecidos e tamanhos razoáveis. */
export function normalizeGraph(raw: unknown): FlowGraph {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Loose;
  const rawNodes = Array.isArray(input.nodes) ? input.nodes.slice(0, LIMIT_NODES) : [];
  const seenIds = new Set<string>();

  const nodes: FlowNode[] = rawNodes
    .map((item) => (item && typeof item === 'object' ? item : {}) as Loose)
    .filter((item) => NODE_TYPES.includes(item.type as NodeType) && typeof item.id === 'string' && item.id && !seenIds.has(item.id) && Boolean(seenIds.add(item.id)))
    .map((item) => {
      const type = item.type as NodeType;
      const saved = { ...((item.config && typeof item.config === 'object' && !Array.isArray(item.config) ? item.config : {}) as NodeConfig) };
      // Condição da versão anterior: uma regra em campos soltos.
      if (type === 'condition' && !Array.isArray(saved.rules) && saved.conditionField) saved.rules = conditionRules(saved);
      const config = { ...DEFAULT_CONFIG[type], ...saved };
      const clean = (cleanValue(config, 0) || {}) as NodeConfig;
      if (type === 'menu') fixListIds(clean, 'options', 'opt');
      if (type === 'switch') fixListIds(clean, 'cases', 'case');
      if (type === 'ai-classify') fixListIds(clean, 'categories', 'cat');
      return {
        id: str(item.id, 80),
        type,
        label: str(item.label, 80) || DEFAULT_LABEL[type],
        x: num(item.x, -5000, 20000, 100),
        y: num(item.y, -5000, 20000, 100),
        config: clean,
      };
    });

  const byId = new Map(nodes.map((node) => [node.id, node]));
  const rawConnections = Array.isArray(input.connections) ? input.connections.slice(0, LIMIT_NODES * 4) : [];
  const usedPorts = new Set<string>();
  const connections: FlowConnection[] = [];
  for (const raw of rawConnections) {
    const item = (raw && typeof raw === 'object' ? raw : {}) as Loose;
    const from = byId.get(item.fromId as string);
    const to = byId.get(item.toId as string);
    if (!from || !to || from.id === to.id || isTrigger(to.type)) continue;
    const port = PORT_RE.test(String(item.fromPort)) ? String(item.fromPort) : 'default';
    // Saída que não existe mais (opção removida, por exemplo) some junto.
    if (!portsFor(from).some((candidate) => candidate.id === port)) continue;
    // Cada saída leva a um só bloco.
    const key = `${from.id}:${port}`;
    if (usedPorts.has(key)) continue;
    usedPorts.add(key);
    connections.push({ id: str(item.id, 80) || `c-${from.id}-${to.id}`, fromId: from.id, toId: to.id, fromPort: port });
  }

  const rawVariables = Array.isArray(input.variables) ? input.variables.slice(0, 40) : [];
  const variables: FlowVariable[] = rawVariables
    .map((item) => (item && typeof item === 'object' ? item : {}) as Loose)
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
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const UUID_RE = /^[0-9a-f-]{36}$/i;

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

  const variableNames = new Set(availableVariableNames(graph));

  for (const node of graph.nodes) {
    const name = `"${node.label}"`;
    const c = node.config;
    if (trigger && !reachable.has(node.id)) warnings.push(`${name} não está ligado ao fluxo e nunca vai rodar.`);

    // Variáveis usadas nos textos que não existem em lugar nenhum.
    const texts = [c.message, c.question, c.caption, c.fieldValue, c.note, c.taskTitle, c.taskDescription, c.body, c.value, c.aiInstructions, c.aiInput, c.handoffMessage, ...(c.variants || [])];
    for (const text of texts) {
      for (const match of String(text || '').matchAll(/\{\{\s*([\w.]+)\s*(\|[^}]*)?\}\}/g)) {
        const variable = match[1];
        if (!variableNames.has(variable) && !variable.startsWith('entrada.') && !match[2]) warnings.push(`${name}: a variável {{${variable}}} não existe neste fluxo (vai sair vazia).`);
      }
    }

    switch (node.type) {
      case 'trigger-message':
        if (c.matchMode && c.matchMode !== 'any' && !(c.keywords || '').trim()) errors.push(`${name}: informe as palavras-chave.`);
        break;
      case 'trigger-stage':
        if (!c.stageId) errors.push(`${name}: escolha a etapa do funil.`);
        break;
      case 'trigger-tag':
        if (!(c.tag || '').trim()) errors.push(`${name}: informe a etiqueta.`);
        break;
      case 'trigger-inactive':
        if (!(Number(c.inactiveHours) >= 1)) errors.push(`${name}: o tempo parado precisa ser de pelo menos 1 hora.`);
        if (!Number(c.maxRunsPerLead)) warnings.push(`${name}: sem limite de vezes por lead, o contato pode receber o lembrete várias vezes.`);
        break;
      case 'trigger-schedule':
        if (!TIME_RE.test(c.scheduleTime || '')) errors.push(`${name}: informe o horário (ex.: 09:00).`);
        if (c.scheduleMode === 'once' && !/^\d{4}-\d{2}-\d{2}$/.test(c.scheduleDate || '')) errors.push(`${name}: escolha a data.`);
        if (!c.filterStageId && !c.filterTag) warnings.push(`${name}: sem filtro de etapa ou etiqueta, o fluxo roda para todos os leads (até 1.000 por vez).`);
        break;
      case 'send-message':
        if (!(c.message || '').trim()) errors.push(`${name}: escreva a mensagem.`);
        break;
      case 'send-media':
        if (!isHttps(c.mediaUrl)) errors.push(`${name}: envie o arquivo ou informe o endereço https dele.`);
        break;
      case 'question':
        if (!(c.question || '').trim()) errors.push(`${name}: escreva a pergunta.`);
        if (!(c.variable || '').trim()) errors.push(`${name}: dê um nome para guardar a resposta.`);
        if (!nextNodeId(graph, node.id, 'yes')) warnings.push(`${name}: ligue a saída "Respondeu" ao próximo passo.`);
        break;
      case 'menu': {
        const options = menuOptions(c);
        if (!(c.question || '').trim()) errors.push(`${name}: escreva a mensagem do menu.`);
        if (options.length < 2) errors.push(`${name}: o menu precisa de pelo menos 2 opções.`);
        if (options.length > 10) errors.push(`${name}: use no máximo 10 opções.`);
        if (options.some((option) => !option.label.trim())) errors.push(`${name}: todas as opções precisam de um texto.`);
        if (options.some((option) => !nextNodeId(graph, node.id, option.id))) warnings.push(`${name}: há opções sem próximo passo (o fluxo termina nelas).`);
        if (c.useButtons && options.some((option) => option.label.length > (options.length <= 3 ? 20 : 24))) warnings.push(`${name}: na API oficial, botões têm até 20 caracteres e itens de lista até 24 (o resto é cortado).`);
        break;
      }
      case 'wait-reply':
        if (!nextNodeId(graph, node.id, 'yes')) warnings.push(`${name}: ligue a saída "Respondeu" ao próximo passo.`);
        break;
      case 'condition': {
        const rules = conditionRules(c);
        if (rules.length === 0) errors.push(`${name}: adicione pelo menos uma regra.`);
        rules.forEach((rule, index) => {
          if (!rule.field) errors.push(`${name}: escolha o que comparar na regra ${index + 1}.`);
          if (!NO_VALUE_OPERATORS.includes(rule.operator) && !(rule.value || '').trim()) errors.push(`${name}: informe o valor da regra ${index + 1}.`);
        });
        if (!nextNodeId(graph, node.id, 'yes') && !nextNodeId(graph, node.id, 'no')) warnings.push(`${name}: ligue pelo menos uma saída (Sim ou Não).`);
        break;
      }
      case 'switch': {
        const cases = switchCases(c);
        if (!c.switchField) errors.push(`${name}: escolha o que comparar.`);
        if (cases.length === 0) errors.push(`${name}: adicione pelo menos um caso.`);
        if (cases.some((item) => !item.value.trim())) errors.push(`${name}: todos os casos precisam de um valor.`);
        break;
      }
      case 'business-hours':
        if (businessHours(c).length === 0) errors.push(`${name}: marque pelo menos um dia com horário.`);
        if (businessHours(c).some((item) => item.end <= item.start)) errors.push(`${name}: o fim do expediente precisa ser depois do início.`);
        break;
      case 'delay':
        if (c.delayMode === 'until_time') {
          if (!TIME_RE.test(c.untilTime || '')) errors.push(`${name}: informe o horário (ex.: 09:00).`);
        } else if (!(Number(c.waitMinutes) >= 1)) errors.push(`${name}: o tempo de espera precisa ser de pelo menos 1 minuto.`);
        break;
      case 'set-variable':
        if (!cleanVariableName(c.variable || '')) errors.push(`${name}: dê um nome para o valor.`);
        break;
      case 'start-flow':
        if (!c.flowId) errors.push(`${name}: escolha o fluxo.`);
        break;
      case 'update-lead':
        if (!(c.fieldValue || '').trim()) errors.push(`${name}: informe o novo valor.`);
        break;
      case 'tag-lead':
        if (!(c.tag || '').trim()) errors.push(`${name}: informe a etiqueta.`);
        break;
      case 'assign-lead':
        if (c.assignMode === 'specific' && stringList(c.assignees).length === 0) errors.push(`${name}: escolha a pessoa.`);
        break;
      case 'add-note':
        if (!(c.note || '').trim()) errors.push(`${name}: escreva a anotação.`);
        break;
      case 'create-task':
        if (!(c.taskTitle || '').trim()) errors.push(`${name}: dê um título para a tarefa.`);
        if (c.taskAssignee && c.taskAssignee !== 'assigned' && !UUID_RE.test(c.taskAssignee)) errors.push(`${name}: escolha o responsável pela tarefa.`);
        break;
      case 'notify-team':
        if (!(c.message || '').trim()) errors.push(`${name}: escreva o aviso.`);
        if (c.target === 'specific' && stringList(c.targetUsers).length === 0) errors.push(`${name}: escolha quem recebe o aviso.`);
        break;
      case 'webhook':
        if (!isHttps(c.url)) errors.push(`${name}: informe uma URL https.`);
        if (c.bodyMode === 'custom' && c.method !== 'GET' && !(c.body || '').trim()) errors.push(`${name}: escreva o corpo da chamada ou use o padrão.`);
        break;
      case 'ai-reply':
        if (!(c.aiInstructions || '').trim()) errors.push(`${name}: escreva as instruções para a IA.`);
        if (!c.aiSend && !cleanVariableName(c.variable || '')) errors.push(`${name}: sem enviar ao contato, guarde a resposta em um valor.`);
        break;
      case 'ai-classify':
        if (aiCategories(c).length < 2) errors.push(`${name}: a IA precisa de pelo menos 2 categorias.`);
        if (aiCategories(c).some((item) => !item.label.trim())) errors.push(`${name}: todas as categorias precisam de um nome.`);
        break;
      case 'ai-chat':
        if (!(c.aiInstructions || '').trim()) errors.push(`${name}: escreva as instruções para a IA.`);
        if (c.allowHandoff !== false && !(c.handoffMessage || '').trim()) errors.push(`${name}: escreva a mensagem de quando o cliente pede uma pessoa.`);
        if (c.allowHandoff !== false && !nextNodeId(graph, node.id, 'handoff')) warnings.push(`${name}: ligue a saída "Pediu atendente" a um aviso para a equipe (senão ninguém fica sabendo).`);
        if (trigger?.type === 'trigger-message' && Number(trigger.config.reentryHours ?? 24) > 0) warnings.push(`${name}: no gatilho, "Não repetir por" está em ${Number(trigger.config.reentryHours ?? 24)}h. Depois que uma conversa termina, o cliente fica esse tempo sem a IA. Use 0.`);
        break;
    }
  }

  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}

// ── Data e hora (fuso de São Paulo) ──────────────────────────

export const TIME_ZONE = 'America/Sao_Paulo';
export const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function zonedParts(date: Date, timeZone = TIME_ZONE) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' })
      .formatToParts(date)
      .map((part) => [part.type, part.value])
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    weekday: WEEKDAY_INDEX[parts.weekday] ?? 0,
  };
}

/** Horário local (São Paulo) → instante. Dias além do fim do mês viram o mês seguinte. */
export function zonedTime(year: number, month: number, day: number, hour: number, minute: number, timeZone = TIME_ZONE) {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const p = zonedParts(new Date(guess), timeZone);
  const shown = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return new Date(guess - (shown - guess));
}

const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const pad = (value: number) => String(value).padStart(2, '0');

export function inBusinessHours(hours: BusinessHour[], at: Date) {
  const now = zonedParts(at);
  const minute = now.hour * 60 + now.minute;
  return hours.some((item) => item.day === now.weekday && minute >= minutesOf(item.start) && minute < minutesOf(item.end));
}

/** Próxima vez que o relógio marca `time` (opcionalmente só de segunda a sexta). */
export function nextTimeOfDay(time: string, weekdaysOnly: boolean, from: Date) {
  const today = zonedParts(from);
  const [hour, minute] = [Number(time.slice(0, 2)) || 0, Number(time.slice(3, 5)) || 0];
  for (let offset = 0; offset < 8; offset += 1) {
    const candidate = zonedTime(today.year, today.month, today.day + offset, hour, minute);
    const weekday = zonedParts(candidate).weekday;
    if (candidate.getTime() > from.getTime() && (!weekdaysOnly || (weekday >= 1 && weekday <= 5))) return candidate;
  }
  return new Date(from.getTime() + 86400_000);
}

/** Horário de hoje em que o gatilho agendado deveria disparar (null se hoje não é dia). */
export function scheduleSlot(c: NodeConfig, now: Date): Date | null {
  if (!TIME_RE.test(c.scheduleTime || '')) return null;
  const today = zonedParts(now);
  const slot = zonedTime(today.year, today.month, today.day, Number(c.scheduleTime!.slice(0, 2)), Number(c.scheduleTime!.slice(3, 5)));
  const daysInMonth = new Date(Date.UTC(today.year, today.month, 0)).getUTCDate();
  const isToday = (() => {
    switch (c.scheduleMode) {
      case 'daily': return true;
      case 'weekly': return today.weekday === Number(c.scheduleWeekday ?? 1);
      case 'monthly': return today.day === Math.min(daysInMonth, Math.max(1, Number(c.scheduleDay) || 1));
      case 'once': return c.scheduleDate === `${today.year}-${pad(today.month)}-${pad(today.day)}`;
      default: return today.weekday >= 1 && today.weekday <= 5;
    }
  })();
  return isToday ? slot : null;
}

// ── Variáveis e textos ───────────────────────────────────────

export interface RunContext {
  lead: {
    id: string;
    name: string;
    phone: string;
    email: string;
    cpf_cnpj: string;
    stage_id: string;
    stage: string;
    tags: string[];
    value: number;
    source: string;
    assigned_to: string;
    assigned_name: string;
    created_at: string;
    stage_changed_at: string;
  };
  company: { name: string; phone: string; website: string; address: string };
  flow: { name: string };
  message: string;
  vars: Record<string, string>;
  constants: Record<string, string>;
  /** Dados recebidos pelo gatilho "Chamada de outro sistema" ({{entrada.campo}}). */
  input: Record<string, string>;
  now: Date;
}

export const emptyContext = (overrides: Partial<RunContext> = {}): RunContext => ({
  lead: { id: '', name: '', phone: '', email: '', cpf_cnpj: '', stage_id: '', stage: '', tags: [], value: 0, source: '', assigned_to: '', assigned_name: '', created_at: '', stage_changed_at: '' },
  company: { name: '', phone: '', website: '', address: '' },
  flow: { name: '' },
  message: '',
  vars: {},
  constants: {},
  input: {},
  now: new Date(),
  ...overrides,
});

/** Variáveis prontas, em grupos, para o seletor do editor. */
export const BUILTIN_VARIABLES: { group: string; items: { name: string; description: string }[] }[] = [
  {
    group: 'Contato',
    items: [
      { name: 'lead.name', description: 'Nome completo' },
      { name: 'lead.first_name', description: 'Primeiro nome' },
      { name: 'lead.last_name', description: 'Sobrenome' },
      { name: 'lead.phone', description: 'Telefone' },
      { name: 'lead.email', description: 'E-mail' },
      { name: 'lead.cpf_cnpj', description: 'CPF ou CNPJ' },
      { name: 'lead.stage', description: 'Etapa do funil' },
      { name: 'lead.tags', description: 'Etiquetas' },
      { name: 'lead.source', description: 'Origem' },
      { name: 'lead.value', description: 'Valor (R$)' },
      { name: 'lead.assigned_name', description: 'Responsável' },
      { name: 'lead.assigned_first_name', description: 'Primeiro nome do responsável' },
      { name: 'lead.created_at', description: 'Data de cadastro' },
      { name: 'lead.days_since_created', description: 'Dias desde o cadastro' },
      { name: 'lead.days_in_stage', description: 'Dias na etapa atual' },
    ],
  },
  {
    group: 'Conversa',
    items: [
      { name: 'message', description: 'Última mensagem do contato' },
      { name: 'message.first_word', description: 'Primeira palavra da mensagem' },
    ],
  },
  {
    group: 'Empresa',
    items: [
      { name: 'empresa', description: 'Nome da sua empresa' },
      { name: 'empresa.telefone', description: 'Telefone da empresa' },
      { name: 'empresa.site', description: 'Site da empresa' },
      { name: 'empresa.endereco', description: 'Endereço da empresa' },
    ],
  },
  {
    group: 'Data e hora',
    items: [
      { name: 'saudacao', description: 'Bom dia / Boa tarde / Boa noite' },
      { name: 'data.hoje', description: 'Data de hoje (dd/mm/aaaa)' },
      { name: 'data.amanha', description: 'Data de amanhã' },
      { name: 'data.dia_semana', description: 'Dia da semana' },
      { name: 'data.mes', description: 'Mês por extenso' },
      { name: 'hora.agora', description: 'Hora atual (hh:mm)' },
    ],
  },
  {
    group: 'Fluxo',
    items: [{ name: 'fluxo.nome', description: 'Nome deste fluxo' }],
  },
];

const BUILTIN_NAMES = BUILTIN_VARIABLES.flatMap((group) => group.items.map((item) => item.name));
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** Valores que os blocos do fluxo guardam (respostas, menus, IA, webhook, "Guardar valor"). */
export function flowVariables(graph: FlowGraph): { name: string; description: string }[] {
  const out: { name: string; description: string }[] = [];
  const add = (name: string | undefined, description: string) => {
    const clean = cleanVariableName(name || '');
    if (clean && !out.some((item) => item.name === clean)) out.push({ name: clean, description });
  };
  for (const node of graph.nodes) {
    const c = node.config;
    if (node.type === 'question') add(c.variable, `Resposta de "${node.label}"`);
    if (node.type === 'menu') add(c.variable, `Opção escolhida em "${node.label}"`);
    if (node.type === 'wait-reply') add(c.variable, `Resposta em "${node.label}"`);
    if (node.type === 'set-variable') add(c.variable, `Valor guardado em "${node.label}"`);
    if (node.type === 'ai-reply') add(c.variable, `Resposta da IA em "${node.label}"`);
    if (node.type === 'ai-classify') add(c.variable, `Categoria da IA em "${node.label}"`);
    if (node.type === 'webhook') responseMappings(c.responseMap).forEach((item) => add(item.variable, `Resposta do webhook "${node.label}"`));
  }
  for (const variable of graph.variables) if (!out.some((item) => item.name === variable.name)) out.push({ name: variable.name, description: 'Constante do fluxo' });
  return out;
}

export function availableVariableNames(graph: FlowGraph) {
  return [...BUILTIN_NAMES, 'lead.id', 'webhook_status', 'etiqueta', ...flowVariables(graph).map((item) => item.name)];
}

const formatDate = (date: Date) => {
  const p = zonedParts(date);
  return `${pad(p.day)}/${pad(p.month)}/${p.year}`;
};
const daysSince = (iso: string, now: Date) => (iso ? String(Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 86400_000))) : '');

export function variableValue(name: string, ctx: RunContext): string {
  const key = name.trim();
  const now = ctx.now;
  switch (key) {
    case 'lead.id': return ctx.lead.id;
    case 'lead.name': return ctx.lead.name;
    case 'lead.first_name': return ctx.lead.name.trim().split(/\s+/)[0] || '';
    case 'lead.last_name': return ctx.lead.name.trim().split(/\s+/).slice(1).join(' ');
    case 'lead.phone': return ctx.lead.phone;
    case 'lead.email': return ctx.lead.email;
    case 'lead.cpf_cnpj': return ctx.lead.cpf_cnpj;
    case 'lead.stage': return ctx.lead.stage;
    case 'lead.tags': return ctx.lead.tags.join(', ');
    case 'lead.source': return ctx.lead.source;
    case 'lead.value': return ctx.lead.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    case 'lead.assigned_name': return ctx.lead.assigned_name;
    case 'lead.assigned_first_name': return ctx.lead.assigned_name.trim().split(/\s+/)[0] || '';
    case 'lead.created_at': return ctx.lead.created_at ? formatDate(new Date(ctx.lead.created_at)) : '';
    case 'lead.days_since_created': return daysSince(ctx.lead.created_at, now);
    case 'lead.days_in_stage': return daysSince(ctx.lead.stage_changed_at, now);
    case 'message': return ctx.message;
    case 'message.first_word': return ctx.message.trim().split(/\s+/)[0] || '';
    case 'empresa': return ctx.company.name;
    case 'empresa.telefone': return ctx.company.phone;
    case 'empresa.site': return ctx.company.website;
    case 'empresa.endereco': return ctx.company.address;
    case 'fluxo.nome': return ctx.flow.name;
    case 'saudacao': {
      const hour = zonedParts(now).hour;
      return hour >= 5 && hour < 12 ? 'Bom dia' : hour >= 12 && hour < 18 ? 'Boa tarde' : 'Boa noite';
    }
    case 'data.hoje': return formatDate(now);
    case 'data.amanha': return formatDate(new Date(now.getTime() + 86400_000));
    case 'data.dia_semana': return WEEKDAYS[zonedParts(now).weekday].toLowerCase();
    case 'data.mes': return MONTHS[zonedParts(now).month - 1];
    case 'hora.agora': {
      const p = zonedParts(now);
      return `${pad(p.hour)}:${pad(p.minute)}`;
    }
  }
  if (key.startsWith('entrada.')) return ctx.input[key.slice(8)] ?? '';
  if (key in ctx.vars) return ctx.vars[key];
  if (key in ctx.constants) return ctx.constants[key];
  return '';
}

/** Troca {{variavel}} pelo valor. {{variavel|texto}} usa "texto" quando a variável está vazia. */
export function renderTemplate(text: string, ctx: RunContext) {
  return (text || '').replace(/\{\{\s*([\w.]+)\s*(?:\|([^}]*))?\}\}/g, (_, name: string, fallback?: string) => variableValue(name, ctx) || (fallback ?? '').trim());
}

// ── Condições ────────────────────────────────────────────────

/** Campos comuns para as condições (o editor também oferece os valores do fluxo). */
export const CONDITION_FIELDS = [
  { value: 'message', label: 'Última mensagem do contato' },
  { value: 'lead.name', label: 'Nome do lead' },
  { value: 'lead.email', label: 'E-mail do lead' },
  { value: 'lead.phone', label: 'Telefone do lead' },
  { value: 'lead.cpf_cnpj', label: 'CPF/CNPJ do lead' },
  { value: 'lead.stage', label: 'Etapa do funil' },
  { value: 'lead.tags', label: 'Etiquetas do lead' },
  { value: 'lead.source', label: 'Origem do lead' },
  { value: 'lead.value', label: 'Valor do lead' },
  { value: 'lead.assigned_name', label: 'Responsável pelo lead' },
  { value: 'lead.days_since_created', label: 'Dias desde o cadastro' },
  { value: 'lead.days_in_stage', label: 'Dias na etapa atual' },
  { value: 'data.dia_semana', label: 'Dia da semana' },
  { value: 'hora.agora', label: 'Hora atual (hh:mm)' },
];

export const OPERATOR_LABEL: Record<ConditionOperator, string> = {
  contains: 'contém',
  not_contains: 'não contém',
  equals: 'é igual a',
  not_equals: 'é diferente de',
  starts_with: 'começa com',
  ends_with: 'termina com',
  gt: 'é maior que',
  gte: 'é maior ou igual a',
  lt: 'é menor que',
  lte: 'é menor ou igual a',
  exists: 'tem valor',
  not_exists: 'está vazio',
};

export const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** "R$ 1.234,56", "1234.56", "10" → número. */
export function parseNumber(text: string): number {
  const clean = (text || '').replace(/[^\d,.-]/g, '');
  if (!clean) return NaN;
  const normalized = clean.includes(',') ? clean.replace(/\./g, '').replace(',', '.') : clean;
  return Number(normalized);
}

export function evaluateRule(rule: ConditionRule, ctx: RunContext): boolean {
  const raw = variableValue(rule.field, ctx);
  const actual = fold(raw);
  const expected = fold(renderTemplate(rule.value || '', ctx));
  // Várias opções separadas por vírgula: "sim, quero, pode"
  const options = expected.split(',').map((item) => item.trim()).filter(Boolean);
  const tags = rule.field === 'lead.tags' ? ctx.lead.tags.map(fold) : null;
  const time = rule.field === 'hora.agora';
  const compare = (option: string) => {
    if (time) return actual.localeCompare(option);
    return parseNumber(actual) - parseNumber(option);
  };
  switch (rule.operator) {
    case 'exists': return actual.length > 0;
    case 'not_exists': return actual.length === 0;
    case 'equals': return options.some((option) => (tags ? tags.includes(option) : actual === option));
    case 'not_equals': return !options.some((option) => (tags ? tags.includes(option) : actual === option));
    case 'contains': return options.some((option) => actual.includes(option));
    case 'not_contains': return !options.some((option) => actual.includes(option));
    case 'starts_with': return options.some((option) => actual.startsWith(option));
    case 'ends_with': return options.some((option) => actual.endsWith(option));
    case 'gt': return options.some((option) => compare(option) > 0);
    case 'gte': return options.some((option) => compare(option) >= 0);
    case 'lt': return options.some((option) => compare(option) < 0);
    case 'lte': return options.some((option) => compare(option) <= 0);
    default: return false;
  }
}

export function evaluateCondition(config: NodeConfig, ctx: RunContext): boolean {
  const rules = conditionRules(config);
  if (rules.length === 0) return false;
  return config.logic === 'any' ? rules.some((rule) => evaluateRule(rule, ctx)) : rules.every((rule) => evaluateRule(rule, ctx));
}

/** Primeiro caso que bate (ou null = "Nenhum"). */
export function matchSwitch(config: NodeConfig, ctx: RunContext): SwitchCase | null {
  const actual = fold(variableValue(config.switchField || 'message', ctx));
  for (const item of switchCases(config)) {
    const options = fold(renderTemplate(item.value, ctx)).split(',').map((option) => option.trim()).filter(Boolean);
    if (options.some((option) => (config.switchMode === 'equals' ? actual === option : actual.includes(option)))) return item;
  }
  return null;
}

/** Gatilho por mensagem: confere palavras-chave (sem diferenciar acento/maiúscula). */
export function messageMatches(config: NodeConfig, text: string) {
  if (!config.matchMode || config.matchMode === 'any') return true;
  const message = fold(text);
  const keywords = (config.keywords || '').split(',').map(fold).filter(Boolean);
  if (config.matchMode === 'exact') return keywords.some((keyword) => message === keyword);
  return keywords.some((keyword) => message.includes(keyword));
}

// ── Respostas do contato ─────────────────────────────────────

function validCpf(digits: string) {
  if (!/^\d{11}$/.test(digits) || /^(\d)\1+$/.test(digits)) return false;
  const check = (length: number) => {
    let sum = 0;
    for (let i = 0; i < length; i += 1) sum += Number(digits[i]) * (length + 1 - i);
    const rest = (sum * 10) % 11;
    return (rest === 10 ? 0 : rest) === Number(digits[length]);
  };
  return check(9) && check(10);
}

function validCnpj(digits: string) {
  if (!/^\d{14}$/.test(digits) || /^(\d)\1+$/.test(digits)) return false;
  const check = (length: number) => {
    const weights = length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((total, weight, index) => total + Number(digits[index]) * weight, 0);
    const rest = sum % 11;
    return (rest < 2 ? 0 : 11 - rest) === Number(digits[length]);
  };
  return check(12) && check(13);
}

const YES_WORDS = ['sim', 's', 'yes', 'claro', 'quero', 'pode', 'ok', 'isso', 'certo', 'aceito', 'positivo', '1'];
const NO_WORDS = ['nao', 'n', 'no', 'nunca', 'agora nao', 'negativo', 'nao quero', '2'];

export const VALIDATION_LABEL: Record<AnswerValidation, string> = {
  text: 'Qualquer texto',
  number: 'Número',
  email: 'E-mail',
  phone: 'Telefone',
  cpf: 'CPF',
  cnpj: 'CNPJ',
  cpf_cnpj: 'CPF ou CNPJ',
  date: 'Data (dd/mm/aaaa)',
  yesno: 'Sim ou não',
};

/** Confere a resposta conforme o tipo pedido; devolve o valor já arrumado. */
export function validateAnswer(kind: AnswerValidation | undefined, text: string): { ok: boolean; value: string } {
  const value = (text || '').trim();
  if (!value) return { ok: false, value: '' };
  switch (kind) {
    case 'number': {
      const parsed = parseNumber(value);
      return Number.isFinite(parsed) ? { ok: true, value: String(parsed) } : { ok: false, value };
    }
    case 'email': {
      const email = value.toLowerCase();
      return { ok: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email), value: email };
    }
    case 'phone': {
      let digits = value.replace(/\D/g, '');
      if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
      return { ok: digits.length >= 12 && digits.length <= 13, value: digits };
    }
    case 'cpf': {
      const digits = value.replace(/\D/g, '');
      return { ok: validCpf(digits), value: digits };
    }
    case 'cnpj': {
      const digits = value.replace(/\D/g, '');
      return { ok: validCnpj(digits), value: digits };
    }
    case 'cpf_cnpj': {
      const digits = value.replace(/\D/g, '');
      return { ok: validCpf(digits) || validCnpj(digits), value: digits };
    }
    case 'date': {
      const match = value.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/);
      if (!match) return { ok: false, value };
      const day = Number(match[1]);
      const month = Number(match[2]);
      let year = match[3] ? Number(match[3]) : new Date().getFullYear();
      if (year < 100) year += 2000;
      const date = new Date(Date.UTC(year, month - 1, day));
      const ok = date.getUTCDate() === day && date.getUTCMonth() === month - 1;
      return { ok, value: ok ? `${pad(day)}/${pad(month)}/${year}` : value };
    }
    case 'yesno': {
      const folded = fold(value).replace(/[!.?,]/g, '').trim();
      if (YES_WORDS.includes(folded) || folded.startsWith('sim')) return { ok: true, value: 'sim' };
      if (NO_WORDS.includes(folded) || folded.startsWith('nao')) return { ok: true, value: 'não' };
      return { ok: false, value };
    }
    default:
      return { ok: true, value: value.slice(0, 1000) };
  }
}

/** Qual opção do menu o contato escolheu: número, texto da opção ou palavra-chave. */
export function matchMenuOption(options: MenuOption[], text: string): MenuOption | null {
  const answer = fold(text).replace(/[!.?]/g, '').trim();
  if (!answer) return null;
  const number = answer.match(/^(?:opcao\s*)?(\d{1,2})\s*[).-]?$/);
  if (number) return options[Number(number[1]) - 1] || null;
  const exact = options.find((option) => fold(option.label) === answer);
  if (exact) return exact;
  const byKeyword = options.find((option) => (option.keywords || '').split(',').map(fold).filter(Boolean).some((keyword) => answer.includes(keyword)));
  if (byKeyword) return byKeyword;
  return options.find((option) => fold(option.label).length >= 3 && answer.includes(fold(option.label))) || null;
}

/** Texto do menu como vai para o WhatsApp (opções numeradas). */
export function menuText(config: NodeConfig, ctx: RunContext) {
  const lines = menuOptions(config).map((option, index) => `${index + 1}. ${option.label}`);
  return `${renderTemplate(config.question || '', ctx).trim()}\n\n${lines.join('\n')}`.trim();
}

/** Bloco "Guardar valor": novo valor da variável. */
export function applySetVariable(config: NodeConfig, ctx: RunContext): { name: string; value: string } {
  const name = cleanVariableName(config.variable || '');
  const current = ctx.vars[name] ?? ctx.constants[name] ?? '';
  const value = renderTemplate(config.value || '', ctx);
  switch (config.operation) {
    case 'append': return { name, value: `${current}${current && value ? ' ' : ''}${value}`.slice(0, 1000) };
    case 'increment':
    case 'decrement': {
      const base = Number.isFinite(parseNumber(current)) ? parseNumber(current) : 0;
      const step = Number.isFinite(parseNumber(value)) ? parseNumber(value) : 1;
      return { name, value: String(config.operation === 'increment' ? base + step : base - step) };
    }
    case 'clear': return { name, value: '' };
    default: return { name, value: value.slice(0, 1000) };
  }
}

/** Uma das variações da mensagem, sorteada (deixa o envio menos repetitivo). */
export function pickMessage(config: NodeConfig, random = Math.random) {
  const all = [config.message || '', ...stringList(config.variants)].filter((item) => item.trim());
  return all[Math.floor(random() * all.length)] || '';
}

/** Lê um caminho como "data.cliente.id" ou "itens[0].nome" de uma resposta JSON. */
export function readPath(source: unknown, path: string): string {
  let current: unknown = source;
  for (const part of path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean)) {
    if (current === null || current === undefined || typeof current !== 'object') return '';
    current = (current as Record<string, unknown>)[part];
  }
  if (current === null || current === undefined) return '';
  return (typeof current === 'object' ? JSON.stringify(current) : String(current)).slice(0, 1000);
}

/** Achata um JSON em { "cliente.nome": "..." } (para {{entrada.cliente.nome}}). */
export function flattenInput(source: unknown, prefix = '', out: Record<string, string> = {}, depth = 0): Record<string, string> {
  if (Object.keys(out).length >= 80 || depth > 3) return out;
  if (source && typeof source === 'object' && !Array.isArray(source)) {
    for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
      if (!/^[\w-]{1,40}$/.test(key)) continue;
      const name = prefix ? `${prefix}.${key}` : key;
      if (value && typeof value === 'object' && !Array.isArray(value)) flattenInput(value, name, out, depth + 1);
      else if (value !== null && value !== undefined) out[name] = (Array.isArray(value) ? value.map(String).join(', ') : String(value)).slice(0, 1000);
    }
  }
  return out;
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
