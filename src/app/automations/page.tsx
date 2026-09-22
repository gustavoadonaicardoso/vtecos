"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  LayoutGrid,
  Maximize2,
  Monitor,
  MoreVertical,
  Plus as PlusIcon,
  Power,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  HelpCircle as QuestionIcon,
  Trash2,
  X,
} from "lucide-react";
import styles from "./automations.module.css";
import { NODE_LIBRARY, channelLabel, getNodeDefinition } from "./constants";
import { createDefaultProject, createNode, makeId, readProjects } from "./utils";
import type { AutomationNode, AutomationProject, ChannelId, Connection, NodeConfig, NodeDefinition, NodeType, PortName } from "./types";
import ProjectHub from "./components/ProjectHub";
import ProjectModal from "./components/ProjectModal";
import HelpModal from "./components/HelpModal";
import TestModal from "./components/TestModal";
import NodeInspector from "./components/NodeInspector";
import ChannelsPanel from "./components/ChannelsPanel";
import BlockLibrary from "./components/BlockLibrary";

const STORAGE_KEY = "vortice_automation_projects";

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

  if (!hydrated) {
    return <div className={styles.orchestratorContainer}><div className={styles.loadingState}>Carregando automações...</div></div>;
  }

  if (showProjectHub || !activeProject) {
    return (
      <>
        <ProjectHub projects={projects} onOpenProject={openProject} onNewProject={() => setShowProjectModal(true)} />
        <ProjectModal
          show={showProjectModal}
          name={newProjectName}
          description={newProjectDescription}
          onNameChange={setNewProjectName}
          onDescriptionChange={setNewProjectDescription}
          onSubmit={createProject}
          onClose={() => setShowProjectModal(false)}
        />
      </>
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

          <ChannelsPanel activeChannels={activeProject.channels} onToggleChannel={toggleChannel} />

          <BlockLibrary
            filteredLibrary={filteredLibrary}
            isSearchOpen={isSearchOpen}
            searchTerm={searchTerm}
            onSearchTermChange={setSearchTerm}
            onAddNode={addNode}
            onDragStart={() => setIsAdding(true)}
            onDragEnd={() => setIsAdding(false)}
          />
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
          {selectedNode ? (
            <div className={styles.inspectorBody}>
              <NodeInspector
                selectedNode={selectedNode}
                activeProject={activeProject}
                updateNode={updateNode}
                updateNodeConfig={updateNodeConfig}
                insertVariable={insertVariable}
                deleteConnection={deleteConnection}
                deleteNode={deleteNode}
              />
            </div>
          ) : (
            <div className={styles.projectInspectorEmpty}><Settings2 size={28} /><h3>Selecione um bloco</h3><p>Escolha um bloco no canvas para configurar mensagens, condições, esperas e ações do CRM.</p><div className={styles.inspectorTip}><ShieldCheck size={15} /> Fluxos são salvos automaticamente neste navegador.</div></div>
          )}

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

      <ProjectModal
        show={showProjectModal}
        name={newProjectName}
        description={newProjectDescription}
        onNameChange={setNewProjectName}
        onDescriptionChange={setNewProjectDescription}
        onSubmit={createProject}
        onClose={() => setShowProjectModal(false)}
      />

      {showHelpModal && <HelpModal onClose={() => setShowHelpModal(false)} />}

      {showTestModal && (
        <TestModal
          activeProject={activeProject}
          testInput={testInput}
          onTestInputChange={setTestInput}
          testTrace={testTrace}
          onRunTest={runTest}
          onClose={() => setShowTestModal(false)}
        />
      )}
    </div>
  );
}
