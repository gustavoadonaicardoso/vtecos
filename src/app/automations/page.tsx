"use client";

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Zap, 
  MessageSquare, 
  LayoutGrid,
  Search,
  Maximize2,
  Power,
  Save,
  HelpCircle as QuestionIcon,
  ShieldCheck,
  Split,
  ChevronDown,
  Settings2,
  Share2,
  ChevronRight,
  Settings,
  MoreVertical,
  Plus as PlusIcon,
  MousePointer2,
  Monitor,
  Database,
  ArrowRight,
  Clock
} from 'lucide-react';
import styles from './automations.module.css';

// --- Professional Node Data Structure ---
interface Node {
  id: string;
  type: string;
  category: string;
  label: string;
  content: string;
  x: number;
  y: number;
  icon: any;
  headerColor: string;
  selected?: boolean;
}

interface Connection {
  id: string;
  fromId: string;
  toId: string;
}

// --- Enterprise Component Library ---
const COMPONENT_LIBRARY = [
  { 
    cat: 'MENSAGENS', 
    items: [
      { id: 'msg', label: 'Mensagem', desc: 'Envio de texto simples', icon: MessageSquare, color: '#3b82f6', content: 'Olá! Como posso ajudar?' },
      { id: 'img', label: 'Imagem/Mídia', desc: 'Envio de arquivos', icon: Share2, color: '#8b5cf6', content: 'Selecione um arquivo...' },
      { id: 'ask', label: 'Pergunta', desc: 'Captura de dados', icon: QuestionIcon, color: '#0ea5e9', content: 'Qual sua principal dúvida?' }
    ]
  },
  { 
    cat: 'LÓGICA', 
    items: [
      { id: 'cond', label: 'Condição (Se)', desc: 'Desvio de fluxo', icon: Split, color: '#f59e0b', content: 'Se: nome_lead existe' },
      { id: 'wait', label: 'Atraso Inteligente', desc: 'Tempo de espera', icon: Clock, color: '#10b981', content: 'Aguardar 2 minutos' }
    ]
  },
  { 
    cat: 'DADOS', 
    items: [
      { id: 'db', label: 'Salvar no CRM', desc: 'Atualizar lead', icon: Database, color: '#0096ff', content: 'Funil: Comercial' },
      { id: 'tag', label: 'Etiquetar Lead', desc: 'Tags automáticas', icon: Zap, color: '#ff6d5a', content: 'Adicionar Tag: Quente' }
    ]
  }
];

export default function AutomationsPage() {
  const [nodes, setNodes] = useState<Node[]>([
    { 
      id: 'node-start', 
      type: 'trigger', 
      category: 'START', 
      label: 'Gatilho Principal', 
      content: 'Quando o lead inicia uma conversa direta via WhatsApp', 
      x: 450, 
      y: 250, 
      icon: Zap, 
      headerColor: '#f59e0b' 
    },
    { 
      id: 'node-intro', 
      type: 'msg', 
      category: 'MENSAGENS', 
      label: 'Boas-vindas', 
      content: 'Olá! Sou o assistente virtual do Vórtice. Em que posso ajudar hoje?', 
      x: 820, 
      y: 180, 
      icon: MessageSquare, 
      headerColor: '#3b82f6' 
    }
  ]);

  const [connections, setConnections] = useState<Connection[]>([
    { id: 'conn-1', fromId: 'node-start', toId: 'node-intro' }
  ]);

  const [isAdding, setIsAdding] = useState(false);
  const [canvasOffset, setCanvasOffset] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const canvasWrapperRef = useRef<HTMLDivElement>(null);

  // --- Core Handlers ---
  const handleDropToCanvas = (item: any, clientX: number, clientY: number) => {
    const rect = canvasWrapperRef.current?.getBoundingClientRect();
    if (!rect) return;

    // Advanced coordinate projection accounting for canvas pan and zoom
    const x = (clientX - rect.left - canvasOffset.x) / zoom;
    const y = (clientY - rect.top - canvasOffset.y) / zoom;

    const newNode: Node = {
      id: `node-${Date.now()}`,
      type: item.id,
      category: item.cat,
      label: item.label,
      content: item.content,
      x: x - 130, // Offset to center dropped node on cursor
      y: y - 50,
      icon: item.icon,
      headerColor: item.color
    };

    setNodes(prev => [...prev, newNode]);
    // Connect to last node automatically for 'professional' intuition
    if (nodes.length > 0) {
       const last = nodes[nodes.length - 1];
       setConnections(prev => [...prev, { id: `c-${Date.now()}`, fromId: last.id, toId: newNode.id }]);
    }
  };

  const updateNodePosition = (id: string, deltaX: number, deltaY: number) => {
    setNodes(prev => prev.map(n => n.id === id ? { ...n, x: n.x + deltaX / zoom, y: n.y + deltaY / zoom } : n));
  };

  // Helper for Connection Drawing
  const getPortCoordinates = (nodeId: string, side: 'out' | 'in') => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return { x: 0, y: 0 };
    const width = 260; // Enterprise Node Width
    const height = 110; // Est. height
    return side === 'out' 
      ? { x: node.x + width, y: node.y + 55 } 
      : { x: node.x, y: node.y + 55 };
  };

  return (
    <div className={styles.orchestratorContainer}>
      {/* Precision Top Navigation */}
      <nav className={styles.orchestratorHeader}>
        <div className={styles.headerLeft}>
          <div className={styles.statusBadge}>
            <div className={styles.statusDot} /> ON-AIR
          </div>
          <h1>Workflow de Atendimento: <span className={styles.flowName}>Vendas Qualificadas SSD</span></h1>
        </div>

        <div className={styles.headerRight}>
          <div className={styles.viewControls}>
            <button className={styles.viewBtn}><Search size={16} /></button>
            <button className={styles.viewBtn}><Monitor size={16} /></button>
          </div>
          <div className={styles.divider} />
          <button className={styles.actionBtnSecondary}><Power size={14} /> Pausar Fluxo</button>
          <button className={styles.actionBtnPrimary}><Save size={14} /> Persistir Alterações</button>
        </div>
      </nav>

      <div className={styles.workspaceArea}>
        {/* Enterprise Component Sidebar */}
        <aside className={styles.orchestratorSidebar}>
          <div className={styles.sidebarTitle}>BIBLIOTECA DE BLOCOS</div>
          
          <div className={styles.libraryContainer}>
            {COMPONENT_LIBRARY.map(category => (
              <div key={category.cat} className={styles.libCategory}>
                <div className={styles.categoryLabel}>{category.cat}</div>
                <div className={styles.itemList}>
                   {category.items.map(item => (
                     <motion.div 
                       key={item.id} 
                       className={styles.draggableBlock}
                       drag
                       dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
                       dragElastic={0.1}
                       whileDrag={{ scale: 1.05, zIndex: 9999, opacity: 0.9, boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }}
                       onDragStart={() => setIsAdding(true)}
                       onDragEnd={(e, info) => {
                         setIsAdding(false);
                         if (info.point.x > 320) handleDropToCanvas(item, info.point.x, info.point.y);
                       }}
                     >
                       <div className={styles.blockHeader} style={{ background: item.color }}>
                          <item.icon size={16} color="white" />
                       </div>
                       <div className={styles.blockInfo}>
                          <span className={styles.blockLabel}>{item.label}</span>
                          <span className={styles.blockDesc}>{item.desc}</span>
                       </div>
                     </motion.div>
                   ))}
                </div>
              </div>
            ))}
          </div>
          
          <div className={styles.sidebarHint}>
            <MousePointer2 size={12} /> ARRASTE E SOLTE NO PALCO
          </div>
        </aside>

        {/* Immersive Orchestration Stage */}
        <main 
          className={styles.orchestrationStage}
          ref={canvasWrapperRef}
        >
          {isAdding && <div className={styles.dropZoneOverlay}>SOLTE O BLOCO AQUI PARA ADICIONAR AO FLUXO</div>}

          <motion.div 
            className={styles.infiniteCanvas}
            drag
            dragMomentum={false}
            onDrag={(e, info) => setCanvasOffset(prev => ({ x: prev.x + info.delta.x, y: prev.y + info.delta.y }))}
            style={{ 
              x: canvasOffset.x, 
              y: canvasOffset.y, 
              scale: zoom
            }}
          >
            {/* Professional Connection Lines (Bezier) */}
            <svg className={styles.connectionsSvg}>
              {connections.map(conn => {
                const s = getPortCoordinates(conn.fromId, 'out');
                const e = getPortCoordinates(conn.toId, 'in');
                const midX = s.x + (e.x - s.x) * 0.5;
                const path = `M ${s.x} ${s.y} C ${midX} ${s.y}, ${midX} ${e.y}, ${e.x} ${e.y}`;
                
                return (
                  <path 
                    key={conn.id} 
                    d={path} 
                    className={styles.enterprisePath} 
                    strokeWidth="3"
                  />
                );
              })}
            </svg>

            {/* Precision Rendered Nodes */}
            {nodes.map(node => (
              <motion.div 
                key={node.id}
                className={styles.precisionNode}
                drag
                dragMomentum={false}
                onDrag={(e, info) => updateNodePosition(node.id, info.delta.x, info.delta.y)}
                style={{ x: node.x, y: node.y }}
              >
                <div className={styles.nodeTop} style={{ borderTop: `4px solid ${node.headerColor}` }}>
                  <div className={styles.nodeIconBox}>
                    <node.icon size={20} color={node.headerColor} />
                  </div>
                  <div className={styles.nodeIdentity}>
                    <span className={styles.nodeTitle}>{node.label}</span>
                    <span className={styles.nodeType}>{node.category}</span>
                  </div>
                  <button className={styles.nodeExtra}><MoreVertical size={16} /></button>
                </div>
                
                <div className={styles.nodeContent}>
                   <p>{node.content}</p>
                </div>

                {/* Ports (Interactive Glow) */}
                <div className={`${styles.nodePort} ${styles.pIn}`} />
                <div className={`${styles.nodePort} ${styles.pOut}`} />
              </motion.div>
            ))}
          </motion.div>

          {/* Floating UI Architect Tools */}
          <div className={styles.stageOverlays}>
             <div className={styles.minimapBox}>
                <div className={styles.miniOverview}>
                   {nodes.map(n => <div key={n.id} className={styles.miniDot} style={{ left: (n.x/15)+60, top: (n.y/15)+30 }} />)}
                </div>
             </div>

             <div className={styles.zoomControls}>
                <button onClick={() => setZoom(prev => Math.min(prev + 0.1, 1.4))}>+</button>
                <span className={styles.zoomLevel}>{Math.round(zoom * 100)}%</span>
                <button onClick={() => setZoom(prev => Math.max(prev - 0.1, 0.4))}>-</button>
             </div>
          </div>
        </main>
      </div>
    </div>
  );
}
