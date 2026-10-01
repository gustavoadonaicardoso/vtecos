"use client";

import React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, PanelLeft } from 'lucide-react';
import styles from './BoardToolbar.module.css';
import ExportMenu from './ExportMenu';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface BoardToolbarProps {
  name: string;
  onNameChange: (name: string) => void;
  saveStatus: SaveStatus;
  onTogglePalette: () => void;
  onExport: (format: 'png' | 'jpg' | 'pdf') => void;
  exportDisabled: boolean;
}

const SAVE_LABEL: Record<SaveStatus, string> = {
  idle: '',
  saving: 'Salvando…',
  saved: 'Salvo',
  error: 'Não foi possível salvar',
};

export default function BoardToolbar({ name, onNameChange, saveStatus, onTogglePalette, onExport, exportDisabled }: BoardToolbarProps) {
  const router = useRouter();

  return (
    <div className={styles.bar}>
      <button type="button" className={styles.backButton} onClick={() => router.push('/planejamentos')} aria-label="Voltar">
        <ArrowLeft size={16} />
      </button>

      <button type="button" className={styles.paletteToggle} onClick={onTogglePalette} aria-label="Abrir elementos">
        <PanelLeft size={16} />
      </button>

      <input
        className={styles.nameInput}
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        aria-label="Nome do planejamento"
      />

      <span className={styles.saveStatus} style={{ color: saveStatus === 'error' ? '#ef4444' : undefined }}>
        {SAVE_LABEL[saveStatus]}
      </span>

      <div className={styles.actions}>
        <ExportMenu disabled={exportDisabled} onExport={onExport} />
      </div>
    </div>
  );
}
