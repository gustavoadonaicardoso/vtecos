'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Edit2, GripVertical, MoreVertical, Trash2 } from 'lucide-react';
import styles from '../pipeline.module.css';
import StageNameInput from './StageNameInput';

export const STAGE_COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#10b981', '#14b8a6', '#06b6d4', '#6366f1', '#64748b'];

interface StageHeaderProps {
  name: string;
  color: string;
  count: number;
  total: string;
  canEdit: boolean;
  isWon: boolean;
  isFirst: boolean;
  isLast: boolean;
  dragHandle: Record<string, unknown> | null | undefined;
  onRename: (name: string) => void;
  onColor: (color: string) => void;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
}

export default function StageHeader(props: StageHeaderProps) {
  const { name, color, count, total, canEdit, isWon, isFirst, isLast, dragHandle, onRename, onColor, onMove, onDelete } = props;
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setMenu(false);
    };
    const esc = (event: KeyboardEvent) => event.key === 'Escape' && setMenu(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [menu]);

  return (
    <div className={styles.stageHead} style={{ ['--stage' as string]: color }}>
      <div className={styles.stageTitle} {...(canEdit ? dragHandle : {})} title={canEdit ? 'Arraste para mudar a ordem da etapa' : undefined}>
        {canEdit && <GripVertical size={14} className={styles.grip} />}
        <span className={styles.stageDot} />
        {renaming ? (
          <StageNameInput value={name} autoFocus className={styles.stageRename} onCommit={onRename} onDone={() => setRenaming(false)} />
        ) : (
          <strong>{name}</strong>
        )}
        <span className={styles.stageCount}>{count}</span>
      </div>
      <span className={styles.stageTotal}>{total}</span>

      {canEdit && (
        <div className={styles.menuWrap} ref={ref}>
          <button type="button" className={styles.iconBtn} onClick={() => setMenu((value) => !value)} aria-label={`Ações da etapa ${name}`} aria-expanded={menu}>
            <MoreVertical size={16} />
          </button>
          {menu && (
            <div className={styles.menu} role="menu">
              <button type="button" role="menuitem" onClick={() => { setRenaming(true); setMenu(false); }}><Edit2 size={14} /> Renomear</button>
              <div className={styles.menuColors} aria-label="Cor da etapa">
                {STAGE_COLORS.map((item) => (
                  <button key={item} type="button" className={`${styles.swatch} ${item === color ? styles.swatchOn : ''}`} style={{ background: item }} aria-label={`Cor ${item}`} onClick={() => { onColor(item); setMenu(false); }} />
                ))}
              </div>
              <button type="button" role="menuitem" disabled={isFirst} onClick={() => { onMove(-1); setMenu(false); }}><ArrowLeft size={14} /> Mover para a esquerda</button>
              <button type="button" role="menuitem" disabled={isLast} onClick={() => { onMove(1); setMenu(false); }}><ArrowRight size={14} /> Mover para a direita</button>
              {!isWon && (
                <button type="button" role="menuitem" className={styles.menuDanger} onClick={() => { setMenu(false); onDelete(); }}><Trash2 size={14} /> Excluir etapa</button>
              )}
              {isWon && <p className={styles.menuNote}>A etapa de ganhos não pode ser excluída: metas e relatórios dependem dela.</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
