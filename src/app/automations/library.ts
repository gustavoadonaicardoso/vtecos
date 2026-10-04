import {
  Bell,
  Clock,
  FileImage,
  Globe,
  HelpCircle,
  MessageSquare,
  MoveRight,
  Split,
  Tag,
  UserPlus,
  UserRoundPen,
  Zap,
} from 'lucide-react';
import {
  CONDITION_FIELDS,
  DEFAULT_CONFIG,
  DEFAULT_LABEL,
  type FlowGraph,
  type FlowNode,
  type NodeType,
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
    ],
  },
  {
    title: 'WhatsApp',
    items: [
      { type: 'send-message', description: 'Envia um texto para o contato', icon: MessageSquare, color: '#22c55e' },
      { type: 'send-media', description: 'Envia imagem ou arquivo por link', icon: FileImage, color: '#8b5cf6' },
      { type: 'question', description: 'Pergunta e guarda a resposta', icon: HelpCircle, color: '#0ea5e9' },
    ],
  },
  {
    title: 'Lógica',
    items: [
      { type: 'condition', description: 'Segue por Sim ou Não', icon: Split, color: '#f97316' },
      { type: 'delay', description: 'Espera um tempo antes de seguir', icon: Clock, color: '#64748b' },
    ],
  },
  {
    title: 'CRM e equipe',
    items: [
      { type: 'update-lead', description: 'Muda etapa, responsável ou dados', icon: UserRoundPen, color: '#3b82f6' },
      { type: 'tag-lead', description: 'Adiciona uma etiqueta ao lead', icon: Tag, color: '#ec4899' },
      { type: 'notify-team', description: 'Aviso no sino da equipe', icon: Bell, color: '#eab308' },
      { type: 'webhook', description: 'Envia os dados para outro sistema', icon: Globe, color: '#6366f1' },
    ],
  },
];

export const BLOCKS: Record<NodeType, BlockDefinition> = Object.fromEntries(
  BLOCK_GROUPS.flatMap((group) => group.items).map((item) => [item.type, item])
) as Record<NodeType, BlockDefinition>;

export interface EditorOptions {
  stages: { id: string; name: string }[];
  team: { id: string; name: string }[];
  whatsapp: { web: boolean; api: boolean };
  scheduler: boolean;
}

const SOURCE_LABEL: Record<string, string> = { any: 'qualquer origem', whatsapp: 'WhatsApp', form: 'formulário do site', manual: 'cadastro manual', totem: 'totem de senhas' };

export function formatMinutes(minutes: number) {
  if (minutes % 1440 === 0) return `${minutes / 1440} dia(s)`;
  if (minutes % 60 === 0) return `${minutes / 60} hora(s)`;
  return `${minutes} minuto(s)`;
}

/** Resumo do bloco mostrado no canvas (gerado da configuração). */
export function describeNode(node: FlowNode, options: EditorOptions | null): string {
  const c = node.config;
  const stage = (id?: string) => options?.stages.find((item) => item.id === id)?.name || id || '—';
  switch (node.type) {
    case 'trigger-message':
      return `${c.matchMode === 'keywords' ? `Mensagem com: ${c.keywords || '…'}` : 'Qualquer mensagem'}${c.onlyNewContacts ? ' · só contatos novos' : ''}`;
    case 'trigger-lead':
      return `Lead novo de ${SOURCE_LABEL[c.source || 'any']}`;
    case 'trigger-stage':
      return `Entrou na etapa: ${stage(c.stageId)}`;
    case 'send-message':
      return c.message || 'Escreva a mensagem';
    case 'send-media':
      return c.mediaUrl ? `${c.mediaKind === 'image' ? 'Imagem' : 'Arquivo'}: ${c.mediaUrl}` : 'Informe o link do arquivo';
    case 'question':
      return `${c.question || 'Escreva a pergunta'} → {{${c.variable || 'resposta'}}}`;
    case 'condition': {
      const field = c.conditionField?.startsWith('var:') ? `{{${c.conditionField.slice(4)}}}` : CONDITION_FIELDS.find((item) => item.value === c.conditionField)?.label || c.conditionField;
      const op = { exists: 'tem valor', not_exists: 'está vazio', equals: 'é igual a', not_equals: 'é diferente de', contains: 'contém', not_contains: 'não contém' }[c.conditionOperator || 'contains'];
      return `Se ${field} ${op}${['exists', 'not_exists'].includes(c.conditionOperator || '') ? '' : ` "${c.conditionValue || '…'}"`}`;
    }
    case 'delay':
      return `Aguardar ${formatMinutes(Number(c.waitMinutes) || 1)}`;
    case 'update-lead': {
      if (c.field === 'stage') return `Mover para: ${stage(c.fieldValue)}`;
      if (c.field === 'assigned_to') return `Responsável: ${options?.team.find((item) => item.id === c.fieldValue)?.name || '—'}`;
      return `${{ value: 'Valor', name: 'Nome', email: 'E-mail' }[c.field as 'value' | 'name' | 'email'] || 'Campo'}: ${c.fieldValue || '…'}`;
    }
    case 'tag-lead':
      return `Etiqueta: ${c.tag || '…'}`;
    case 'notify-team':
      return `${{ assigned: 'Responsável', admins: 'Admins e gerentes', everyone: 'Toda a equipe' }[c.target || 'assigned']}: ${c.message || '…'}`;
    case 'webhook':
      return c.url || 'Informe a URL';
  }
}

let counter = 0;
export const newId = (prefix: string) =>
  `${prefix}-${typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().slice(0, 8) : `${Date.now()}${counter++}`}`;

export function makeNode(type: NodeType, x: number, y: number): FlowNode {
  return { id: newId('n'), type, label: DEFAULT_LABEL[type], x, y, config: { ...DEFAULT_CONFIG[type] } };
}

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
    description: 'Responde o primeiro contato e avisa o responsável.',
    build: () => {
      const trigger = makeNode('trigger-message', 80, 160);
      trigger.config = { ...trigger.config, onlyNewContacts: true };
      const message = makeNode('send-message', 420, 160);
      message.config = { message: 'Olá, {{lead.first_name}}! 👋 Aqui é da {{empresa}}. Recebemos sua mensagem e em instantes alguém da equipe te responde.' };
      const notify = makeNode('notify-team', 760, 160);
      notify.config = { target: 'admins', message: 'Novo contato no WhatsApp: {{lead.name}} ({{lead.phone}}).' };
      return {
        nodes: [trigger, message, notify],
        connections: [
          { id: newId('c'), fromId: trigger.id, toId: message.id, fromPort: 'default' },
          { id: newId('c'), fromId: message.id, toId: notify.id, fromPort: 'default' },
        ],
        variables: [],
      };
    },
  },
  {
    id: 'qualify',
    name: 'Qualificação com pergunta',
    description: 'Pergunta o interesse e separa quem quer orçamento.',
    build: () => {
      const trigger = makeNode('trigger-message', 60, 200);
      trigger.config = { ...trigger.config, onlyNewContacts: true };
      const question = makeNode('question', 380, 200);
      question.config = { question: 'Olá, {{lead.first_name}}! Você quer: 1) Orçamento ou 2) Suporte?', variable: 'interesse', timeoutHours: 24 };
      const condition = makeNode('condition', 700, 200);
      condition.label = 'Quer orçamento?';
      condition.config = { conditionField: 'var:interesse', conditionOperator: 'contains', conditionValue: '1, orçamento, orcamento' };
      const move = makeNode('update-lead', 1020, 100);
      move.label = 'Mover para Proposta';
      move.config = { field: 'stage', fieldValue: 'proposta' };
      const reply = makeNode('send-message', 1020, 320);
      reply.config = { message: 'Certo! Já vou chamar alguém do suporte para te ajudar.' };
      return {
        nodes: [trigger, question, condition, move, reply],
        connections: [
          { id: newId('c'), fromId: trigger.id, toId: question.id, fromPort: 'default' },
          { id: newId('c'), fromId: question.id, toId: condition.id, fromPort: 'yes' },
          { id: newId('c'), fromId: condition.id, toId: move.id, fromPort: 'yes' },
          { id: newId('c'), fromId: condition.id, toId: reply.id, fromPort: 'no' },
        ],
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
      trigger.config = { stageId: 'proposta', reentryHours: 0 };
      const delay = makeNode('delay', 420, 160);
      delay.config = { waitMinutes: 2880 };
      const message = makeNode('send-message', 760, 160);
      message.config = { message: 'Oi, {{lead.first_name}}! Conseguiu ver a proposta? Fico à disposição para qualquer dúvida.' };
      return {
        nodes: [trigger, delay, message],
        connections: [
          { id: newId('c'), fromId: trigger.id, toId: delay.id, fromPort: 'default' },
          { id: newId('c'), fromId: delay.id, toId: message.id, fromPort: 'default' },
        ],
        variables: [],
      };
    },
  },
];
