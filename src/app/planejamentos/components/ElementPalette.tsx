"use client";

import React from 'react';
import { X } from 'lucide-react';
import styles from './ElementPalette.module.css';
import { PLANNING_ELEMENTS, ELEMENT_CATEGORIES, resolvePlanningIcon } from '../elements';
import type { PlanningElementDef } from '../types';

interface ElementPaletteProps {
  open: boolean;
  onClose: () => void;
}

export default function ElementPalette({ open, onClose }: ElementPaletteProps) {
  const handleDragStart = (event: React.DragEvent, def: PlanningElementDef) => {
    event.dataTransfer.setData('application/vortice-planning-element', JSON.stringify(def));
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <aside className={`${styles.panel} ${open ? styles.open : ''}`}>
      <button type="button" className={styles.closeMobile} onClick={onClose} aria-label="Fechar paleta">
        <X size={14} />
      </button>

      {ELEMENT_CATEGORIES.map((cat) => (
        <div key={cat.id} className={styles.category}>
          <span className={styles.categoryTitle}>{cat.label}</span>
          {PLANNING_ELEMENTS.filter((el) => el.category === cat.id).map((el) => {
            const Icon = resolvePlanningIcon(el.iconKey);
            return (
              <div
                key={el.iconKey}
                className={styles.chip}
                draggable
                onDragStart={(e) => handleDragStart(e, el)}
              >
                <span className={styles.chipIcon} style={{ background: `${el.color || '#3b82f6'}22` }}>
                  <Icon size={14} color={el.color || '#3b82f6'} />
                </span>
                {el.label}
              </div>
            );
          })}
        </div>
      ))}
    </aside>
  );
}
