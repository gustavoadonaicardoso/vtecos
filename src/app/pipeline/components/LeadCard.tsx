'use client';

import { Clock, Mail, MessageCircle, User } from 'lucide-react';
import styles from '../pipeline.module.css';
import type { Lead } from '@/types';
import { TagBadge } from '@/components/leads/TagPicker';

interface LeadCardProps {
  lead: Lead;
  ownerName: string | null;
  days: number;
  tagColor: (name: string) => string | undefined;
  showOwner: boolean;
  dragging: boolean;
}

export default function LeadCard({ lead, ownerName, days, tagColor, showOwner, dragging }: LeadCardProps) {
  const stale = days >= 30 ? styles.staleBad : days >= 7 ? styles.staleWarn : '';
  return (
    <div className={`${styles.card} ${dragging ? styles.cardDragging : ''} ${lead.status === 'Bloqueado' ? styles.cardBlocked : ''}`}>
      <div className={styles.cardTop}>
        <strong>{lead.name}</strong>
        {(lead.valueNumber ?? 0) > 0 && <span className={styles.cardValue}>{lead.value}</span>}
      </div>
      {lead.phone && <span className={styles.cardPhone}>{lead.phone}</span>}
      {lead.tags.length > 0 && (
        <div className={styles.cardTags}>
          {lead.tags.slice(0, 2).map((tag) => <TagBadge key={tag} name={tag} color={tagColor(tag)} />)}
          {lead.tags.length > 2 && <span className={styles.more}>+{lead.tags.length - 2}</span>}
        </div>
      )}
      <div className={styles.cardFoot}>
        {showOwner && (
          <span className={`${styles.owner} ${ownerName ? '' : styles.ownerNone}`}>
            <User size={11} /> {ownerName || 'Sem responsável'}
          </span>
        )}
        <span className={styles.channels}>
          {lead.channels.includes('whatsapp') && <MessageCircle size={13} aria-label="WhatsApp" />}
          {lead.email && <Mail size={13} aria-label="E-mail" />}
        </span>
        <span className={`${styles.days} ${stale}`} title={`Há ${days} dia(s) nesta etapa`}>
          <Clock size={11} /> {days}d
        </span>
      </div>
    </div>
  );
}
