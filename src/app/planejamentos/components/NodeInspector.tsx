"use client";

import React, { useRef, useState } from 'react';
import { X, Upload, Trash2 } from 'lucide-react';
import styles from './NodeInspector.module.css';
import type { PlanningNode, PlanningNodeData } from '../types';

const SWATCHES = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#ef4444', '#64748b', '#111827'];

interface NodeInspectorProps {
  node: PlanningNode;
  onUpdate: (id: string, data: Partial<PlanningNodeData>) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export default function NodeInspector({ node, onUpdate, onDelete, onClose }: NodeInspectorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch('/api/planejamentos/upload', { method: 'POST', body: formData });
      const result = await response.json().catch(() => ({}));

      if (response.ok && result.data?.url) {
        onUpdate(node.id, { imageUrl: result.data.url });
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const isNote = node.data.kind === 'note';

  return (
    <aside className={styles.panel}>
      <div className={styles.panelHeader}>
        <h3>{isNote ? 'Nota' : 'Elemento'}</h3>
        <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Fechar">
          <X size={14} />
        </button>
      </div>

      <div className={styles.field}>
        <label htmlFor="node-label">{isNote ? 'Texto da nota' : 'Rótulo'}</label>
        <textarea
          id="node-label"
          value={node.data.label}
          onChange={(e) => onUpdate(node.id, { label: e.target.value })}
        />
      </div>

      {!isNote && (
        <div className={styles.field}>
          <label>Cor</label>
          <div className={styles.swatches}>
            {SWATCHES.map((color) => (
              <button
                key={color}
                type="button"
                className={`${styles.swatch} ${node.data.color === color ? styles.active : ''}`}
                style={{ background: color }}
                onClick={() => onUpdate(node.id, { color })}
                aria-label={`Cor ${color}`}
              />
            ))}
          </div>
        </div>
      )}

      {!isNote && (
        <div className={styles.field}>
          <label>Imagem / logo customizado</label>
          {node.data.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={node.data.imageUrl} alt="" className={styles.preview} />
          )}
          <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleFileChange} />
          <button type="button" className={styles.uploadButton} onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            <Upload size={14} /> {uploading ? 'Enviando…' : node.data.imageUrl ? 'Trocar imagem' : 'Enviar imagem'}
          </button>
          {node.data.imageUrl && (
            <button type="button" className={styles.uploadButton} onClick={() => onUpdate(node.id, { imageUrl: undefined })}>
              Remover imagem (usar ícone)
            </button>
          )}
        </div>
      )}

      <button type="button" className={styles.deleteButton} onClick={() => onDelete(node.id)}>
        <Trash2 size={14} /> Remover elemento
      </button>
    </aside>
  );
}
