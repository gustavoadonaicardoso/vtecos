"use client";

import React, { useEffect, useRef, useState } from 'react';
import { Download, ChevronDown } from 'lucide-react';
import styles from './ExportMenu.module.css';

interface ExportMenuProps {
  disabled?: boolean;
  onExport: (format: 'png' | 'jpg' | 'pdf') => void;
}

export default function ExportMenu({ disabled, onExport }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [open]);

  const handlePick = (format: 'png' | 'jpg' | 'pdf') => {
    setOpen(false);
    onExport(format);
  };

  return (
    <div className={styles.wrapper} ref={wrapperRef}>
      <button type="button" className={styles.button} disabled={disabled} onClick={() => setOpen((v) => !v)}>
        <Download size={14} /> Exportar <ChevronDown size={12} />
      </button>
      {open && (
        <div className={styles.dropdown}>
          <button type="button" onClick={() => handlePick('png')}>Imagem PNG</button>
          <button type="button" onClick={() => handlePick('jpg')}>Imagem JPG</button>
          <button type="button" onClick={() => handlePick('pdf')}>Documento PDF</button>
        </div>
      )}
    </div>
  );
}
