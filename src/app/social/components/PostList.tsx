"use client";

import React, { useMemo, useState } from 'react';
import { ExternalLink, ImageIcon, Pencil, RotateCcw } from 'lucide-react';
import styles from '../social.module.css';
import PlatformIcon from './PlatformIcon';
import StatusBadge from './StatusBadge';
import { POST_STATUS_META, formatDateTime, postCalendarDate } from '../status';
import type { SocialAccount, SocialPost, SocialPostStatus } from '@/types';

const STATUS_FILTERS: Array<{ value: 'all' | SocialPostStatus; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'draft', label: POST_STATUS_META.draft.label },
  { value: 'scheduled', label: POST_STATUS_META.scheduled.label },
  { value: 'published', label: POST_STATUS_META.published.label },
  { value: 'partial', label: POST_STATUS_META.partial.label },
  { value: 'failed', label: POST_STATUS_META.failed.label },
];

interface PostListProps {
  posts: SocialPost[];
  accounts: SocialAccount[];
  onEdit: (post: SocialPost) => void;
  onChanged: () => void;
}

export default function PostList({ posts, accounts, onEdit, onChanged }: PostListProps) {
  const [statusFilter, setStatusFilter] = useState<'all' | SocialPostStatus>('all');
  const [accountFilter, setAccountFilter] = useState('');
  const [retrying, setRetrying] = useState<string | null>(null);
  const [error, setError] = useState('');

  const accountsById = useMemo(() => new Map(accounts.map((account) => [account.id, account])), [accounts]);

  const visible = posts
    .filter((post) => {
      if (statusFilter === 'all') return true;
      if (statusFilter === 'published') return post.status === 'published' || post.status === 'published_late';
      return post.status === statusFilter;
    })
    .filter((post) => !accountFilter || post.targets.some((target) => target.account_id === accountFilter))
    .sort((a, b) => {
      const dateA = postCalendarDate(a) || a.created_at;
      const dateB = postCalendarDate(b) || b.created_at;
      return new Date(dateB).getTime() - new Date(dateA).getTime();
    });

  const retry = async (post: SocialPost) => {
    setRetrying(post.id);
    setError('');
    const response = await fetch(`/api/social/posts/${post.id}/retry`, { method: 'POST' });
    setRetrying(null);
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      setError(result.error || 'Não foi possível tentar de novo.');
    }
    onChanged();
  };

  return (
    <div className={styles.panel}>
      <div className={styles.filters}>
        {STATUS_FILTERS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            className={`${styles.chip} ${statusFilter === filter.value ? styles.chipActive : ''}`}
            onClick={() => setStatusFilter(filter.value)}
          >
            {filter.label}
          </button>
        ))}
        <select className={styles.select} value={accountFilter} onChange={(event) => setAccountFilter(event.target.value)}>
          <option value="">Todas as contas</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.platform === 'instagram' ? `@${account.username || account.name}` : account.name}
            </option>
          ))}
        </select>
      </div>

      {error && <p className={styles.targetError}>{error}</p>}

      {visible.length === 0 ? (
        <div className={styles.emptyState}>
          <ImageIcon size={36} opacity={0.5} />
          <p>Nenhum post por aqui ainda.</p>
        </div>
      ) : (
        visible.map((post) => (
          <div key={post.id} className={styles.postRow}>
            {post.media[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={post.media[0].url} alt="" className={styles.thumb} />
            ) : (
              <div className={styles.thumb}><ImageIcon size={20} /></div>
            )}

            <div className={styles.postMain}>
              <p className={styles.postCaption}>{post.caption || 'Sem legenda'}</p>
              <div className={styles.postMeta}>
                <StatusBadge status={post.status} />
                <span>{formatDateTime(postCalendarDate(post))}</span>
                {post.targets.map((target) => {
                  const account = accountsById.get(target.account_id);
                  if (!account) return null;
                  return (
                    <span key={target.id} className={styles.targetPill} title={target.error || undefined}>
                      <PlatformIcon platform={account.platform} size={12} />
                      {target.status === 'published' ? '✓' : target.status === 'failed' ? '✕' : '…'}
                    </span>
                  );
                })}
              </div>
              {post.targets
                .filter((target) => target.error)
                .map((target) => (
                  <p key={target.id} className={styles.targetError}>{target.error}</p>
                ))}
            </div>

            <div className={styles.rowActions}>
              {post.targets
                .filter((target) => target.permalink)
                .map((target) => {
                  const account = accountsById.get(target.account_id);
                  return (
                    <a key={target.id} href={target.permalink!} target="_blank" rel="noopener noreferrer" className={styles.secondaryButton}>
                      <ExternalLink size={13} /> {account?.platform === 'instagram' ? 'Instagram' : 'Facebook'}
                    </a>
                  );
                })}
              {(post.status === 'failed' || post.status === 'partial') && (
                <button type="button" className={styles.secondaryButton} onClick={() => retry(post)} disabled={retrying === post.id}>
                  <RotateCcw size={13} /> {retrying === post.id ? 'Tentando…' : 'Tentar de novo'}
                </button>
              )}
              <button type="button" className={styles.secondaryButton} onClick={() => onEdit(post)}>
                <Pencil size={13} /> Abrir
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
