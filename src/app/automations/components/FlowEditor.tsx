'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  History,
  Loader2,
  Maximize2,
  Minus,
  Pause,
  Play,
  Plus,
  Power,
  Search,
  Send,
  X,
} from 'lucide-react';
import styles from '../automations.module.css';
import {
  isTrigger,
  portsFor,
  SENDS_WHATSAPP,
  USES_AI,
  validateFlow,
  type FlowConnection,
  type FlowGraph,
  type FlowNode,
  type NodeConfig,
  type NodeType,
  type PortName,
} from '@/lib/automations/flow';
import { BLOCK_GROUPS, BLOCKS, describeNode, makeNode, newId, type EditorOptions } from '../library';
import Inspector from './Inspector';
import Simulator from './Simulator';
import RunsPanel from './RunsPanel';
import RunForLeads from './RunForLeads';

export interface FlowDetail {
  id: string;
  name: string;
  description: string;
  status: 'draft' | 'active' | 'paused';
  updated_at: string;
  graph: FlowGraph;
  webhook_token?: string | null;
}

interface FlowEditorProps {
  flow: FlowDetail;
  options: EditorOptions | null;
  canEdit: boolean;
  onBack: () => void;
  onChanged: (flow: FlowDetail) => void;
}

const NODE_W = 260;
const NODE_H = 124;
/** Blocos com várias saídas: uma linha por saída, abaixo do resumo. */
const PORT_TOP = 104;
const PORT_STEP = 26;

type SaveState = 'saved' | 'pending' | 'saving' | 'error';

/** Saídas do bloco com a altura de cada uma e a altura total do bloco. */
function layoutOf(node: FlowNode) {
  const ports = portsFor(node);
  const single = ports.length <= 1 && !ports[0]?.label;
  return {
    ports: ports.map((port, index) => ({ ...port, y: single ? 38 : PORT_TOP + index * PORT_STEP })),
    single,
    height: single ? NODE_H : PORT_TOP + (ports.length - 1) * PORT_STEP + 24,
  };
}

function portPoint(node: FlowNode, side: 'in' | 'out', port: PortName = 'default') {
  if (side === 'in') return { x: node.x, y: node.y + 38 };
  const found = layoutOf(node).ports.find((item) => item.id === port);
  return { x: node.x + NODE_W, y: node.y + (found?.y ?? 38) };
}

function curve(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = Math.max(60, Math.abs(b.x - a.x) * 0.5);
  return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
}

export default function FlowEditor({ flow, options, canEdit, onBack, onChanged }: FlowEditorProps) {
  const [graph, setGraph] = useState<FlowGraph>(flow.graph);
  const [name, setName] = useState(flow.name);
  const [status, setStatus] = useState(flow.status);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedConnection, setSelectedConnection] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<{ nodeId: string; port: PortName } | null>(null);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const [pan, setPan] = useState({ x: 40, y: 40 });
  const [zoom, setZoom] = useState(0.9);
  const [panel, setPanel] = useState<'library' | 'runs' | null>(() => (canEdit && typeof window !== 'undefined' && window.innerWidth > 768 ? 'library' : null));
  const [showProblems, setShowProblems] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [notice, setNotice] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [serverProblems, setServerProblems] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [webhookToken, setWebhookToken] = useState<string | null>(flow.webhook_token || null);
  const [runningForLeads, setRunningForLeads] = useState(false);

  const stageRef = useRef<HTMLDivElement>(null);
  const dirty = useRef(false);
  const latest = useRef({ graph, name });
  latest.current = { graph, name };

  const problems = useMemo(() => validateFlow(graph), [graph]);
  const selectedNode = graph.nodes.find((node) => node.id === selected) || null;

  // ── Salvamento automático ──
  const save = useCallback(async () => {
    if (!dirty.current) return;
    dirty.current = false;
    setSaveState('saving');
    try {
      const response = await fetch(`/api/automations/${flow.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ graph: latest.current.graph, name: latest.current.name }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || 'Não foi possível salvar.');
      setSaveState(dirty.current ? 'pending' : 'saved');
      if (json.data?.webhook_token !== undefined) setWebhookToken(json.data.webhook_token);
      if (json.paused) {
        setStatus('paused');
        setNotice({ type: 'error', text: 'O fluxo foi pausado porque ficou com problemas. Corrija e ative de novo.' });
      }
      onChanged(json.data);
    } catch (error) {
      dirty.current = true;
      setSaveState('error');
      setNotice({ type: 'error', text: error instanceof Error ? error.message : 'Não foi possível salvar.' });
    }
  }, [flow.id, onChanged]);

  useEffect(() => {
    if (saveState !== 'pending') return;
    const timer = window.setTimeout(save, 1200);
    return () => window.clearTimeout(timer);
  }, [saveState, graph, name, save]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty.current) event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const change = (updater: (current: FlowGraph) => FlowGraph) => {
    if (!canEdit) return;
    setGraph((current) => updater(current));
    dirty.current = true;
    setSaveState('pending');
  };

  const updateNode = (id: string, changes: Partial<FlowNode>) =>
    change((current) => ({ ...current, nodes: current.nodes.map((node) => (node.id === id ? { ...node, ...changes } : node)) }));

  // Saída que deixou de existir (opção removida, tipo de resposta trocado...) perde a ligação.
  const updateConfig = (id: string, config: NodeConfig) =>
    change((current) => {
      const nodes = current.nodes.map((node) => (node.id === id ? { ...node, config: { ...node.config, ...config } } : node));
      const changed = nodes.find((node) => node.id === id);
      const ports = new Set(changed ? portsFor(changed).map((port) => port.id) : []);
      return { ...current, nodes, connections: current.connections.filter((connection) => connection.fromId !== id || ports.has(connection.fromPort)) };
    });

  const removeNode = (id: string) => {
    change((current) => ({
      ...current,
      nodes: current.nodes.filter((node) => node.id !== id),
      connections: current.connections.filter((connection) => connection.fromId !== id && connection.toId !== id),
    }));
    setSelected(null);
  };

  const removeConnection = (id: string) => {
    change((current) => ({ ...current, connections: current.connections.filter((connection) => connection.id !== id) }));
    setSelectedConnection(null);
  };

  const connect = (from: { nodeId: string; port: PortName }, toId: string) => {
    if (from.nodeId === toId) return;
    const target = graph.nodes.find((node) => node.id === toId);
    if (!target || isTrigger(target.type)) {
      setNotice({ type: 'error', text: 'O gatilho é sempre o começo do fluxo: ligue a outro bloco.' });
      return;
    }
    // Cada saída leva a um só bloco (é o caminho que o motor segue).
    change((current) => ({
      ...current,
      connections: [
        ...current.connections.filter((connection) => !(connection.fromId === from.nodeId && connection.fromPort === from.port)),
        { id: newId('c'), fromId: from.nodeId, toId, fromPort: from.port } satisfies FlowConnection,
      ],
    }));
  };

  // ── Visão (pan/zoom) ──
  const toWorld = (clientX: number, clientY: number) => {
    const rect = stageRef.current?.getBoundingClientRect();
    return { x: (clientX - (rect?.left || 0) - pan.x) / zoom, y: (clientY - (rect?.top || 0) - pan.y) / zoom };
  };

  // minZoom: ao abrir, não deixa o texto pequeno demais (começa pelo gatilho).
  const fit = useCallback((minZoom = 0.35) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect || graph.nodes.length === 0) return;
    const minX = Math.min(...graph.nodes.map((node) => node.x));
    const minY = Math.min(...graph.nodes.map((node) => node.y));
    const maxX = Math.max(...graph.nodes.map((node) => node.x + NODE_W));
    const maxY = Math.max(...graph.nodes.map((node) => node.y + layoutOf(node).height));
    const fitZoom = Math.min(1.1, Math.max(0.35, Math.min((rect.width - 80) / (maxX - minX), (rect.height - 80) / (maxY - minY))));
    const nextZoom = Math.max(fitZoom, minZoom);
    setZoom(nextZoom);
    const width = (maxX - minX) * nextZoom;
    const height = (maxY - minY) * nextZoom;
    setPan({
      x: (width > rect.width - 80 ? 40 : (rect.width - width) / 2) - minX * nextZoom,
      y: (height > rect.height - 80 ? 40 : (rect.height - height) / 2) - minY * nextZoom,
    });
  }, [graph.nodes]);

  // Enquadra o fluxo ao abrir.
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current) return;
    fitted.current = true;
    const frame = requestAnimationFrame(() => fit(window.innerWidth < 768 ? 0.6 : 0.8));
    return () => cancelAnimationFrame(frame);
  }, [fit]);

  const zoomBy = (delta: number) => {
    const rect = stageRef.current?.getBoundingClientRect();
    const cx = (rect?.width || 0) / 2;
    const cy = (rect?.height || 0) / 2;
    setZoom((current) => {
      const next = Math.min(1.6, Math.max(0.3, current + delta));
      setPan((p) => ({ x: cx - ((cx - p.x) / current) * next, y: cy - ((cy - p.y) / current) * next }));
      return next;
    });
  };

  // Arrastar o fundo move a visão; arrastar o bloco move o bloco.
  const drag = useRef<{ kind: 'pan' | 'node'; id?: string; startX: number; startY: number; originX: number; originY: number; moved: boolean } | null>(null);

  const onStagePointerDown = (event: React.PointerEvent) => {
    if ((event.target as HTMLElement).closest('[data-node],[data-control]')) return;
    drag.current = { kind: 'pan', startX: event.clientX, startY: event.clientY, originX: pan.x, originY: pan.y, moved: false };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  const onNodePointerDown = (event: React.PointerEvent, node: FlowNode) => {
    if ((event.target as HTMLElement).closest('button')) return;
    event.stopPropagation();
    drag.current = { kind: 'node', id: node.id, startX: event.clientX, startY: event.clientY, originX: node.x, originY: node.y, moved: false };
    stageRef.current?.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (connecting) setPointer(toWorld(event.clientX, event.clientY));
    const current = drag.current;
    if (!current) return;
    const dx = event.clientX - current.startX;
    const dy = event.clientY - current.startY;
    if (!current.moved && Math.hypot(dx, dy) < 4) return;
    current.moved = true;
    if (current.kind === 'pan') setPan({ x: current.originX + dx, y: current.originY + dy });
    else if (current.id && canEdit) {
      const id = current.id;
      setGraph((g) => ({ ...g, nodes: g.nodes.map((node) => (node.id === id ? { ...node, x: Math.round(current.originX + dx / zoom), y: Math.round(current.originY + dy / zoom) } : node)) }));
    }
  };

  const onPointerUp = () => {
    const current = drag.current;
    drag.current = null;
    if (!current) return;
    if (current.kind === 'node' && current.id) {
      if (current.moved && canEdit) {
        dirty.current = true;
        setSaveState('pending');
      } else {
        setSelected(current.id);
        setSelectedConnection(null);
        setPanel(null);
      }
    } else if (!current.moved) {
      setSelected(null);
      setSelectedConnection(null);
      setConnecting(null);
    }
  };

  const onWheel = (event: React.WheelEvent) => {
    if (event.ctrlKey || event.metaKey) {
      zoomBy(event.deltaY > 0 ? -0.08 : 0.08);
    } else {
      setPan((p) => ({ x: p.x - event.deltaX, y: p.y - event.deltaY }));
    }
  };

  // Delete/Backspace remove o bloco ou a ligação selecionada.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || !canEdit) return;
      if (event.key === 'Escape') {
        setConnecting(null);
        setSelectedConnection(null);
      }
      if (event.key !== 'Delete' && event.key !== 'Backspace') return;
      if (selectedConnection) removeConnection(selectedConnection);
      else if (selected) removeNode(selected);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ── Adicionar bloco ──
  const addBlock = (type: NodeType) => {
    if (!canEdit) return;
    if (isTrigger(type) && graph.nodes.some((node) => isTrigger(node.type))) {
      setNotice({ type: 'error', text: 'O fluxo já tem um gatilho. Para trocar, remova o atual primeiro.' });
      return;
    }
    const anchor = selectedNode || [...graph.nodes].sort((a, b) => b.x - a.x)[0];
    const x = anchor ? anchor.x + NODE_W + 80 : 80;
    const y = anchor ? anchor.y : 160;
    const node = makeNode(type, x, y);
    // Liga automaticamente ao bloco de onde partiu, na primeira saída livre dele.
    const fromPort: PortName | undefined = anchor ? portsFor(anchor).map((port) => port.id).find((port) => !graph.connections.some((connection) => connection.fromId === anchor.id && connection.fromPort === port)) : undefined;
    const autoConnect = anchor && fromPort && !isTrigger(type);
    change((current) => ({
      ...current,
      nodes: [...current.nodes, node],
      connections: autoConnect ? [...current.connections, { id: newId('c'), fromId: anchor!.id, toId: node.id, fromPort: fromPort! }] : current.connections,
    }));
    setSelected(node.id);
    setPanel(null);
    // Traz o bloco novo para a vista.
    const rect = stageRef.current?.getBoundingClientRect();
    if (rect) setPan({ x: rect.width / 2 - (x + NODE_W / 2) * zoom, y: rect.height / 2 - (y + NODE_H / 2) * zoom });
  };

  // ── Ativar / pausar ──
  const toggleActive = async () => {
    if (status === 'active' && !confirm('Pausar o fluxo? Execuções que estavam esperando (tempo ou resposta) são canceladas.')) return;
    setBusy(true);
    if (dirty.current) await save();
    try {
      const response = await fetch(`/api/automations/${flow.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: status === 'active' ? 'paused' : 'active' }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        setServerProblems(json.problems || []);
        setShowProblems(true);
        throw new Error(json.error || 'Não foi possível mudar o status.');
      }
      setStatus(json.data.status);
      setServerProblems([]);
      onChanged(json.data);
      setNotice({ type: 'ok', text: json.data.status === 'active' ? 'Fluxo ativo: ele já roda quando o gatilho acontecer.' : 'Fluxo pausado.' });
    } catch (error) {
      setNotice({ type: 'error', text: error instanceof Error ? error.message : 'Erro.' });
    } finally {
      setBusy(false);
    }
  };

  const noWhatsApp = options && !options.whatsapp.web && !options.whatsapp.api && graph.nodes.some((node) => SENDS_WHATSAPP.includes(node.type));
  const noAi = options && !options.ai && graph.nodes.some((node) => USES_AI.includes(node.type));
  const needsScheduler = options && !options.scheduler && graph.nodes.some((node) => ['delay', 'trigger-inactive', 'trigger-schedule', 'question', 'menu', 'wait-reply'].includes(node.type));

  const regenerateToken = async () => {
    if (webhookToken && !confirm('Gerar um endereço novo? O endereço atual para de funcionar na hora.')) return;
    if (dirty.current) await save();
    const response = await fetch(`/api/automations/${flow.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ regenerateToken: true }) });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      setNotice({ type: 'error', text: json.error || 'Não foi possível gerar o endereço.' });
      return;
    }
    setWebhookToken(json.data.webhook_token || null);
    setNotice({ type: 'ok', text: 'Endereço novo gerado.' });
  };
  const allProblems = problems.errors.length ? problems.errors : serverProblems;
  const filteredGroups = BLOCK_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => `${item.description} ${item.type}`.toLowerCase().includes(search.trim().toLowerCase())),
  })).filter((group) => group.items.length > 0);

  const tempPath = connecting && pointer ? (() => {
    const from = graph.nodes.find((node) => node.id === connecting.nodeId);
    return from ? curve(portPoint(from, 'out', connecting.port), pointer) : null;
  })() : null;

  return (
    <div className={styles.editor}>
      {/* ── Topo ── */}
      <header className={styles.editorHead}>
        <button type="button" className={styles.ghostBtn} onClick={async () => { if (dirty.current) await save(); onBack(); }}>
          <ArrowLeft size={16} /> <span className={styles.hideSm}>Fluxos</span>
        </button>
        <span className={`${styles.status} ${styles[`status_${status}`]}`}>{status === 'active' ? 'Ativo' : status === 'paused' ? 'Pausado' : 'Rascunho'}</span>
        <input className={styles.nameInput} value={name} maxLength={80} disabled={!canEdit} aria-label="Nome do fluxo"
          onChange={(e) => { setName(e.target.value); dirty.current = true; setSaveState('pending'); }} />
        <span className={styles.saveState}>
          {saveState === 'saving' || saveState === 'pending' ? <><Loader2 size={13} className={styles.spin} /> Salvando</> : saveState === 'error' ? <><AlertTriangle size={13} /> Não salvo</> : <><CheckCircle2 size={13} /> Salvo</>}
        </span>
        <div className={styles.headActions}>
          <button type="button" className={`${styles.problemsBtn} ${allProblems.length ? styles.problemsBad : ''}`} aria-label={allProblems.length ? `${allProblems.length} problema(s)` : 'Pronto para ativar'} onClick={() => setShowProblems((value) => !value)}>
            {allProblems.length ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}
            {allProblems.length ? <span>{allProblems.length}<span className={styles.hideSm}> problema(s)</span></span> : <span className={styles.hideSm}>Pronto para ativar</span>}
          </button>
          <button type="button" className={styles.secondaryBtn} onClick={() => setSimulating(true)}><Play size={15} /> <span className={styles.hideSm}>Simular</span></button>
          {canEdit && (
            <button type="button" className={styles.secondaryBtn} onClick={() => setRunningForLeads(true)} title="Rodar este fluxo agora para leads escolhidos">
              <Send size={15} /> <span className={styles.hideSm}>Rodar</span>
            </button>
          )}
          <button type="button" className={`${styles.secondaryBtn} ${panel === 'runs' ? styles.btnOn : ''}`} onClick={() => { setPanel(panel === 'runs' ? null : 'runs'); setSelected(null); }}>
            <History size={15} /> <span className={styles.hideSm}>Execuções</span>
          </button>
          {canEdit && (
            <button type="button" className={status === 'active' ? styles.secondaryBtn : styles.primaryBtn} onClick={toggleActive} disabled={busy}>
              {busy ? <Loader2 size={15} className={styles.spin} /> : status === 'active' ? <Pause size={15} /> : <Power size={15} />}
              {status === 'active' ? 'Pausar' : 'Ativar'}
            </button>
          )}
        </div>
      </header>

      {noWhatsApp && (
        <div className={styles.banner}>
          <AlertTriangle size={15} /> Nenhum WhatsApp conectado: os blocos de mensagem vão falhar. <Link href="/integrations">Conectar em Integrações</Link>
        </div>
      )}
      {noAi && (
        <div className={styles.banner}>
          <AlertTriangle size={15} /> <span>A IA não está configurada no servidor (falta a chave <code>GEMINI_API_KEY</code>): os blocos de IA vão seguir pela saída &quot;Erro&quot;.</span>
        </div>
      )}
      {needsScheduler && (
        <div className={styles.banner}>
          <AlertTriangle size={15} /> <span>O agendador está desligado neste servidor (<code>CONTENT_SCHEDULER_ENABLED</code>): esperas, prazos de resposta e gatilhos de tempo só andam com ele ligado.</span>
        </div>
      )}
      {!canEdit && <div className={styles.banner}>Você pode ver o fluxo e as execuções. Só administradores e gerentes editam.</div>}

      {showProblems && (
        <div className={styles.problemsBox}>
          <div className={styles.problemsHead}>
            <strong>{allProblems.length ? 'Corrija antes de ativar' : 'Nenhum problema encontrado'}</strong>
            <button type="button" className={styles.iconBtn} onClick={() => setShowProblems(false)} aria-label="Fechar"><X size={14} /></button>
          </div>
          <ul>
            {allProblems.map((item) => <li key={item} className={styles.problemError}>{item}</li>)}
            {problems.warnings.map((item) => <li key={item} className={styles.problemWarn}>{item}</li>)}
          </ul>
        </div>
      )}

      <div className={styles.workspace}>
        {/* ── Biblioteca ── */}
        {panel === 'library' && canEdit && (
          <aside className={styles.library} aria-label="Blocos">
            <div className={styles.inspectorHead}>
              <div><small>Clique para adicionar</small><strong>Blocos</strong></div>
              <button type="button" className={styles.iconBtn} onClick={() => setPanel(null)} aria-label="Fechar"><X size={16} /></button>
            </div>
            <label className={styles.searchBox}><Search size={14} /><input placeholder="Buscar bloco" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
            {filteredGroups.map((group) => (
              <div key={group.title} className={styles.libraryGroup}>
                <span className={styles.sectionLabel}>{group.title}</span>
                {group.items.map((item) => (
                  <button key={item.type} type="button" className={styles.libraryItem} onClick={() => addBlock(item.type)}>
                    <span className={styles.blockIcon} style={{ color: item.color, background: `${item.color}1f` }}><item.icon size={16} /></span>
                    <span>
                      <strong>{makeNode(item.type, 0, 0).label}</strong>
                      <small>{item.description}</small>
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </aside>
        )}

        {/* ── Canvas ── */}
        <div
          ref={stageRef}
          className={`${styles.stage} ${connecting ? styles.stageConnecting : ''}`}
          onPointerDown={onStagePointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onWheel={onWheel}
        >
          <div className={styles.world} style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
            <svg
              className={styles.wires}
              width={Math.max(0, ...graph.nodes.map((node) => node.x + NODE_W)) + 400}
              height={Math.max(0, ...graph.nodes.map((node) => node.y + layoutOf(node).height)) + 400}
            >
              {graph.connections.map((connection) => {
                const from = graph.nodes.find((node) => node.id === connection.fromId);
                const to = graph.nodes.find((node) => node.id === connection.toId);
                if (!from || !to) return null;
                const path = curve(portPoint(from, 'out', connection.fromPort), portPoint(to, 'in'));
                const tone = connection.fromPort === 'yes' ? styles.wireYes : connection.fromPort === 'no' ? styles.wireNo : '';
                return (
                  <g key={connection.id}>
                    <path d={path} className={styles.wireHit} data-control onPointerDown={(e) => { e.stopPropagation(); setSelectedConnection(connection.id); setSelected(null); }} />
                    <path d={path} className={`${styles.wire} ${tone} ${selectedConnection === connection.id ? styles.wireSelected : ''}`} />
                  </g>
                );
              })}
              {tempPath && <path d={tempPath} className={`${styles.wire} ${styles.wireTemp}`} />}
            </svg>

            {selectedConnection && canEdit && (() => {
              const connection = graph.connections.find((item) => item.id === selectedConnection);
              const from = graph.nodes.find((node) => node.id === connection?.fromId);
              const to = graph.nodes.find((node) => node.id === connection?.toId);
              if (!connection || !from || !to) return null;
              const a = portPoint(from, 'out', connection.fromPort);
              const b = portPoint(to, 'in');
              return (
                <button type="button" data-control className={styles.wireDelete} style={{ left: (a.x + b.x) / 2 - 14, top: (a.y + b.y) / 2 - 14 }} onClick={() => removeConnection(connection.id)} aria-label="Remover ligação">
                  <X size={14} />
                </button>
              );
            })()}

            {graph.nodes.map((node) => {
              const block = BLOCKS[node.type];
              const layout = layoutOf(node);
              return (
                <div
                  key={node.id}
                  data-node
                  className={`${styles.node} ${selected === node.id ? styles.nodeSelected : ''} ${connecting && connecting.nodeId !== node.id && !isTrigger(node.type) ? styles.nodeTarget : ''}`}
                  style={{ left: node.x, top: node.y, width: NODE_W, height: layout.height, borderTopColor: block.color }}
                  onPointerDown={(e) => onNodePointerDown(e, node)}
                  onClick={() => {
                    if (connecting) {
                      connect(connecting, node.id);
                      setConnecting(null);
                    }
                  }}
                >
                  <div className={styles.nodeHead}>
                    <span className={styles.blockIcon} style={{ color: block.color, background: `${block.color}1f` }}><block.icon size={16} /></span>
                    <div>
                      <strong>{node.label}</strong>
                      <small>{isTrigger(node.type) ? 'Gatilho' : block.description}</small>
                    </div>
                  </div>
                  <p className={`${styles.nodeText} ${layout.single ? '' : styles.nodeTextShort}`}>{describeNode(node, options)}</p>

                  {!isTrigger(node.type) && (
                    <button type="button" className={`${styles.port} ${styles.portIn}`} style={{ top: 38 - 8 }} aria-label={`Entrada de ${node.label}`}
                      onClick={(e) => { e.stopPropagation(); if (connecting) { connect(connecting, node.id); setConnecting(null); } }} />
                  )}
                  {layout.ports.map((port) => (
                    <React.Fragment key={port.id}>
                      {!layout.single && <span className={styles.portRow} style={{ top: port.y - 11 }} title={port.label}>{port.label}</span>}
                      <button
                        type="button"
                        className={`${styles.port} ${styles.portOut} ${port.tone === 'yes' ? styles.portYes : port.tone === 'no' ? styles.portNo : port.tone === 'option' ? styles.portOption : ''} ${connecting?.nodeId === node.id && connecting.port === port.id ? styles.portActive : ''}`}
                        style={{ top: port.y - 8 }}
                        aria-label={`Saída ${port.label} de ${node.label}`}
                        disabled={!canEdit}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedConnection(null);
                          setConnecting(connecting?.nodeId === node.id && connecting.port === port.id ? null : { nodeId: node.id, port: port.id });
                          setPointer(null);
                        }}
                      />
                    </React.Fragment>
                  ))}
                </div>
              );
            })}
          </div>

          {connecting && (
            <div className={styles.hint} data-control>
              Agora clique no bloco de destino <button type="button" onClick={() => setConnecting(null)}>Cancelar</button>
            </div>
          )}

          {graph.nodes.length === 0 && canEdit && (
            <div className={styles.emptyCanvas} data-control>
              <p>Comece adicionando um gatilho.</p>
              <button type="button" className={styles.primaryBtn} onClick={() => setPanel('library')}><Plus size={15} /> Adicionar bloco</button>
            </div>
          )}

          <div className={styles.canvasTools} data-control>
            {canEdit && panel !== 'library' && (
              <button type="button" className={styles.primaryBtn} onClick={() => { setPanel('library'); setSelected(null); }}><Plus size={15} /> Bloco</button>
            )}
            <div className={styles.zoom}>
              <button type="button" onClick={() => zoomBy(-0.1)} aria-label="Diminuir zoom"><Minus size={14} /></button>
              <span>{Math.round(zoom * 100)}%</span>
              <button type="button" onClick={() => zoomBy(0.1)} aria-label="Aumentar zoom"><Plus size={14} /></button>
              <button type="button" onClick={() => fit()} aria-label="Enquadrar o fluxo"><Maximize2 size={14} /></button>
            </div>
          </div>
        </div>

        {/* ── Painel direito ── */}
        {selectedNode && (
          <Inspector
            node={selectedNode}
            graph={graph}
            options={options}
            readOnly={!canEdit}
            flowId={flow.id}
            webhookToken={webhookToken}
            onRegenerateToken={regenerateToken}
            onLabel={(label) => updateNode(selectedNode.id, { label })}
            onConfig={(config) => updateConfig(selectedNode.id, config)}
            onRemoveConnection={removeConnection}
            onDelete={() => removeNode(selectedNode.id)}
            onClose={() => setSelected(null)}
          />
        )}
        {panel === 'runs' && !selectedNode && <RunsPanel flowId={flow.id} canEdit={canEdit} onClose={() => setPanel(null)} />}
      </div>

      {notice && (
        <div className={`${styles.toast} ${notice.type === 'error' ? styles.toastError : ''}`} role="status">
          {notice.type === 'error' ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />} {notice.text}
        </div>
      )}

      {simulating && <Simulator graph={graph} options={options} onClose={() => setSimulating(false)} />}
      {runningForLeads && (
        <RunForLeads
          flowId={flow.id}
          active={status === 'active'}
          onClose={() => setRunningForLeads(false)}
          onDone={(text) => { setRunningForLeads(false); setNotice({ type: 'ok', text }); setPanel('runs'); setSelected(null); }}
        />
      )}
    </div>
  );
}
