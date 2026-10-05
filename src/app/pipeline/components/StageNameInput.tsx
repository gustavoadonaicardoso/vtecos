'use client';

import { useState } from 'react';

/** Nome da etapa: salva ao sair do campo ou com Enter (nunca vazio). */
export default function StageNameInput({ value, onCommit, className, autoFocus, onDone }: { value: string; onCommit: (name: string) => void; className?: string; autoFocus?: boolean; onDone?: () => void }) {
  const [text, setText] = useState(value);
  const commit = () => {
    const name = text.trim().slice(0, 60);
    if (name && name !== value) onCommit(name);
    else setText(value);
    onDone?.();
  };
  return (
    <input
      className={className}
      value={text}
      maxLength={60}
      autoFocus={autoFocus}
      aria-label="Nome da etapa"
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          setText(value);
          onDone?.();
        }
      }}
    />
  );
}
