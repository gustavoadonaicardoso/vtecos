import {
  Clock,
  Database,
  Globe,
  HelpCircle as QuestionIcon,
  LayoutGrid,
  Mail,
  MessageSquare,
  Share2,
  Split,
  Zap,
} from "lucide-react";
import type { ChannelDefinition, ChannelId, NodeDefinition, NodeType } from "./types";

export const STORAGE_KEY = "vortice_automation_projects";

export const CHANNELS: ChannelDefinition[] = [
  { id: "whatsapp", label: "WhatsApp", icon: MessageSquare, color: "#22c55e" },
  { id: "instagram", label: "Instagram", icon: MessageSquare, color: "#ec4899" },
  { id: "messenger", label: "Messenger", icon: MessageSquare, color: "#3b82f6" },
  { id: "email", label: "E-mail", icon: Mail, color: "#f59e0b" },
  { id: "webhook", label: "Webhook", icon: Globe, color: "#a78bfa" },
];

export const NODE_LIBRARY: { category: string; items: NodeDefinition[] }[] = [
  {
    category: "GATILHOS",
    items: [
      {
        type: "trigger-message",
        category: "GATILHO",
        label: "Mensagem recebida",
        desc: "Começa quando um contato envia mensagem",
        icon: Zap,
        color: "#f59e0b",
        defaultContent: "Inicia quando uma mensagem é recebida",
        defaultConfig: { triggerEvent: "message_received" },
      },
      {
        type: "trigger-lead",
        category: "GATILHO",
        label: "Novo lead criado",
        desc: "Dispara ao criar um lead no CRM",
        icon: LayoutGrid,
        color: "#10b981",
        defaultContent: "Inicia quando um novo lead entra no CRM",
        defaultConfig: { triggerEvent: "lead_created" },
      },
      {
        type: "trigger-webhook",
        category: "GATILHO",
        label: "Webhook recebido",
        desc: "Recebe dados de outro sistema",
        icon: Globe,
        color: "#8b5cf6",
        defaultContent: "Inicia quando uma integração envia dados",
        defaultConfig: { triggerEvent: "webhook_received" },
      },
    ],
  },
  {
    category: "MENSAGENS",
    items: [
      {
        type: "send-message",
        category: "MENSAGEM",
        label: "Enviar mensagem",
        desc: "Envia texto em um canal ativo",
        icon: MessageSquare,
        color: "#3b82f6",
        defaultContent: "Olá, {{lead.name}}! Como podemos ajudar?",
        defaultConfig: { channel: "whatsapp", message: "Olá, {{lead.name}}! Como podemos ajudar?" },
      },
      {
        type: "send-media",
        category: "MENSAGEM",
        label: "Enviar mídia",
        desc: "Envia imagem, documento ou vídeo",
        icon: Share2,
        color: "#8b5cf6",
        defaultContent: "Envie um arquivo usando uma URL pública",
        defaultConfig: { channel: "whatsapp", mediaUrl: "" },
      },
      {
        type: "question",
        category: "MENSAGEM",
        label: "Fazer pergunta",
        desc: "Pergunta e salva a resposta",
        icon: QuestionIcon,
        color: "#0ea5e9",
        defaultContent: "Qual é a sua principal dúvida?",
        defaultConfig: { channel: "whatsapp", question: "Qual é a sua principal dúvida?", variable: "resposta" },
      },
    ],
  },
  {
    category: "LÓGICA",
    items: [
      {
        type: "condition",
        category: "LÓGICA",
        label: "Condição (Se)",
        desc: "Divide o fluxo em Sim e Não",
        icon: Split,
        color: "#f59e0b",
        defaultContent: "Se lead.name existe",
        defaultConfig: { conditionField: "lead.name", conditionOperator: "exists", conditionValue: "" },
      },
      {
        type: "delay",
        category: "LÓGICA",
        label: "Aguardar",
        desc: "Espera antes do próximo bloco",
        icon: Clock,
        color: "#10b981",
        defaultContent: "Aguardar 5 minutos",
        defaultConfig: { waitMinutes: 5 },
      },
    ],
  },
  {
    category: "CRM E INTEGRAÇÕES",
    items: [
      {
        type: "update-lead",
        category: "CRM",
        label: "Atualizar lead",
        desc: "Altera um campo do contato",
        icon: Database,
        color: "#0096ff",
        defaultContent: "Atualizar campo do lead",
        defaultConfig: { field: "status", fieldValue: "Em atendimento" },
      },
      {
        type: "tag-lead",
        category: "CRM",
        label: "Adicionar etiqueta",
        desc: "Organiza contatos automaticamente",
        icon: Zap,
        color: "#ff6d5a",
        defaultContent: "Adicionar etiqueta: novo contato",
        defaultConfig: { tag: "novo contato" },
      },
      {
        type: "webhook",
        category: "INTEGRAÇÃO",
        label: "Chamar webhook",
        desc: "Envia dados para uma URL externa",
        icon: Globe,
        color: "#6366f1",
        defaultContent: "Enviar dados para uma URL externa",
        defaultConfig: { method: "POST", url: "" },
      },
    ],
  },
];

export const ALL_NODE_DEFINITIONS = NODE_LIBRARY.flatMap(category => category.items);

export const getNodeDefinition = (type: NodeType) =>
  ALL_NODE_DEFINITIONS.find(item => item.type === type) || ALL_NODE_DEFINITIONS[0];

export const channelLabel = (id?: ChannelId) => CHANNELS.find(channel => channel.id === id)?.label || "Canal não definido";
