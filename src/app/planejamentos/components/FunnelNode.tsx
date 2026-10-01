"use client";

import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import styles from './FunnelNode.module.css';
import { resolvePlanningIcon } from '../elements';
import type { PlanningNode } from '../types';

function FunnelNode({ data, selected }: NodeProps<PlanningNode>) {
  const Icon = resolvePlanningIcon(data.iconKey);

  return (
    <div className={`${styles.node} ${selected ? styles.selected : ''}`}>
      <Handle type="target" position={Position.Left} id="left-target" className={styles.handle} />
      <Handle type="target" position={Position.Top} id="top-target" className={styles.handle} />

      <div className={styles.iconWrap} style={{ background: data.imageUrl ? 'transparent' : `${data.color || '#3b82f6'}22` }}>
        {data.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={data.imageUrl} alt="" />
        ) : (
          <Icon size={18} color={data.color || '#3b82f6'} />
        )}
      </div>
      <span className={styles.label}>{data.label}</span>

      <Handle type="source" position={Position.Right} id="right-source" className={styles.handle} />
      <Handle type="source" position={Position.Bottom} id="bottom-source" className={styles.handle} />
    </div>
  );
}

export default memo(FunnelNode);
