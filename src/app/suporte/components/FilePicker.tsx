'use client';

import React, { useRef } from 'react';
import { Paperclip, X } from 'lucide-react';
import styles from '../suporte.module.css';
import { ATTACHMENT_ACCEPT, MAX_ATTACHMENTS, MAX_ATTACHMENT_BYTES } from '@/lib/support';
import { fileSize } from '../format';

interface Props {
  files: File[];
  onChange: (files: File[]) => void;
  onError: (message: string) => void;
  disabled?: boolean;
}

/** Até 3 anexos de 10 MB (prints, PDFs, planilhas). */
export default function FilePicker({ files, onChange, onError, disabled }: Props) {
  const input = useRef<HTMLInputElement>(null);

  const add = (list: FileList | null) => {
    if (!list) return;
    const next = [...files];
    for (const file of Array.from(list)) {
      if (file.size > MAX_ATTACHMENT_BYTES) {
        onError(`"${file.name}" passa de 10 MB.`);
        continue;
      }
      if (next.length >= MAX_ATTACHMENTS) {
        onError(`No máximo ${MAX_ATTACHMENTS} arquivos por mensagem.`);
        break;
      }
      next.push(file);
    }
    onChange(next);
  };

  return (
    <div className={styles.files}>
      <input ref={input} type="file" multiple hidden accept={ATTACHMENT_ACCEPT} onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
      <button type="button" className={styles.attachBtn} onClick={() => input.current?.click()} disabled={disabled || files.length >= MAX_ATTACHMENTS}>
        <Paperclip size={15} /> Anexar
      </button>
      {files.map((file, index) => (
        <span key={`${file.name}-${index}`} className={styles.fileChip}>
          {file.name} <small>{fileSize(file.size)}</small>
          <button type="button" onClick={() => onChange(files.filter((_, i) => i !== index))} aria-label={`Remover ${file.name}`}><X size={12} /></button>
        </span>
      ))}
    </div>
  );
}
