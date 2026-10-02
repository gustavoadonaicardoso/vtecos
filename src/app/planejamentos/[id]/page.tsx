"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import editorStyles from './editor.module.css';
import BoardToolbar, { type SaveStatus } from '../components/BoardToolbar';
import ElementPalette from '../components/ElementPalette';
import PlanningCanvas, { type PlanningCanvasHandle } from '../components/PlanningCanvas';
import NodeInspector from '../components/NodeInspector';
import type { PlanningBoard, PlanningCanvasData, PlanningNode, PlanningNodeData } from '../types';

function slugifyFileName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'planejamento';
}

export default function PlanningEditorPage() {
  const params = useParams<{ id: string }>();
  const canvasRef = useRef<PlanningCanvasHandle>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextSaveRef = useRef(true);

  const [board, setBoard] = useState<PlanningBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [name, setName] = useState('');
  const [canvasData, setCanvasData] = useState<PlanningCanvasData | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [selectedNode, setSelectedNode] = useState<PlanningNode | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await fetch(`/api/planejamentos/${params.id}`, { cache: 'no-store' });
        const result = await response.json().catch(() => ({}));
        if (!active) return;

        if (!response.ok) {
          setLoadError(result.error || 'Planejamento não encontrado.');
          return;
        }

        skipNextSaveRef.current = true;
        setBoard(result.data);
        setName(result.data.name);
      } catch {
        if (active) setLoadError('Falha de conexão ao carregar o planejamento.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [params.id]);

  const handleCanvasChange = useCallback((data: PlanningCanvasData) => {
    setCanvasData(data);
  }, []);

  // Autosave: espera 1.5s de silêncio depois da última mudança (nome ou canvas).
  useEffect(() => {
    if (!board || !canvasData) return;
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSaveStatus('saving');
    saveTimerRef.current = setTimeout(async () => {
      try {
        const response = await fetch(`/api/planejamentos/${board.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, canvas_data: canvasData }),
        });
        setSaveStatus(response.ok ? 'saved' : 'error');
      } catch {
        setSaveStatus('error');
      }
    }, 1500);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasData, name]);

  const handleNodeUpdate = useCallback((id: string, data: Partial<PlanningNodeData>) => {
    canvasRef.current?.updateNodeData(id, data);
    setSelectedNode((prev) => (prev && prev.id === id ? { ...prev, data: { ...prev.data, ...data } } : prev));
  }, []);

  const handleNodeDelete = useCallback((id: string) => {
    canvasRef.current?.deleteNode(id);
    setSelectedNode(null);
  }, []);

  const handleExport = useCallback(
    (format: 'png' | 'jpg' | 'pdf') => {
      canvasRef.current?.exportAs(format, slugifyFileName(name));
    },
    [name]
  );

  if (loading) {
    return (
      <div className={editorStyles.root}>
        <div className={editorStyles.centerMessage}>
          <p>Carregando planejamento…</p>
        </div>
      </div>
    );
  }

  if (loadError || !board) {
    return (
      <div className={editorStyles.root}>
        <div className={editorStyles.centerMessage}>
          <AlertTriangle size={36} opacity={0.6} />
          <p>{loadError || 'Planejamento não encontrado.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={editorStyles.root}>
      <BoardToolbar
        name={name}
        onNameChange={setName}
        saveStatus={saveStatus}
        onTogglePalette={() => setPaletteOpen((v) => !v)}
        onExport={handleExport}
        exportDisabled={!canvasData || canvasData.nodes.length === 0}
      />

      <div className={editorStyles.body}>
        <div
          className={`${editorStyles.paletteBackdrop} ${paletteOpen ? editorStyles.visible : ''}`}
          onClick={() => setPaletteOpen(false)}
        />
        <ElementPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />

        <PlanningCanvas
          ref={canvasRef}
          initialData={board.canvas_data}
          onChange={handleCanvasChange}
          selectedNodeId={selectedNode?.id ?? null}
          onSelectNode={setSelectedNode}
        />

        {selectedNode && (
          <NodeInspector
            node={selectedNode}
            onUpdate={handleNodeUpdate}
            onDelete={handleNodeDelete}
            onClose={() => setSelectedNode(null)}
          />
        )}
      </div>
    </div>
  );
}
