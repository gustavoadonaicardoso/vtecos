"use client";

import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import styles from './StickyNoteNode.module.css';
import type { PlanningNode } from '../types';

function StickyNoteNode({ data, selected }: NodeProps<PlanningNode>) {
  return (
    <div className={`${styles.note} ${selected ? styles.selected : ''}`}>
      <Handle type="target" position={Position.Left} id="left-target" className={styles.handle} />
      <Handle type="target" position={Position.Top} id="top-target" className={styles.handle} />
      {data.label || 'Nota'}
      <Handle type="source" position={Position.Right} id="right-source" className={styles.handle} />
      <Handle type="source" position={Position.Bottom} id="bottom-source" className={styles.handle} />
    </div>
  );
}

export default memo(StickyNoteNode);
