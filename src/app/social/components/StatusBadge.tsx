"use client";

import React from 'react';
import styles from '../social.module.css';
import { POST_STATUS_META } from '../status';
import type { SocialPostStatus } from '@/types';

export default function StatusBadge({ status }: { status: SocialPostStatus }) {
  const meta = POST_STATUS_META[status];
  return (
    <span className={styles.badge} style={{ color: meta.color, background: `${meta.color}1f` }}>
      {meta.label}
    </span>
  );
}
