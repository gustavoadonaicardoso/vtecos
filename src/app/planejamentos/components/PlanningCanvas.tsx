"use client";

import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  MarkerType,
  ConnectionMode,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  getNodesBounds,
  getViewportForBounds,
  type Connection,
  type Edge,
  type NodeTypes,
  type Viewport,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { toPng, toJpeg } from 'html-to-image';
import jsPDF from 'jspdf';
import styles from './PlanningCanvas.module.css';
import FunnelNode from './FunnelNode';
import StickyNoteNode from './StickyNoteNode';
import type { PlanningCanvasData, PlanningElementDef, PlanningNode, PlanningNodeData } from '../types';

const NODE_TYPES: NodeTypes = { funnel: FunnelNode, sticky: StickyNoteNode };

export interface PlanningCanvasHandle {
  exportAs: (format: 'png' | 'jpg' | 'pdf', fileName: string) => Promise<void>;
  updateNodeData: (id: string, data: Partial<PlanningNodeData>) => void;
  deleteNode: (id: string) => void;
}

interface PlanningCanvasProps {
  initialData: PlanningCanvasData;
  onChange: (data: PlanningCanvasData) => void;
  selectedNodeId: string | null;
  onSelectNode: (node: PlanningNode | null) => void;
}

let idCounter = 0;
function nextId() {
  idCounter += 1;
  return `node-${Date.now()}-${idCounter}`;
}

const PlanningCanvas = forwardRef<PlanningCanvasHandle, PlanningCanvasProps>(function PlanningCanvas(
  { initialData, onChange, selectedNodeId, onSelectNode },
  ref
) {
  return (
    <ReactFlowProvider>
      <PlanningCanvasInner
        initialData={initialData}
        onChange={onChange}
        selectedNodeId={selectedNodeId}
        onSelectNode={onSelectNode}
        forwardedRef={ref}
      />
    </ReactFlowProvider>
  );
});

export default PlanningCanvas;

function PlanningCanvasInner({
  initialData,
  onChange,
  selectedNodeId,
  onSelectNode,
  forwardedRef,
}: PlanningCanvasProps & { forwardedRef: React.ForwardedRef<PlanningCanvasHandle> }) {
  const { screenToFlowPosition } = useReactFlow();
  const [nodes, setNodes, onNodesChangeRaw] = useNodesState<PlanningNode>(initialData.nodes);
  const [edges, setEdges, onEdgesChangeRaw] = useEdgesState<Edge>(initialData.edges);
  const [viewport, setViewport] = React.useState<Viewport>(initialData.viewport);

  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log('[planejamentos:diag] PlanningCanvas MONTOU', { nodes: initialData.nodes.length, edges: initialData.edges.length, ts: Date.now() });
    return () => {
      // eslint-disable-next-line no-console
      console.log('[planejamentos:diag] PlanningCanvas DESMONTOU', { ts: Date.now() });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onNodesChange = useCallback(
    (changes: any[]) => {
      // eslint-disable-next-line no-console
      console.log('[planejamentos:diag] onNodesChange', changes.map((c) => c.type), { ts: Date.now() });
      onNodesChangeRaw(changes);
    },
    [onNodesChangeRaw]
  );

  const onEdgesChange = useCallback(
    (changes: any[]) => {
      // eslint-disable-next-line no-console
      console.log('[planejamentos:diag] onEdgesChange', changes.map((c) => c.type), { ts: Date.now() });
      onEdgesChangeRaw(changes);
    },
    [onEdgesChangeRaw]
  );

  useEffect(() => {
    onChange({ nodes, edges, viewport });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, viewport]);

  const onConnect = useCallback(
    (connection: Connection) => {
      // eslint-disable-next-line no-console
      console.log('[planejamentos:diag] onConnect disparou', connection, { ts: Date.now() });
      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            style: { stroke: '#3b82f6', strokeWidth: 2.5 },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#3b82f6', width: 18, height: 18 },
          },
          eds
        )
      );
    },
    [setEdges]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const raw = event.dataTransfer.getData('application/vortice-planning-element');
      if (!raw) return;

      const def: PlanningElementDef = JSON.parse(raw);
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const data: PlanningNodeData = {
        kind: def.kind,
        label: def.label,
        iconKey: def.iconKey,
        color: def.color,
      };
      const newNode: PlanningNode = {
        id: nextId(),
        type: def.kind === 'note' ? 'sticky' : 'funnel',
        position,
        data,
      };
      setNodes((nds) => nds.concat(newNode));
    },
    [screenToFlowPosition, setNodes]
  );

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: PlanningNode) => onSelectNode(node),
    [onSelectNode]
  );

  const onPaneClick = useCallback(() => onSelectNode(null), [onSelectNode]);

  useImperativeHandle(forwardedRef, () => ({
    async exportAs(format, fileName) {
      const viewportEl = document.querySelector('.react-flow__viewport') as HTMLElement | null;
      if (!viewportEl || nodes.length === 0) return;

      const bounds = getNodesBounds(nodes);
      const padding = 48;
      const imageWidth = Math.round(bounds.width + padding * 2);
      const imageHeight = Math.round(bounds.height + padding * 2);
      const fitted = getViewportForBounds(bounds, imageWidth, imageHeight, 0.5, 2, 0);

      const toImage = format === 'jpg' ? toJpeg : toPng;
      const dataUrl = await toImage(viewportEl, {
        backgroundColor: '#ffffff',
        width: imageWidth,
        height: imageHeight,
        style: {
          width: `${imageWidth}px`,
          height: `${imageHeight}px`,
          transform: `translate(${fitted.x}px, ${fitted.y}px) scale(${fitted.zoom})`,
        },
      });

      if (format === 'pdf') {
        const pdf = new jsPDF({
          orientation: imageWidth > imageHeight ? 'landscape' : 'portrait',
          unit: 'px',
          format: [imageWidth, imageHeight],
        });
        pdf.addImage(dataUrl, 'PNG', 0, 0, imageWidth, imageHeight);
        pdf.save(`${fileName}.pdf`);
        return;
      }

      const link = document.createElement('a');
      link.download = `${fileName}.${format === 'jpg' ? 'jpg' : 'png'}`;
      link.href = dataUrl;
      link.click();
    },
    updateNodeData(id, data) {
      setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...data } } : n)));
    },
    deleteNode(id) {
      setNodes((nds) => nds.filter((n) => n.id !== id));
      setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
    },
  }));

  // Reflete seleção vinda do inspector (ex.: fechado pelo X) de volta pro canvas.
  const nodesWithSelection = useMemo(
    () => nodes.map((n) => ({ ...n, selected: n.id === selectedNodeId })),
    [nodes, selectedNodeId]
  );

  return (
    <div className={styles.wrapper}>
      <ReactFlow
        nodes={nodesWithSelection}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onMoveEnd={(_, vp) => setViewport(vp)}
        nodeTypes={NODE_TYPES}
        defaultViewport={initialData.viewport}
        minZoom={0.2}
        maxZoom={2}
        fitViewOptions={{ padding: 0.2 }}
        defaultEdgeOptions={{
          style: { stroke: '#3b82f6', strokeWidth: 2.5 },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#3b82f6', width: 18, height: 18 },
        }}
        connectionLineStyle={{ stroke: '#3b82f6', strokeWidth: 2.5 }}
        connectionRadius={32}
        connectionMode={ConnectionMode.Loose}
      >
        <Background variant={BackgroundVariant.Dots} gap={18} size={1} />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable style={{ opacity: 0.85 }} />
      </ReactFlow>
    </div>
  );
}
