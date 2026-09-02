"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Clock,
  Database,
  Globe,
  HelpCircle as QuestionIcon,
  LayoutGrid,
  Mail,
  Maximize2,
  MessageSquare,
  Monitor,
  MoreVertical,
  MousePointer2,
  Play,
  Plus as PlusIcon,
  Power,
  Save,
  Search,
  Settings2,
  Share2,
  ShieldCheck,
  Split,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import styles from "./automations.module.css";

type ChannelId = "whatsapp" | "instagram" | "messenger" | "email" | "webhook";
type ProjectStatus = "draft" | "active" | "paused";
type PortName = "default" | "yes" | "no";
type NodeType =
  | "trigger-message"
  | "trigger-lead"
  | "trigger-webhook"
  | "send-message"
  | "send-media"
  | "question"
  | "condition"
  | "delay"
  | "update-lead"
  | "tag-lead"
  | "webhook";

type NodeConfig = {
  channel?: ChannelId;
  message?: string;
  mediaUrl?: string;
  question?: string;
  variable?: string;
  triggerEvent?: string;
  waitMinutes?: number;
  conditionField?: string;
  conditionOperator?: string;
  conditionValue?: string;
  field?: string;
  fieldValue?: string;
  tag?: string;
  url?: string;
  method?: string;
};

interface AutomationNode {
  id: string;
  type: NodeType;
  category: string;
  label: string;
  content: string;
  x: number;
  y: number;
  config: NodeConfig;
}

interface Connection {
  id: string;
  fromId: string;
  toId: string;
  fromPort: PortName;
}

interface AutomationVariable {
  id: string;
  name: string;
  value: string;
  description: string;
}

interface AutomationProject {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  channels: ChannelId[];
  variables: AutomationVariable[];
  nodes: AutomationNode[];
  connections: Connection[];
  updatedAt: string;
}

interface NodeDefinition {
  type: NodeType;
  category: string;
  label: string;
  desc: string;
  icon: LucideIcon;
  color: string;
  defaultContent: string;
  defaultConfig: NodeConfig;
}

interface ChannelDefinition {
  id: ChannelId;
  label: string;
  icon: LucideIcon;
  color: string;
}

const STORAGE_KEY = "vortice_automation_projects";

const CHANNELS: ChannelDefinition[] = [
  { id: "whatsapp", label: "WhatsApp", icon: MessageSquare, color: "#22c55e" },
  { id: "instagram", label: "Instagram", icon: MessageSquare, color: "#ec4899" },
  { id: "messenger", label: "Messenger", icon: MessageSquare, color: "#3b82f6" },
  { id: "email", label: "E-mail", icon: Mail, color: "#f59e0b" },
  { id: "webhook", label: "Webhook", icon: Globe, color: "#a78bfa" },
];

const NODE_LIBRARY: { category: string; items: NodeDefinition[] }[] = [
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

const ALL_NODE_DEFINITIONS = NODE_LIBRARY.flatMap(category => category.items);

const makeId = (prefix: string) => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

const getNodeDefinition = (type: NodeType) => ALL_NODE_DEFINITIONS.find(item => item.type === type) || ALL_NODE_DEFINITIONS[0];

const createNode = (definition: NodeDefinition, x: number, y: number): AutomationNode => ({
  id: makeId("node"),
  type: definition.type,
  category: definition.category,
  label: definition.label,
  content: definition.defaultContent,
  x,
  y,
  config: { ...definition.defaultConfig },
});

const createDefaultProject = (): AutomationProject => ({
  id: makeId("project"),
  name: "Novo projeto",
  description: "Configure um fluxo de automação para sua equipe.",
  status: "draft",
  channels: [],
  variables: [
    { id: makeId("variable"), name: "lead.name", value: "{{lead.name}}", description: "Nome do contato" },
    { id: makeId("variable"), name: "lead.phone", value: "{{lead.phone}}", description: "Telefone do contato" },
  ],
  nodes: [createNode(getNodeDefinition("trigger-message"), 140, 180)],
  connections: [],
  updatedAt: new Date().toISOString(),
});

const readProjects = (): AutomationProject[] => {
  if (typeof window === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((project): project is AutomationProject => {
      if (!project || typeof project !== "object") return false;
      const item = project as Partial<AutomationProject>;
      return typeof item.id === "string" && typeof item.name === "string" && Array.isArray(item.nodes) && Array.isArray(item.connections);
    });
  } catch {
    return [];
  }
};

const channelLabel = (id?: ChannelId) => CHANNELS.find(channel => channel.id === id)?.label || "Canal não definido";

export default function AutomationsPage() {
  const [projects, setProjects] = useState<AutomationProject[]>([]);
  const [activeProjectId, setActiveProjectId] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [showProjectHub, setShowProjectHub] = useState(true);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [connectingFrom, setConnectingFrom] = useState<{ nodeId: string; port: PortName } | null>(null);
  const [canvasOffset, setCanvasOffset] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(0.9);
  const [isAdding, setIsAdding] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showTestModal, setShowTestModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDescription, setNewProjectDescription] = useState("");
  const [newVariableName, setNewVariableName] = useState("");
  const [newVariableValue, setNewVariableValue] = useState("");
  const [testInput, setTestInput] = useState("");
  const [testTrace, setTestTrace] = useState<AutomationNode[]>([]);
  const [notice, setNotice] = useState("");
  const canvasWrapperRef = useRef<HTMLDivElement>(null);

  const activeProject = projects.find(project => project.id === activeProjectId);
  const selectedNode = activeProject?.nodes.find(node => node.id === selectedNodeId);

  useEffect(() => {
    const storedProjects = readProjects();
    const initialProjects = storedProjects;
    // This effect hydrates browser-only localStorage data after the initial render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProjects(initialProjects);
    setActiveProjectId(initialProjects[0]?.id || "");
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  }, [hydrated, projects]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 2800);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const updateActiveProject = (updater: (project: AutomationProject) => AutomationProject) => {
    setProjects(current => current.map(project => (
      project.id === activeProjectId
        ? updater({ ...project, updatedAt: new Date().toISOString() })
        : project
    )));
  };

  const updateNode = (nodeId: string, updates: Partial<AutomationNode>) => {
    updateActiveProject(project => ({
      ...project,
      nodes: project.nodes.map(node => node.id === nodeId ? { ...node, ...updates } : node),
    }));
  };

  const updateNodeConfig = (nodeId: string, config: NodeConfig, content?: string) => {
    updateActiveProject(project => ({
      ...project,
      nodes: project.nodes.map(node => node.id === nodeId
        ? { ...node, config: { ...node.config, ...config }, ...(content === undefined ? {} : { content }) }
        : node
      ),
    }));
  };

  const getNextNodePosition = () => {
    if (!activeProject) return { x: 160, y: 180 };
    const index = activeProject.nodes.length;
    return { x: 140 + (index % 3) * 350, y: 150 + Math.floor(index / 3) * 190 };
  };

  const addNode = (definition: NodeDefinition, position = getNextNodePosition()) => {
    if (!activeProject) return;
    const node = createNode(definition, position.x, position.y);
    const source = [...activeProject.nodes].reverse().find(existing => (
      !activeProject.connections.some(connection => connection.fromId === existing.id)
    ));
    const shouldConnect = !definition.type.startsWith("trigger") && source && source.id !== node.id;

    updateActiveProject(project => ({
      ...project,
      nodes: [...project.nodes, node],
      connections: shouldConnect
        ? [...project.connections, {
            id: makeId("connection"),
            fromId: source.id,
            toId: node.id,
            fromPort: source.type === "condition" ? "yes" : "default",
          }]
        : project.connections,
    }));
    setSelectedNodeId(node.id);
    setNotice(shouldConnect ? "Bloco adicionado e conectado ao fluxo." : "Bloco adicionado ao fluxo.");
  };

  const handleCanvasDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsAdding(false);
    const nodeType = event.dataTransfer.getData("application/x-vortice-node") as NodeType;
    const definition = getNodeDefinition(nodeType);
    const rect = canvasWrapperRef.current?.getBoundingClientRect();
    if (!rect || !definition) return;
    const x = (event.clientX - rect.left - canvasOffset.x) / zoom - 130;
    const y = (event.clientY - rect.top - canvasOffset.y) / zoom - 55;
    addNode(definition, { x: Math.max(30, x), y: Math.max(30, y) });
  };

  const handlePortClick = (event: React.MouseEvent, nodeId: string, side: "in" | "out", port: PortName = "default") => {
    event.stopPropagation();
    if (side === "out") {
      setConnectingFrom({ nodeId, port });
      setNotice("Agora clique na entrada de outro bloco para conectar.");
      return;
    }
    if (!connectingFrom || connectingFrom.nodeId === nodeId) return;

    updateActiveProject(project => {
      const exists = project.connections.some(connection => (
        connection.fromId === connectingFrom.nodeId && connection.toId === nodeId && connection.fromPort === connectingFrom.port
      ));
      return exists ? project : {
        ...project,
        connections: [...project.connections, {
          id: makeId("connection"),
          fromId: connectingFrom.nodeId,
          toId: nodeId,
          fromPort: connectingFrom.port,
        }],
      };
    });
    setConnectingFrom(null);
    setNotice("Blocos conectados.");
  };

  const deleteNode = (nodeId: string) => {
    updateActiveProject(project => ({
      ...project,
      nodes: project.nodes.filter(node => node.id !== nodeId),
      connections: project.connections.filter(connection => connection.fromId !== nodeId && connection.toId !== nodeId),
    }));
    setSelectedNodeId(null);
    setNotice("Bloco removido do fluxo.");
  };

  const deleteConnection = (connectionId: string) => {
    updateActiveProject(project => ({
      ...project,
      connections: project.connections.filter(connection => connection.id !== connectionId),
    }));
  };

  const createProject = (event: React.FormEvent) => {
    event.preventDefault();
    const name = newProjectName.trim();
    if (!name) return;
    const project: AutomationProject = {
      ...createDefaultProject(),
      name,
      description: newProjectDescription.trim() || "Configure um fluxo de automação para sua equipe.",
    };
    setProjects(current => [...current, project]);
    setActiveProjectId(project.id);
    setShowProjectHub(false);
    setSelectedNodeId(null);
    setCanvasOffset({ x: 0, y: 0 });
    setNewProjectName("");
    setNewProjectDescription("");
    setShowProjectModal(false);
    setNotice("Projeto criado.");
  };

  const deleteProject = () => {
    if (!activeProject || !window.confirm(`Excluir o projeto “${activeProject.name}”?`)) return;
    if (projects.length === 1) {
      setProjects([]);
      setActiveProjectId("");
      setShowProjectHub(true);
    } else {
      const remaining = projects.filter(project => project.id !== activeProject.id);
      setProjects(remaining);
      setActiveProjectId("");
      setShowProjectHub(true);
    }
    setSelectedNodeId(null);
    setNotice("Projeto excluído.");
  };

  const openProject = (projectId: string) => {
    setActiveProjectId(projectId);
    setShowProjectHub(false);
    setSelectedNodeId(null);
    setConnectingFrom(null);
    setCanvasOffset({ x: 0, y: 0 });
  };

  const returnToProjectHub = () => {
    setShowProjectHub(true);
    setSelectedNodeId(null);
    setConnectingFrom(null);
  };

  const toggleChannel = (channel: ChannelId) => {
    updateActiveProject(project => ({
      ...project,
      channels: project.channels.includes(channel)
        ? project.channels.filter(item => item !== channel)
        : [...project.channels, channel],
    }));
  };

  const addVariable = (event: React.FormEvent) => {
    event.preventDefault();
    const name = newVariableName.trim().replace(/\s+/g, "_");
    if (!name || !activeProject) return;
    updateActiveProject(project => ({
      ...project,
      variables: [...project.variables, {
        id: makeId("variable"),
        name,
        value: newVariableValue.trim() || `{{${name}}}`,
        description: "Variável personalizada",
      }],
    }));
    setNewVariableName("");
    setNewVariableValue("");
  };

  const insertVariable = (name: string) => {
    if (!selectedNode) return;
    const token = `{{${name}}}`;
    const field = selectedNode.type === "send-message" ? "message" : selectedNode.type === "question" ? "question" : "content";
    const current = field === "content" ? selectedNode.content : String(selectedNode.config[field as "message" | "question"] || "");
    const nextValue = `${current}${current ? " " : ""}${token}`;
    if (field === "content") updateNode(selectedNode.id, { content: nextValue });
    else updateNodeConfig(selectedNode.id, { [field]: nextValue }, nextValue);
  };

  const persistChanges = () => {
    if (!activeProject) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
    setNotice("Alterações salvas neste navegador.");
  };

  const toggleStatus = () => {
    updateActiveProject(project => ({
      ...project,
      status: project.status === "active" ? "paused" : "active",
    }));
    setNotice(activeProject?.status === "active" ? "Fluxo pausado." : "Fluxo ativado.");
  };

  const fitCanvas = () => {
    setZoom(0.75);
    setCanvasOffset({ x: 20, y: 20 });
  };

  const runTest = () => {
    if (!activeProject) return;
    const trigger = activeProject.nodes.find(node => node.type.startsWith("trigger"));
    if (!trigger) {
      setTestTrace([]);
      setNotice("Adicione um gatilho antes de executar o teste.");
      return;
    }

    const trace: AutomationNode[] = [];
    const visited = new Set<string>();
    let current: AutomationNode | undefined = trigger;
    while (current && trace.length < 30 && !visited.has(current.id)) {
      visited.add(current.id);
      trace.push(current);
      const outgoing = activeProject.connections.filter(connection => connection.fromId === current?.id);
      if (outgoing.length === 0) break;
      const nextConnection: Connection = current.type === "condition"
        ? outgoing.find(connection => connection.fromPort === (testInput.trim() ? "yes" : "no")) || outgoing[0]
        : outgoing[0];
      current = activeProject.nodes.find(node => node.id === nextConnection.toId);
    }
    setTestTrace(trace);
  };

  const filteredLibrary = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return NODE_LIBRARY;
    return NODE_LIBRARY.map(category => ({
      ...category,
      items: category.items.filter(item => `${item.label} ${item.desc}`.toLowerCase().includes(query)),
    })).filter(category => category.items.length > 0);
  }, [searchTerm]);

  const getPortCoordinates = (node: AutomationNode, side: "in" | "out", port: PortName = "default") => {
    const yOffset = node.type === "condition"
      ? (port === "yes" ? 78 : port === "no" ? 116 : 55)
      : 62;
    return side === "out"
      ? { x: node.x + 280, y: node.y + yOffset }
      : { x: node.x, y: node.y + 62 };
  };

  const renderNodeConfiguration = () => {
    if (!selectedNode || !activeProject) return null;
    const channelOptions = activeProject.channels.length > 0 ? activeProject.channels : CHANNELS.map(channel => channel.id);
    const config = selectedNode.config;
    const setContent = (content: string) => updateNode(selectedNode.id, { content });

    return (
      <>
        <div className={styles.inspectorGroup}>
          <label>Nome do bloco</label>
          <input className={styles.inspectorInput} value={selectedNode.label} onChange={event => updateNode(selectedNode.id, { label: event.target.value })} />
        </div>
        <div className={styles.inspectorGroup}>
          <label>Resumo do bloco</label>
          <textarea className={styles.inspectorTextarea} value={selectedNode.content} onChange={event => setContent(event.target.value)} rows={3} />
        </div>

        {selectedNode.type.startsWith("trigger") && (
          <div className={styles.inspectorGroup}>
            <label>Evento de entrada</label>
            <select className={styles.inspectorInput} value={config.triggerEvent || "message_received"} onChange={event => updateNodeConfig(selectedNode.id, { triggerEvent: event.target.value })}>
              <option value="message_received">Mensagem recebida</option>
              <option value="lead_created">Novo lead criado</option>
              <option value="webhook_received">Webhook recebido</option>
              <option value="schedule">Agendamento recorrente</option>
            </select>
          </div>
        )}

        {(selectedNode.type === "send-message" || selectedNode.type === "send-media" || selectedNode.type === "question") && (
          <div className={styles.inspectorGroup}>
            <label>Canal de envio</label>
            <select className={styles.inspectorInput} value={config.channel || channelOptions[0]} onChange={event => updateNodeConfig(selectedNode.id, { channel: event.target.value as ChannelId })}>
              {channelOptions.map(channel => <option key={channel} value={channel}>{channelLabel(channel)}</option>)}
            </select>
            {activeProject.channels.length === 0 && <small className={styles.inspectorHint}>Nenhum canal foi ativado; selecione um canal na lateral.</small>}
          </div>
        )}

        {selectedNode.type === "send-message" && (
          <div className={styles.inspectorGroup}>
            <label>Mensagem</label>
            <textarea className={styles.inspectorTextarea} value={config.message || selectedNode.content} onChange={event => updateNodeConfig(selectedNode.id, { message: event.target.value }, event.target.value)} rows={5} />
          </div>
        )}

        {selectedNode.type === "send-media" && (
          <div className={styles.inspectorGroup}>
            <label>URL pública da mídia</label>
            <input className={styles.inspectorInput} value={config.mediaUrl || ""} placeholder="https://..." onChange={event => updateNodeConfig(selectedNode.id, { mediaUrl: event.target.value })} />
          </div>
        )}

        {selectedNode.type === "question" && (
          <>
            <div className={styles.inspectorGroup}>
              <label>Pergunta</label>
              <textarea className={styles.inspectorTextarea} value={config.question || selectedNode.content} onChange={event => updateNodeConfig(selectedNode.id, { question: event.target.value }, event.target.value)} rows={4} />
            </div>
            <div className={styles.inspectorGroup}>
              <label>Salvar resposta na variável</label>
              <input className={styles.inspectorInput} value={config.variable || "resposta"} onChange={event => updateNodeConfig(selectedNode.id, { variable: event.target.value })} placeholder="ex.: interesse" />
            </div>
          </>
        )}

        {selectedNode.type === "condition" && (
          <>
            <div className={styles.inspectorGroup}>
              <label>Campo ou variável</label>
              <input className={styles.inspectorInput} value={config.conditionField || ""} onChange={event => updateNodeConfig(selectedNode.id, { conditionField: event.target.value })} placeholder="ex.: lead.email" />
            </div>
            <div className={styles.inspectorGroup}>
              <label>Operador</label>
              <select className={styles.inspectorInput} value={config.conditionOperator || "exists"} onChange={event => updateNodeConfig(selectedNode.id, { conditionOperator: event.target.value })}>
                <option value="exists">Existe</option>
                <option value="equals">É igual a</option>
                <option value="contains">Contém</option>
                <option value="greater_than">É maior que</option>
                <option value="less_than">É menor que</option>
              </select>
            </div>
            <div className={styles.inspectorGroup}>
              <label>Valor de comparação</label>
              <input className={styles.inspectorInput} value={config.conditionValue || ""} onChange={event => updateNodeConfig(selectedNode.id, { conditionValue: event.target.value })} placeholder="Opcional" />
            </div>
            <div className={styles.branchLegend}><span><i className={styles.branchYes} /> Sim</span><span><i className={styles.branchNo} /> Não</span></div>
          </>
        )}

        {selectedNode.type === "delay" && (
          <div className={styles.inspectorGroup}>
            <label>Tempo de espera (minutos)</label>
            <input className={styles.inspectorInput} type="number" min="1" value={config.waitMinutes || 5} onChange={event => updateNodeConfig(selectedNode.id, { waitMinutes: Number(event.target.value) || 1 }, `Aguardar ${Number(event.target.value) || 1} minutos`)} />
          </div>
        )}

        {selectedNode.type === "update-lead" && (
          <>
            <div className={styles.inspectorGroup}>
              <label>Campo do lead</label>
              <select className={styles.inspectorInput} value={config.field || "status"} onChange={event => updateNodeConfig(selectedNode.id, { field: event.target.value })}>
                <option value="status">Status</option><option value="name">Nome</option><option value="email">E-mail</option><option value="phone">Telefone</option><option value="notes">Observações</option>
              </select>
            </div>
            <div className={styles.inspectorGroup}>
              <label>Novo valor</label>
              <input className={styles.inspectorInput} value={config.fieldValue || ""} onChange={event => updateNodeConfig(selectedNode.id, { fieldValue: event.target.value })} />
            </div>
          </>
        )}

        {selectedNode.type === "tag-lead" && (
          <div className={styles.inspectorGroup}>
            <label>Etiqueta</label>
            <input className={styles.inspectorInput} value={config.tag || ""} onChange={event => updateNodeConfig(selectedNode.id, { tag: event.target.value })} placeholder="ex.: cliente quente" />
          </div>
        )}

        {selectedNode.type === "webhook" && (
          <>
            <div className={styles.inspectorGroup}>
              <label>Método</label>
              <select className={styles.inspectorInput} value={config.method || "POST"} onChange={event => updateNodeConfig(selectedNode.id, { method: event.target.value })}><option>POST</option><option>PUT</option><option>GET</option></select>
            </div>
            <div className={styles.inspectorGroup}>
              <label>URL do endpoint</label>
              <input className={styles.inspectorInput} value={config.url || ""} placeholder="https://sua-api.com/webhook" onChange={event => updateNodeConfig(selectedNode.id, { url: event.target.value })} />
            </div>
          </>
        )}

        <div className={styles.variableInsert}>
          <div className={styles.inspectorSubheading}>Inserir variável</div>
          <div className={styles.variableChips}>
            {activeProject.variables.map(variable => (
              <button type="button" key={variable.id} onClick={() => insertVariable(variable.name)}>{`{{${variable.name}}}`}</button>
            ))}
          </div>
        </div>

        <div className={styles.connectionList}>
          <div className={styles.inspectorSubheading}>Conexões deste bloco</div>
          {activeProject.connections.filter(connection => connection.fromId === selectedNode.id || connection.toId === selectedNode.id).map(connection => {
            const otherId = connection.fromId === selectedNode.id ? connection.toId : connection.fromId;
            const other = activeProject.nodes.find(node => node.id === otherId);
            return (
              <div className={styles.connectionItem} key={connection.id}>
                <ArrowRight size={13} /> <span>{other?.label || "Bloco removido"}</span>
                <button type="button" onClick={() => deleteConnection(connection.id)} aria-label="Remover conexão"><X size={13} /></button>
              </div>
            );
          })}
          {activeProject.connections.filter(connection => connection.fromId === selectedNode.id || connection.toId === selectedNode.id).length === 0 && <small className={styles.inspectorHint}>Nenhuma conexão ainda.</small>}
        </div>

        <button type="button" className={styles.deleteNodeBtn} onClick={() => deleteNode(selectedNode.id)}><Trash2 size={15} /> Remover bloco</button>
      </>
    );
  };

  const renderProjectModal = () => showProjectModal && (
    <div className={styles.modalOverlay} onClick={() => setShowProjectModal(false)}>
      <form className={styles.modal} onSubmit={createProject} onClick={event => event.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div><span className={styles.inspectorEyebrow}>NOVO WORKFLOW</span><h2>Criar projeto de automação</h2></div>
          <button type="button" className={styles.closeModalBtn} onClick={() => setShowProjectModal(false)}><X size={18} /></button>
        </div>
        <div className={styles.modalBody}>
          <label>Nome do projeto<input required autoFocus className={styles.inspectorInput} value={newProjectName} onChange={event => setNewProjectName(event.target.value)} placeholder="Ex.: Qualificação de leads" /></label>
          <label>Descrição<textarea className={styles.inspectorTextarea} value={newProjectDescription} onChange={event => setNewProjectDescription(event.target.value)} placeholder="Qual é o objetivo deste fluxo?" rows={3} /></label>
        </div>
        <div className={styles.modalFooter}>
          <button type="button" className={styles.modalCancelBtn} onClick={() => setShowProjectModal(false)}>Cancelar</button>
          <button type="submit" className={styles.modalConfirmBtn}><PlusIcon size={15} /> Criar projeto</button>
        </div>
      </form>
    </div>
  );

  if (!hydrated) {
    return <div className={styles.orchestratorContainer}><div className={styles.loadingState}>Carregando automações...</div></div>;
  }

  if (showProjectHub || !activeProject) {
    return (
      <div className={styles.orchestratorContainer}>
        <nav className={styles.orchestratorHeader}>
          <div className={styles.headerLeft}>
            <div className={`${styles.flowIdentity} ${styles.hubIdentity}`}>
              <span>WORKSPACE DE AUTOMAÇÕES</span>
              <h1 className={styles.hubTitle}>Automações</h1>
            </div>
          </div>
          <div className={styles.headerRight}>
            <button type="button" className={styles.actionBtnPrimary} onClick={() => setShowProjectModal(true)}><PlusIcon size={15} /> Novo projeto</button>
          </div>
        </nav>

        <main className={styles.projectHub}>
          <div className={styles.projectHubIntro}>
            <div>
              <span className={styles.inspectorEyebrow}>CENTRAL DE PROJETOS</span>
              <h2>Escolha um projeto para começar</h2>
              <p>Crie, organize e abra seus fluxos de automação em um só lugar. As ferramentas de edição aparecem somente quando um projeto é aberto.</p>
            </div>
            <div className={styles.projectHubCount}>{projects.length} {projects.length === 1 ? "projeto salvo" : "projetos salvos"}</div>
          </div>

          {projects.length > 0 ? (
            <section className={styles.projectCards} aria-label="Projetos de automação">
              {projects.map(project => {
                const projectStatus = project.status === "active" ? "Ativo" : project.status === "paused" ? "Pausado" : "Rascunho";
                return (
                  <button type="button" className={styles.projectCard} key={project.id} onClick={() => openProject(project.id)}>
                    <div className={styles.projectCardHead}>
                      <div className={`${styles.projectStatus} ${project.status === "active" ? styles.projectStatusActive : project.status === "paused" ? styles.projectStatusPaused : styles.projectStatusDraft}`}><span /> {projectStatus}</div>
                      <ArrowRight size={16} />
                    </div>
                    <h3>{project.name}</h3>
                    <p>{project.description}</p>
                    <div className={styles.projectCardMeta}><span><LayoutGrid size={13} /> {project.nodes.length} blocos</span><span><Share2 size={13} /> {project.connections.length} conexões</span><span><Clock size={13} /> {project.channels.length} canais</span></div>
                  </button>
                );
              })}
            </section>
          ) : (
            <section className={styles.projectEmpty}>
              <div className={styles.projectEmptyIcon}><Zap size={22} /></div>
              <h3>Nenhum projeto criado</h3>
              <p>Comece criando seu primeiro projeto. Depois, você poderá escolher os canais, montar o fluxo e testar as conexões.</p>
              <button type="button" className={styles.modalConfirmBtn} onClick={() => setShowProjectModal(true)}><PlusIcon size={15} /> Criar primeiro projeto</button>
            </section>
          )}
        </main>
        {renderProjectModal()}
      </div>
    );
  }

  const statusLabel = activeProject.status === "active" ? "ATIVO" : activeProject.status === "paused" ? "PAUSADO" : "RASCUNHO";

  return (
    <div className={styles.orchestratorContainer}>
      <nav className={styles.orchestratorHeader}>
        <div className={styles.headerLeft}>
          <button type="button" className={styles.backToProjects} onClick={returnToProjectHub} title="Voltar para projetos"><ArrowLeft size={16} /><span>Projetos</span></button>
          <div className={`${styles.statusBadge} ${activeProject.status === "paused" ? styles.statusPaused : activeProject.status === "draft" ? styles.statusDraft : ""}`}>
            <div className={styles.statusDot} /> {statusLabel}
          </div>
          <div className={styles.flowIdentity}>
            <span>PROJETO DE AUTOMAÇÃO</span>
            <input className={styles.flowNameInput} value={activeProject.name} onChange={event => updateActiveProject(project => ({ ...project, name: event.target.value }))} aria-label="Nome do projeto" />
          </div>
        </div>

        <div className={styles.headerRight}>
          <div className={styles.viewControls}>
            <button type="button" className={`${styles.viewBtn} ${isSearchOpen ? styles.viewBtnActive : ""}`} onClick={() => setIsSearchOpen(open => !open)} title="Pesquisar blocos"><Search size={16} /></button>
            <button type="button" className={styles.viewBtn} onClick={() => setShowTestModal(true)} title="Testar fluxo"><Monitor size={16} /></button>
            <button type="button" className={styles.viewBtn} onClick={() => setShowHelpModal(true)} title="Como funciona"><QuestionIcon size={16} /></button>
          </div>
          <div className={styles.divider} />
          <button type="button" className={styles.actionBtnSecondary} onClick={toggleStatus}><Power size={14} /> {activeProject.status === "active" ? "Pausar fluxo" : "Ativar fluxo"}</button>
          <button type="button" className={styles.actionBtnPrimary} onClick={persistChanges}><Save size={14} /> Salvar alterações</button>
        </div>
      </nav>

      <div className={styles.workspaceArea}>
        <aside className={styles.orchestratorSidebar}>
          <div className={styles.projectPanel}>
            <div className={styles.panelTitleRow}><span>PROJETOS</span><button type="button" onClick={() => setShowProjectModal(true)} title="Criar projeto"><PlusIcon size={15} /></button></div>
            <div className={styles.projectSelectWrap}>
              <select className={styles.projectSelect} value={activeProject.id} onChange={event => openProject(event.target.value)}>
                {projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
              </select>
              <ChevronDown size={14} />
            </div>
            <p className={styles.projectDescription}>{activeProject.description}</p>
            <div className={styles.projectMeta}><span>{activeProject.nodes.length} blocos</span><span>{activeProject.connections.length} conexões</span></div>
          </div>

          <div className={styles.channelPanel}>
            <div className={styles.panelTitleRow}><span>CANAIS DO FLUXO</span><Settings2 size={14} /></div>
            <p className={styles.panelHint}>Ative os canais que este projeto poderá usar.</p>
            <div className={styles.channelGrid}>
              {CHANNELS.map(channel => {
                const ChannelIcon = channel.icon;
                const active = activeProject.channels.includes(channel.id);
                return <button type="button" key={channel.id} className={`${styles.channelButton} ${active ? styles.channelButtonActive : ""}`} onClick={() => toggleChannel(channel.id)} style={{ "--channel-color": channel.color } as React.CSSProperties}><ChannelIcon size={15} /><span>{channel.label}</span>{active && <Check size={13} />}</button>;
              })}
            </div>
          </div>

          <div className={styles.libraryHeader}>
            <div className={styles.sidebarTitle}>BIBLIOTECA DE BLOCOS</div>
            {isSearchOpen && <input autoFocus className={styles.librarySearch} value={searchTerm} onChange={event => setSearchTerm(event.target.value)} placeholder="Buscar bloco..." />}
          </div>

          <div className={styles.libraryContainer}>
            {filteredLibrary.map(category => (
              <div key={category.category} className={styles.libCategory}>
                <div className={styles.categoryLabel}>{category.category}</div>
                <div className={styles.itemList}>
                  {category.items.map(item => {
                    const BlockIcon = item.icon;
                    return <button type="button" draggable className={styles.draggableBlock} key={item.type} onClick={() => addNode(item)} onDragStart={event => { event.dataTransfer.setData("application/x-vortice-node", item.type); setIsAdding(true); }} onDragEnd={() => setIsAdding(false)} title="Clique para adicionar ou arraste para o canvas">
                      <div className={styles.blockHeader} style={{ background: item.color }}><BlockIcon size={16} color="white" /></div>
                      <div className={styles.blockInfo}><span className={styles.blockLabel}>{item.label}</span><span className={styles.blockDesc}>{item.desc}</span></div>
                      <ArrowRight size={14} className={styles.blockArrow} />
                    </button>;
                  })}
                </div>
              </div>
            ))}
            {filteredLibrary.length === 0 && <div className={styles.emptyLibrary}>Nenhum bloco encontrado.</div>}
          </div>
          <div className={styles.sidebarHint}><MousePointer2 size={12} /> CLIQUE OU ARRASTE PARA ADICIONAR</div>
        </aside>

        <main className={styles.orchestrationStage} ref={canvasWrapperRef} onDragOver={event => { event.preventDefault(); setIsAdding(true); }} onDrop={handleCanvasDrop}>
          {isAdding && <div className={styles.dropZoneOverlay}>SOLTE O BLOCO AQUI PARA ADICIONAR AO FLUXO</div>}
          {connectingFrom && <div className={styles.connectionHint}>Selecione a entrada de outro bloco para conectar <button type="button" onClick={() => setConnectingFrom(null)}><X size={13} /></button></div>}

          <motion.div className={styles.infiniteCanvas} drag dragMomentum={false} onDrag={(event, info) => setCanvasOffset(previous => ({ x: previous.x + info.delta.x, y: previous.y + info.delta.y }))} onClick={() => { setSelectedNodeId(null); setConnectingFrom(null); }} style={{ x: canvasOffset.x, y: canvasOffset.y, scale: zoom }}>
            <svg className={styles.connectionsSvg} viewBox="0 0 1900 1200" preserveAspectRatio="none">
              {activeProject.connections.map(connection => {
                const fromNode = activeProject.nodes.find(node => node.id === connection.fromId);
                const toNode = activeProject.nodes.find(node => node.id === connection.toId);
                if (!fromNode || !toNode) return null;
                const start = getPortCoordinates(fromNode, "out", connection.fromPort);
                const end = getPortCoordinates(toNode, "in");
                const midX = start.x + (end.x - start.x) * 0.5;
                return <path key={connection.id} d={`M ${start.x} ${start.y} C ${midX} ${start.y}, ${midX} ${end.y}, ${end.x} ${end.y}`} className={styles.enterprisePath} />;
              })}
            </svg>

            {activeProject.nodes.map(node => {
              const NodeIcon = getNodeDefinition(node.type).icon;
              const nodeDefinition = getNodeDefinition(node.type);
              const isSelected = selectedNodeId === node.id;
              return <motion.div key={node.id} className={`${styles.precisionNode} ${isSelected ? styles.precisionNodeSelected : ""}`} drag dragMomentum={false} onClick={event => { event.stopPropagation(); setSelectedNodeId(node.id); }} onDrag={(event, info) => updateNode(node.id, { x: node.x + info.delta.x / zoom, y: node.y + info.delta.y / zoom })} style={{ x: node.x, y: node.y }}>
                <div className={styles.nodeTop} style={{ borderTop: `4px solid ${nodeDefinition.color}` }}>
                  <div className={styles.nodeIconBox}><NodeIcon size={19} color={nodeDefinition.color} /></div>
                  <div className={styles.nodeIdentity}><span className={styles.nodeTitle}>{node.label}</span><span className={styles.nodeType}>{node.category}</span></div>
                  <button type="button" className={styles.nodeExtra} onClick={event => { event.stopPropagation(); setSelectedNodeId(node.id); }} title="Configurar bloco"><MoreVertical size={16} /></button>
                </div>
                <div className={styles.nodeContent}><p>{node.content || "Configure este bloco no painel lateral."}</p>{node.config.channel && <span className={styles.nodeChannel}>{channelLabel(node.config.channel)}</span>}</div>
                <button type="button" className={`${styles.nodePort} ${styles.pIn}`} onClick={event => handlePortClick(event, node.id, "in")} aria-label={`Entrada de ${node.label}`} />
                {node.type === "condition" ? <div className={styles.branchPorts}><button type="button" className={`${styles.nodePort} ${styles.branchPortYes}`} onClick={event => handlePortClick(event, node.id, "out", "yes")} aria-label="Saída Sim">S</button><button type="button" className={`${styles.nodePort} ${styles.branchPortNo}`} onClick={event => handlePortClick(event, node.id, "out", "no")} aria-label="Saída Não">N</button></div> : <button type="button" className={`${styles.nodePort} ${styles.pOut}`} onClick={event => handlePortClick(event, node.id, "out")} aria-label={`Saída de ${node.label}`} />}
              </motion.div>;
            })}
          </motion.div>

          <div className={styles.stageOverlays}>
            <div className={styles.minimapBox}><div className={styles.minimapHeader}><span>MAPA DO FLUXO</span><LayoutGrid size={12} /></div><div className={styles.miniOverview}>{activeProject.nodes.map(node => <div key={node.id} className={`${styles.miniDot} ${selectedNodeId === node.id ? styles.miniDotSelected : ""}`} style={{ left: `${Math.min(92, Math.max(4, node.x / 18))}%`, top: `${Math.min(88, Math.max(8, node.y / 14))}%` }} />)}</div></div>
            <div className={styles.zoomControls}><button type="button" onClick={() => setZoom(previous => Math.min(previous + 0.1, 1.4))}>+</button><span className={styles.zoomLevel}>{Math.round(zoom * 100)}%</span><button type="button" onClick={() => setZoom(previous => Math.max(previous - 0.1, 0.4))}>−</button><button type="button" onClick={fitCanvas} title="Ajustar canvas"><Maximize2 size={14} /></button></div>
          </div>
        </main>

        <aside className={styles.inspector}>
          <div className={styles.inspectorHeader}><div><span className={styles.inspectorEyebrow}>CONFIGURAÇÃO</span><h2>{selectedNode ? selectedNode.label : "Projeto"}</h2></div>{selectedNode && <button type="button" className={styles.closeInspectorBtn} onClick={() => setSelectedNodeId(null)}><X size={16} /></button>}</div>
          {selectedNode ? <div className={styles.inspectorBody}>{renderNodeConfiguration()}</div> : <div className={styles.projectInspectorEmpty}><Settings2 size={28} /><h3>Selecione um bloco</h3><p>Escolha um bloco no canvas para configurar mensagens, condições, esperas e ações do CRM.</p><div className={styles.inspectorTip}><ShieldCheck size={15} /> Fluxos são salvos automaticamente neste navegador.</div></div>}

          <div className={styles.variablesPanel}>
            <div className={styles.inspectorSubheading}><span>VARIÁVEIS DO PROJETO</span><span className={styles.variableCount}>{activeProject.variables.length}</span></div>
            <p className={styles.panelHint}>Use variáveis em mensagens e condições.</p>
            <div className={styles.variablesList}>{activeProject.variables.map(variable => <div key={variable.id} className={styles.variableItem}><input value={variable.name} onChange={event => updateActiveProject(project => ({ ...project, variables: project.variables.map(item => item.id === variable.id ? { ...item, name: event.target.value } : item) }))} /><input value={variable.value} onChange={event => updateActiveProject(project => ({ ...project, variables: project.variables.map(item => item.id === variable.id ? { ...item, value: event.target.value } : item) }))} /><button type="button" onClick={() => updateActiveProject(project => ({ ...project, variables: project.variables.filter(item => item.id !== variable.id) }))} aria-label="Excluir variável"><Trash2 size={13} /></button></div>)}</div>
            <form className={styles.addVariableForm} onSubmit={addVariable}><input required value={newVariableName} onChange={event => setNewVariableName(event.target.value)} placeholder="nome_variavel" aria-label="Nome da nova variável" /><input value={newVariableValue} onChange={event => setNewVariableValue(event.target.value)} placeholder="valor padrão" aria-label="Valor padrão da nova variável" /><button type="submit" title="Adicionar variável"><PlusIcon size={15} /></button></form>
          </div>
          <button type="button" className={styles.deleteProjectBtn} onClick={deleteProject}><Trash2 size={14} /> Excluir projeto</button>
        </aside>
      </div>

      {notice && <div className={styles.notice}><Check size={15} /> {notice}</div>}

      {renderProjectModal()}

      {showHelpModal && <div className={styles.modalOverlay} onClick={() => setShowHelpModal(false)}><div className={`${styles.modal} ${styles.helpModal}`} onClick={event => event.stopPropagation()}><div className={styles.modalHeader}><div><span className={styles.inspectorEyebrow}>GUIA RÁPIDO</span><h2>Como montar um fluxo</h2></div><button type="button" className={styles.closeModalBtn} onClick={() => setShowHelpModal(false)}><X size={18} /></button></div><div className={styles.helpSteps}><div><b>1</b><p>Ative os canais que o projeto poderá usar.</p></div><div><b>2</b><p>Clique em um bloco da biblioteca ou arraste-o para o canvas.</p></div><div><b>3</b><p>Selecione um bloco e configure seus campos no inspector.</p></div><div><b>4</b><p>Clique em uma saída e depois na entrada de outro bloco para criar conexões.</p></div><div><b>5</b><p>Use “Testar fluxo” para conferir a sequência antes de ativar.</p></div></div></div></div>}

      {showTestModal && <div className={styles.modalOverlay} onClick={() => setShowTestModal(false)}><div className={`${styles.modal} ${styles.testModal}`} onClick={event => event.stopPropagation()}><div className={styles.modalHeader}><div><span className={styles.inspectorEyebrow}>SIMULADOR</span><h2>Testar automação</h2></div><button type="button" className={styles.closeModalBtn} onClick={() => setShowTestModal(false)}><X size={18} /></button></div><div className={styles.modalBody}><p className={styles.modalDescription}>A simulação percorre o fluxo a partir do primeiro gatilho. Informe uma mensagem para seguir pelo caminho “Sim” de uma condição.</p><label>Mensagem de teste<input className={styles.inspectorInput} value={testInput} onChange={event => setTestInput(event.target.value)} placeholder="Digite algo para simular uma entrada" /></label><div className={styles.testChannels}><span>Canais ativos</span>{activeProject.channels.length ? activeProject.channels.map(channel => <span key={channel} className={styles.testChannel}>{channelLabel(channel)}</span>) : <small>Nenhum canal ativado</small>}</div><button type="button" className={styles.runTestBtn} onClick={runTest}><Play size={15} /> Executar teste</button>{testTrace.length > 0 && <div className={styles.testTrace}><div className={styles.inspectorSubheading}>SEQUÊNCIA PREVISTA</div>{testTrace.map((node, index) => <div className={styles.traceItem} key={`${node.id}-${index}`}><span>{index + 1}</span><div><strong>{node.label}</strong><small>{node.content}</small></div>{index < testTrace.length - 1 && <ArrowRight size={14} />}</div>)}</div>}</div></div></div>}
    </div>
  );
}
