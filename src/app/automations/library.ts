import {
  Bell,
  Brain,
  CalendarClock,
  CircleStop,
  Clock,
  FileImage,
  GitBranch,
  Globe,
  Hand,
  HelpCircle,
  Hourglass,
  ListOrdered,
  ListTodo,
  MessageSquare,
  MoveRight,
  Reply,
  Shuffle,
  Sparkles,
  Split,
  StickyNote,
  Store,
  Tag,
  UserPlus,
  UserRoundPen,
  Users,
  Variable,
  Webhook,
  Workflow,
  Zap,
} from 'lucide-react';
import {
  aiCategories,
  conditionRules,
  DEFAULT_CONFIG,
  DEFAULT_LABEL,
  menuOptions,
  OPERATOR_LABEL,
  stringList,
  switchCases,
  businessHours,
  WEEKDAYS,
  CONDITION_FIELDS,
  NO_VALUE_OPERATORS,
  type FlowGraph,
  type FlowNode,
  type NodeType,
  type PortName,
} from '@/lib/automations/flow';

export interface BlockDefinition {
  type: NodeType;
  description: string;
  icon: typeof Zap;
  color: string;
}

export const BLOCK_GROUPS: { title: string; items: BlockDefinition[] }[] = [
  {
    title: 'Gatilhos (quando começa)',
    items: [
      { type: 'trigger-message', description: 'Contato manda mensagem no WhatsApp', icon: Zap, color: '#f59e0b' },
      { type: 'trigger-lead', description: 'Lead novo entra no CRM', icon: UserPlus, color: '#10b981' },
      { type: 'trigger-stage', description: 'Lead é movido para uma etapa do funil', icon: MoveRight, color: '#06b6d4' },
      { type: 'trigger-tag', description: 'Lead recebe uma etiqueta', icon: Tag, color: '#ec4899' },
      { type: 'trigger-inactive', description: 'Conversa parada há um tempo', icon: Hourglass, color: '#a855f7' },
      { type: 'trigger-schedule', description: 'Todo dia, semana ou mês num horário', icon: CalendarClock, color: '#0ea5e9' },
      { type: 'trigger-webhook', description: 'Site, Make, Zapier ou ERP chamam o fluxo', icon: Webhook, color: '#6366f1' },
      { type: 'trigger-manual', description: 'A equipe escolhe os leads e roda', icon: Hand, color: '#64748b' },
    ],
  },
  {
    title: 'Conversa no WhatsApp',
    items: [
      { type: 'send-message', description: 'Envia um texto (com variações e "digitando")', icon: MessageSquare, color: '#22c55e' },
      { type: 'send-media', description: 'Envia imagem, vídeo, áudio ou documento', icon: FileImage, color: '#8b5cf6' },
      { type: 'question', description: 'Pergunta, confere e guarda a resposta', icon: HelpCircle, color: '#0ea5e9' },
      { type: 'menu', description: 'Opções numeradas ou botões, um caminho por opção', icon: ListOrdered, color: '#14b8a6' },
      { type: 'wait-reply', description: 'Espera o contato responder', icon: Reply, color: '#38bdf8' },
    ],
  },
  {
    title: 'Lógica',
    items: [
      { type: 'condition', description: 'Uma ou mais regras: segue por Sim ou Não', icon: Split, color: '#f97316' },
      { type: 'switch', description: 'Vários caminhos conforme um valor', icon: GitBranch, color: '#fb923c' },
      { type: 'business-hours', description: 'Dentro ou fora do expediente', icon: Store, color: '#84cc16' },
      { type: 'split-ab', description: 'Sorteia entre dois caminhos', icon: Shuffle, color: '#d946ef' },
      { type: 'delay', description: 'Espera um tempo ou até um horário', icon: Clock, color: '#64748b' },
      { type: 'set-variable', description: 'Guarda ou calcula um valor', icon: Variable, color: '#a3a3a3' },
      { type: 'start-flow', description: 'Passa o contato para outro fluxo', icon: Workflow, color: '#06b6d4' },
      { type: 'end', description: 'Termina aqui (e pode parar as outras)', icon: CircleStop, color: '#ef4444' },
    ],
  },
  {
    title: 'CRM e equipe',
    items: [
      { type: 'update-lead', description: 'Muda etapa, responsável ou dados', icon: UserRoundPen, color: '#3b82f6' },
      { type: 'tag-lead', description: 'Adiciona ou tira etiquetas', icon: Tag, color: '#ec4899' },
      { type: 'assign-lead', description: 'Rodízio ou quem tem menos leads', icon: Users, color: '#2563eb' },
      { type: 'add-note', description: 'Registra uma observação no lead', icon: StickyNote, color: '#eab308' },
      { type: 'create-task', description: 'Tarefa na Agenda para a equipe', icon: ListTodo, color: '#0891b2' },
      { type: 'notify-team', description: 'Aviso no sino (e no WhatsApp)', icon: Bell, color: '#f59e0b' },
      { type: 'webhook', description: 'Envia ou busca dados em outro sistema', icon: Globe, color: '#6366f1' },
    ],
  },
  {
    title: 'Inteligência artificial',
    items: [
      { type: 'ai-reply', description: 'A IA responde o contato com as suas regras', icon: Sparkles, color: '#8b5cf6' },
      { type: 'ai-classify', description: 'A IA entende a intenção e escolhe o caminho', icon: Brain, color: '#c026d3' },
    ],
  },
];

export const BLOCKS: Record<NodeType, BlockDefinition> = Object.fromEntries(
  BLOCK_GROUPS.flatMap((group) => group.items).map((item) => [item.type, item])
) as Record<NodeType, BlockDefinition>;

export interface EditorOptions {
  stages: { id: string; name: string }[];
  team: { id: string; name: string; role?: string; hasPhone?: boolean }[];
  tags: string[];
  flows: { id: string; name: string; status: string }[];
  whatsapp: { web: boolean; api: boolean };
  scheduler: boolean;
  ai: boolean;
}

const SOURCE_LABEL: Record<string, string> = { any: 'qualquer origem', whatsapp: 'WhatsApp', form: 'formulário do site', manual: 'cadastro manual', totem: 'totem de senhas', webhook: 'outro sistema' };
const FIELD_LABEL: Record<string, string> = { value: 'Valor', name: 'Nome', email: 'E-mail', cpf_cnpj: 'CPF/CNPJ', source: 'Origem' };
const MEDIA_LABEL: Record<string, string> = { image: 'Imagem', video: 'Vídeo', audio: 'Áudio', document: 'Arquivo' };

export function formatMinutes(minutes: number) {
  if (minutes % 1440 === 0) return `${minutes / 1440} dia(s)`;
  if (minutes % 60 === 0) return `${minutes / 60} hora(s)`;
  return `${minutes} minuto(s)`;
}

export function fieldLabel(field: string) {
  return CONDITION_FIELDS.find((item) => item.value === field)?.label || `{{${field}}}`;
}

const names = (ids: string[], options: EditorOptions | null) => ids.map((id) => options?.team.find((member) => member.id === id)?.name || '—').join(', ');

/** Resumo do bloco mostrado no canvas (gerado da configuração). */
export function describeNode(node: FlowNode, options: EditorOptions | null): string {
  const c = node.config;
  const stage = (id?: string) => options?.stages.find((item) => item.id === id)?.name || id || '—';
  switch (node.type) {
    case 'trigger-message':
      return `${c.matchMode === 'keywords' ? `Mensagem com: ${c.keywords || '…'}` : c.matchMode === 'exact' ? `Mensagem igual a: ${c.keywords || '…'}` : 'Qualquer mensagem'}${c.onlyNewContacts ? ' · só contatos novos' : ''}`;
    case 'trigger-lead':
      return `Lead novo de ${SOURCE_LABEL[c.source || 'any']}`;
    case 'trigger-stage':
      return `Entrou na etapa: ${stage(c.stageId)}`;
    case 'trigger-tag':
      return `Recebeu a etiqueta: ${c.tag || '…'}`;
    case 'trigger-inactive': {
      const who = { any: 'sem conversa', customer_waiting: 'cliente esperando resposta', customer_silent: 'cliente sem responder' }[c.inactiveWho || 'any'];
      return `${who} há ${formatMinutes((Number(c.inactiveHours) || 0) * 60)}${c.stageId ? ` · etapa ${stage(c.stageId)}` : ''}`;
    }
    case 'trigger-schedule': {
      const when = {
        daily: 'Todo dia',
        weekdays: 'De segunda a sexta',
        weekly: `Toda ${WEEKDAYS[Number(c.scheduleWeekday ?? 1)]?.toLowerCase()}`,
        monthly: `Todo dia ${c.scheduleDay || 1}`,
        once: `Em ${c.scheduleDate ? c.scheduleDate.split('-').reverse().join('/') : '…'}`,
      }[c.scheduleMode || 'weekdays'];
      const filters = [c.filterStageId ? `etapa ${stage(c.filterStageId)}` : '', c.filterTag ? `etiqueta ${c.filterTag}` : ''].filter(Boolean).join(' e ');
      return `${when} às ${c.scheduleTime || '…'} · ${filters ? `leads com ${filters}` : 'todos os leads'}`;
    }
    case 'trigger-webhook':
      return `POST de outro sistema · telefone em "${c.phoneField || 'phone'}"${c.createLead === false ? '' : ' · cria o lead se não existir'}`;
    case 'trigger-manual':
      return 'A equipe escolhe os leads em "Rodar para leads".';
    case 'send-message':
      return `${c.message || 'Escreva a mensagem'}${stringList(c.variants).length ? ` (+${stringList(c.variants).length} variação)` : ''}`;
    case 'send-media':
      return c.mediaUrl ? `${MEDIA_LABEL[c.mediaKind || 'image']}: ${c.fileName || c.mediaUrl}` : 'Envie o arquivo';
    case 'question':
      return `${c.question || 'Escreva a pergunta'} → {{${c.variable || 'resposta'}}}`;
    case 'menu':
      return c.question || 'Escreva a mensagem do menu';
    case 'wait-reply':
      return `Até ${c.timeoutHours || 24}h${c.variable ? ` → {{${c.variable}}}` : ''}`;
    case 'condition': {
      const rules = conditionRules(c);
      if (rules.length === 0) return 'Adicione uma regra';
      const text = rules.map((rule) => `${fieldLabel(rule.field)} ${OPERATOR_LABEL[rule.operator]}${NO_VALUE_OPERATORS.includes(rule.operator) ? '' : ` "${rule.value || '…'}"`}`);
      return `Se ${text.join(c.logic === 'any' ? ' ou ' : ' e ')}`;
    }
    case 'switch':
      return `Conforme ${fieldLabel(c.switchField || 'message')} (${switchCases(c).length} caso(s))`;
    case 'business-hours': {
      const days = businessHours(c);
      return days.length ? days.map((item) => `${WEEKDAYS[item.day].slice(0, 3)} ${item.start}–${item.end}`).join(' · ') : 'Marque os dias';
    }
    case 'split-ab':
      return `${c.percentA ?? 50}% caminho A · ${100 - (Number(c.percentA) || 50)}% caminho B`;
    case 'delay':
      return c.delayMode === 'until_time' ? `Aguardar até ${c.untilTime || '…'}${c.untilWeekdays ? ' (dia útil)' : ''}` : `Aguardar ${formatMinutes(Number(c.waitMinutes) || 1)}`;
    case 'set-variable': {
      const op = { set: '=', append: '+= texto', increment: '+', decrement: '−', clear: '= vazio' }[c.operation || 'set'];
      return `{{${c.variable || '…'}}} ${op} ${c.operation === 'clear' ? '' : c.value || ''}`.trim();
    }
    case 'start-flow':
      return `Iniciar: ${options?.flows.find((flow) => flow.id === c.flowId)?.name || 'escolha o fluxo'}`;
    case 'end':
      return c.stopOthers ? 'Encerra e cancela as outras automações do contato' : 'Fim do fluxo';
    case 'update-lead': {
      if (c.field === 'stage' || !c.field) return `Mover para: ${stage(c.fieldValue)}`;
      if (c.field === 'assigned_to') return `Responsável: ${names([c.fieldValue || ''], options)}`;
      return `${FIELD_LABEL[c.field] || 'Campo'}: ${c.fieldValue || '…'}`;
    }
    case 'tag-lead':
      return `${c.tagAction === 'remove' ? 'Tirar' : 'Pôr'} etiqueta: ${c.tag || '…'}`;
    case 'assign-lead': {
      const who = stringList(c.assignees);
      const mode = { specific: 'Para', round_robin: 'Rodízio entre', least_busy: 'Quem tem menos leads entre' }[c.assignMode || 'round_robin'];
      return `${mode} ${who.length ? names(who, options) : 'toda a equipe'}${c.onlyIfUnassigned ? ' · só sem responsável' : ''}`;
    }
    case 'add-note':
      return c.note || 'Escreva a anotação';
    case 'create-task':
      return `${c.taskTitle || 'Tarefa'} · ${Number(c.dueMinutes) > 0 ? `para daqui a ${formatMinutes(Number(c.dueMinutes))}` : 'para agora'}`;
    case 'notify-team': {
      const target = { assigned: 'Responsável', admins: 'Admins e gerentes', everyone: 'Toda a equipe', specific: names(stringList(c.targetUsers), options) || 'Pessoas escolhidas' }[c.target || 'assigned'];
      return `${target}${c.alsoWhatsApp ? ' (+WhatsApp)' : ''}: ${c.message || '…'}`;
    }
    case 'webhook':
      return c.url ? `${c.method || 'POST'} ${c.url}` : 'Informe a URL';
    case 'ai-reply':
      return `${c.aiSend ? 'Responde o contato' : 'Gera um texto'} seguindo: ${c.aiInstructions || '…'}`;
    case 'ai-classify':
      return `Classifica em ${aiCategories(c).map((item) => item.label).join(', ') || '…'}`;
  }
}

let counter = 0;
export const newId = (prefix: string) =>
  `${prefix}-${typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().slice(0, 8) : `${Date.now()}${counter++}`}`;

/** Id para opções de menu, casos e categorias (vira o nome da saída). */
export const newItemId = (prefix: 'opt' | 'case' | 'cat') => newId(prefix).replace('-', '_');

export function makeNode(type: NodeType, x: number, y: number): FlowNode {
  const config = structuredClone(DEFAULT_CONFIG[type]);
  // Cada bloco novo ganha ids próprios nas listas (as saídas não se misturam).
  if (config.options) config.options = config.options.map((option) => ({ ...option, id: newItemId('opt') }));
  if (config.cases) config.cases = config.cases.map((item) => ({ ...item, id: newItemId('case') }));
  if (config.categories) config.categories = config.categories.map((item) => ({ ...item, id: newItemId('cat') }));
  return { id: newId('n'), type, label: DEFAULT_LABEL[type], x, y, config };
}

const link = (from: FlowNode, to: FlowNode, port: PortName = 'default') => ({ id: newId('c'), fromId: from.id, toId: to.id, fromPort: port });

/** Modelos prontos para começar. */
export const TEMPLATES: { id: string; name: string; description: string; build: () => FlowGraph }[] = [
  {
    id: 'blank',
    name: 'Em branco',
    description: 'Só o gatilho de mensagem recebida.',
    build: () => ({ nodes: [makeNode('trigger-message', 80, 160)], connections: [], variables: [] }),
  },
  {
    id: 'welcome',
    name: 'Boas-vindas no WhatsApp',
    description: 'Responde o primeiro contato e avisa a equipe.',
    build: () => {
      const trigger = makeNode('trigger-message', 80, 160);
      trigger.config = { ...trigger.config, onlyNewContacts: true };
      const message = makeNode('send-message', 420, 160);
      message.config = { ...message.config, message: '{{saudacao}}, {{lead.first_name|tudo bem}}! 👋 Aqui é da {{empresa}}. Recebemos sua mensagem e em instantes alguém da equipe te responde.' };
      const notify = makeNode('notify-team', 760, 160);
      notify.config = { ...notify.config, target: 'admins', message: 'Novo contato no WhatsApp: {{lead.name}} ({{lead.phone}}).' };
      return { nodes: [trigger, message, notify], connections: [link(trigger, message), link(message, notify)], variables: [] };
    },
  },
  {
    id: 'menu',
    name: 'Atendimento com menu',
    description: 'Fora do expediente avisa; dentro, mostra o menu e passa para a pessoa certa.',
    build: () => {
      const trigger = makeNode('trigger-message', 40, 260);
      trigger.config = { ...trigger.config, reentryHours: 12 };
      const hours = makeNode('business-hours', 360, 260);
      const closed = makeNode('send-message', 700, 470);
      closed.label = 'Fora do horário';
      closed.config = { ...closed.config, message: '{{saudacao}}, {{lead.first_name|tudo bem}}! Nosso atendimento é de segunda a sexta, das 8h às 18h, e aos sábados até 12h. Assim que abrirmos, respondemos você. 🙏' };
      const menu = makeNode('menu', 700, 140);
      menu.config = { ...menu.config, question: '{{saudacao}}, {{lead.first_name|tudo bem}}! Sou o assistente da {{empresa}}. Sobre o que você quer falar?' };
      const [sales, support, human] = menuOptions(menu.config);
      const tagSales = makeNode('tag-lead', 1060, 20);
      tagSales.config = { tag: 'quer orçamento', tagAction: 'add' };
      const assign = makeNode('assign-lead', 1400, 20);
      const supportMsg = makeNode('send-message', 1060, 220);
      supportMsg.config = { ...supportMsg.config, message: 'Certo! Me conta em poucas palavras o que aconteceu que já chamo o suporte.' };
      const notify = makeNode('notify-team', 1060, 420);
      notify.config = { ...notify.config, target: 'assigned', message: '{{lead.name}} pediu para falar com uma pessoa.' };
      return {
        nodes: [trigger, hours, closed, menu, tagSales, assign, supportMsg, notify],
        connections: [link(trigger, hours), link(hours, menu, 'yes'), link(hours, closed, 'no'), link(menu, tagSales, sales.id), link(tagSales, assign), link(menu, supportMsg, support.id), link(menu, notify, human.id)],
        variables: [],
      };
    },
  },
  {
    id: 'qualify',
    name: 'Qualificação com perguntas',
    description: 'Pergunta o e-mail (confere se é válido) e o interesse, e salva no lead.',
    build: () => {
      const trigger = makeNode('trigger-message', 40, 200);
      trigger.config = { ...trigger.config, onlyNewContacts: true };
      const email = makeNode('question', 360, 200);
      email.label = 'Pedir e-mail';
      email.config = { ...email.config, question: 'Olá, {{lead.first_name|tudo bem}}! Para te enviar a proposta, qual é o seu e-mail?', variable: 'email', validation: 'email', saveTo: 'email', maxAttempts: 3 };
      const interest = makeNode('question', 700, 140);
      interest.label = 'Interesse';
      interest.config = { ...interest.config, question: 'Obrigado! Você quer: 1) Orçamento ou 2) Suporte?', variable: 'interesse' };
      const condition = makeNode('condition', 1040, 140);
      condition.label = 'Quer orçamento?';
      condition.config = { rules: [{ field: 'interesse', operator: 'contains', value: '1, orçamento, orcamento' }], logic: 'all' };
      const tag = makeNode('tag-lead', 1380, 40);
      tag.config = { tag: 'quer orçamento', tagAction: 'add' };
      const reply = makeNode('send-message', 1380, 260);
      reply.config = { ...reply.config, message: 'Certo! Já vou chamar alguém do suporte para te ajudar.' };
      return {
        nodes: [trigger, email, interest, condition, tag, reply],
        connections: [link(trigger, email), link(email, interest, 'yes'), link(interest, condition, 'yes'), link(condition, tag, 'yes'), link(condition, reply, 'no')],
        variables: [],
      };
    },
  },
  {
    id: 'distribute',
    name: 'Distribuir leads novos',
    description: 'Rodízio entre a equipe, aviso no sino e tarefa de retorno em 30 minutos.',
    build: () => {
      const trigger = makeNode('trigger-lead', 80, 160);
      const assign = makeNode('assign-lead', 420, 160);
      const task = makeNode('create-task', 760, 160);
      task.config = { ...task.config, taskTitle: 'Primeiro contato com {{lead.name}}', dueMinutes: 30 };
      return { nodes: [trigger, assign, task], connections: [link(trigger, assign), link(assign, task)], variables: [] };
    },
  },
  {
    id: 'recover',
    name: 'Recuperar lead parado',
    description: 'Cliente sumiu há 2 dias: manda um lembrete e, se não responder, avisa o responsável.',
    build: () => {
      const trigger = makeNode('trigger-inactive', 40, 180);
      const hours = makeNode('delay', 380, 180);
      hours.label = 'Esperar horário comercial';
      hours.config = { ...hours.config, delayMode: 'until_time', untilTime: '10:00', untilWeekdays: true };
      const message = makeNode('send-message', 720, 180);
      message.config = { ...message.config, message: 'Oi, {{lead.first_name|tudo bem}}! Passando para saber se ficou alguma dúvida. Posso te ajudar com mais alguma coisa?' };
      const wait = makeNode('wait-reply', 1060, 180);
      wait.config = { timeoutHours: 24, variable: '' };
      const note = makeNode('add-note', 1400, 60);
      note.config = { note: 'Voltou a responder depois do lembrete automático.' };
      const notify = makeNode('notify-team', 1400, 300);
      notify.config = { ...notify.config, target: 'assigned', message: '{{lead.name}} não respondeu o lembrete. Que tal uma ligação?' };
      return {
        nodes: [trigger, hours, message, wait, note, notify],
        connections: [link(trigger, hours), link(hours, message), link(message, wait), link(wait, note, 'yes'), link(wait, notify, 'no')],
        variables: [],
      };
    },
  },
  {
    id: 'ai',
    name: 'Atendente com IA',
    description: 'A IA entende o assunto: vendas vai para a equipe, dúvidas a IA responde.',
    build: () => {
      const trigger = makeNode('trigger-message', 40, 200);
      trigger.config = { ...trigger.config, reentryHours: 6 };
      const classify = makeNode('ai-classify', 380, 200);
      const [buy, support, other] = aiCategories(classify.config);
      const assign = makeNode('assign-lead', 760, 40);
      const notify = makeNode('notify-team', 1100, 40);
      notify.config = { ...notify.config, message: '{{lead.name}} quer comprar: "{{message}}"' };
      const reply = makeNode('ai-reply', 760, 240);
      const human = makeNode('send-message', 760, 440);
      human.config = { ...human.config, message: 'Recebi sua mensagem! Alguém da equipe já vai te responder.' };
      return {
        nodes: [trigger, classify, assign, notify, reply, human],
        connections: [link(trigger, classify), link(classify, assign, buy.id), link(assign, notify), link(classify, reply, support.id), link(classify, human, other.id), link(classify, human, 'no')],
        variables: [],
      };
    },
  },
  {
    id: 'follow-up',
    name: 'Retorno depois da proposta',
    description: 'Lead entrou em Proposta: espera 2 dias e manda uma mensagem.',
    build: () => {
      const trigger = makeNode('trigger-stage', 80, 160);
      trigger.config = { ...trigger.config, stageId: 'proposta' };
      const delay = makeNode('delay', 420, 160);
      delay.config = { ...delay.config, waitMinutes: 2880 };
      const message = makeNode('send-message', 760, 160);
      message.config = { ...message.config, message: 'Oi, {{lead.first_name|tudo bem}}! Conseguiu ver a proposta? Fico à disposição para qualquer dúvida.' };
      return { nodes: [trigger, delay, message], connections: [link(trigger, delay), link(delay, message)], variables: [] };
    },
  },
  {
    id: 'webhook',
    name: 'Pedido de outro sistema',
    description: 'Seu site ou ERP avisa um pedido: confirma pelo WhatsApp e etiqueta o lead.',
    build: () => {
      const trigger = makeNode('trigger-webhook', 80, 160);
      const message = makeNode('send-message', 420, 160);
      message.config = { ...message.config, message: 'Oi, {{lead.first_name|tudo bem}}! Recebemos o seu pedido {{entrada.pedido|}} e já estamos separando. Qualquer dúvida, é só responder aqui. 😉' };
      const tag = makeNode('tag-lead', 760, 160);
      tag.config = { tag: 'cliente', tagAction: 'add' };
      return { nodes: [trigger, message, tag], connections: [link(trigger, message), link(message, tag)], variables: [] };
    },
  },
];
