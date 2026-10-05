'use client';

import { useState } from 'react';
import { Check, Plus } from 'lucide-react';
import styles from './leads-shared.module.css';
import type { LeadTag } from '@/types';

interface TagPickerProps {
  value: string[];
  options: LeadTag[];
  onChange: (tags: string[]) => void;
  disabled?: boolean;
}

/** Escolhe etiquetas da empresa; digitar uma nova também cria. */
export default function TagPicker({ value, options, onChange, disabled }: TagPickerProps) {
  const [text, setText] = useState('');
  const has = (name: string) => value.some((tag) => tag.toLowerCase() === name.toLowerCase());
  const toggle = (name: string) => onChange(has(name) ? value.filter((tag) => tag.toLowerCase() !== name.toLowerCase()) : [...value, name]);
  const colorOf = (name: string) => options.find((tag) => tag.name.toLowerCase() === name.toLowerCase())?.color || '#64748b';
  const extra = value.filter((tag) => !options.some((option) => option.name.toLowerCase() === tag.toLowerCase()));

  const addTyped = () => {
    const name = text.trim().slice(0, 40);
    if (name && !has(name)) onChange([...value, name]);
    setText('');
  };

  return (
    <div className={styles.tagPicker}>
      <div className={styles.tagOptions}>
        {[...options.map((option) => option.name), ...extra].map((name) => {
          const on = has(name);
          return (
            <button
              key={name}
              type="button"
              className={`${styles.tagChip} ${on ? styles.tagChipOn : ''}`}
              style={{ ['--tag' as string]: colorOf(name) }}
              onClick={() => toggle(name)}
              disabled={disabled}
              aria-pressed={on}
            >
              {on && <Check size={12} />} {name}
            </button>
          );
        })}
        {options.length === 0 && extra.length === 0 && <span className={styles.hint}>Nenhuma etiqueta ainda. Digite abaixo para criar.</span>}
      </div>
      {!disabled && (
        <div className={styles.tagAdd}>
          <input
            value={text}
            maxLength={40}
            placeholder="Nova etiqueta"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addTyped();
              }
            }}
          />
          <button type="button" onClick={addTyped} disabled={!text.trim()} aria-label="Adicionar etiqueta"><Plus size={14} /></button>
        </div>
      )}
    </div>
  );
}

/** Etiqueta pequena com a cor da empresa (listas e cartões). */
export function TagBadge({ name, color }: { name: string; color?: string }) {
  return (
    <span className={styles.tagBadge} style={{ ['--tag' as string]: color || '#64748b' }}>
      {name}
    </span>
  );
}
