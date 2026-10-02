"use client";

import React, { useMemo, useState } from 'react';
import { BarChart3, Check, ExternalLink, ImageIcon, Pencil, RotateCcw, X } from 'lucide-react';
import styles from '../social.module.css';
import PlatformIcon from './PlatformIcon';
import StatusBadge from './StatusBadge';
import { POST_STATUS_META, formatDateTime, formatMetric, postCalendarDate } from '../status';
import type { SocialAccount, SocialPost, SocialPostStatus, SocialProjectOption, SocialTargetInsights } from '@/types';

type StatusFilter = 'all' | SocialPostStatus;

const STATUS_FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'pending_approval', label: POST_STATUS_META.pending_approval.label },
  { value: 'draft', label: POST_STATUS_META.draft.label },
  { value: 'scheduled', label: POST_STATUS_META.scheduled.label },
  { value: 'published', label: POST_STATUS_META.published.label },
  { value: 'partial', label: POST_STATUS_META.partial.label },
  { value: 'failed', label: POST_STATUS_META.failed.label },
  { value: 'rejected', label: POST_STATUS_META.rejected.label },
];

const PUBLISHED_STATUSES: SocialPostStatus[] = ['published', 'published_late', 'partial'];

interface PostListProps {
  posts: SocialPost[];
  accounts: SocialAccount[];
  projects: SocialProjectOption[];
  canApprove: boolean;
  initialStatus: string | null;
  onEdit: (post: SocialPost) => void;
  onChanged: () => void;
}

export default function PostList({ posts, accounts, projects, canApprove, initialStatus, onEdit, onChanged }: PostListProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(
    STATUS_FILTERS.some((filter) => filter.value === initialStatus) ? (initialStatus as StatusFilter) : 'all'
  );
  const [accountFilter, setAccountFilter] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [results, setResults] = useState<Record<string, SocialTargetInsights[] | 'loading' | { error: string }>>({});

  const accountsById = useMemo(() => new Map(accounts.map((account) => [account.id, account])), [accounts]);
  const projectsById = useMemo(() => new Map(projects.map((project) => [project.id, project.name])), [projects]);
  const pendingCount = posts.filter((post) => post.status === 'pending_approval').length;

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

  const callAction = async (post: SocialPost, action: 'retry' | 'approve' | 'reject', body?: object) => {
    setBusy(`${action}:${post.id}`);
    setError('');
    try {
      const response = await fetch(`/api/social/posts/${post.id}/${action}`, {
        method: 'POST',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        setError(result.error || 'Não foi possível concluir a ação.');
      }
    } catch {
      setError('Falha de conexão. Tente de novo.');
    } finally {
      setBusy(null);
      onChanged();
    }
  };

  const reject = (post: SocialPost) => {
    const reason = prompt('Por que este post foi reprovado? O autor vai ver este motivo.');
    if (reason === null) return;
    if (reason.trim().length < 3) {
      setError('Escreva o motivo da reprovação.');
      return;
    }
    callAction(post, 'reject', { reason: reason.trim() });
  };

  const toggleResults = async (post: SocialPost) => {
    if (results[post.id]) {
      setResults(({ [post.id]: _removed, ...rest }) => rest);
      return;
    }
    setResults((current) => ({ ...current, [post.id]: 'loading' }));
    try {
      const response = await fetch(`/api/social/posts/${post.id}/insights`, { cache: 'no-store' });
      const result = await response.json().catch(() => ({}));
      setResults((current) => ({
        ...current,
        [post.id]: response.ok ? result.data : { error: result.error || 'Não foi possível buscar os resultados.' },
      }));
    } catch {
      setResults((current) => ({ ...current, [post.id]: { error: 'Falha de conexão.' } }));
    }
  };

  const renderResults = (post: SocialPost) => {
    const entry = results[post.id];
    if (!entry) return null;
    if (entry === 'loading') return <p className={styles.subtitle} style={{ margin: 0, fontSize: '0.78rem' }}>Buscando resultados na Meta…</p>;
    if ('error' in entry) return <p className={styles.targetError}>{entry.error}</p>;
    if (entry.length === 0) return <p className={styles.subtitle} style={{ margin: 0, fontSize: '0.78rem' }}>Nenhum destino publicado.</p>;
    return entry.map((item) => {
      const account = accountsById.get(item.accountId);
      return (
        <div key={item.targetId} className={styles.inlineMetrics}>
          {account && <PlatformIcon platform={account.platform} size={12} />}
          {item.error || !item.metrics ? (
            <span className={styles.targetError}>{item.error || 'Sem dados.'}</span>
          ) : (
            <>
              <span>Alcance <b>{formatMetric(item.metrics.reach)}</b></span>
              <span>Visualizações <b>{formatMetric(item.metrics.views)}</b></span>
              <span>Curtidas <b>{formatMetric(item.metrics.likes)}</b></span>
              <span>Comentários <b>{formatMetric(item.metrics.comments)}</b></span>
              <span>Compart. <b>{formatMetric(item.metrics.shares)}</b></span>
              {account?.platform === 'instagram' && <span>Salvos <b>{formatMetric(item.metrics.saves)}</b></span>}
            </>
          )}
        </div>
      );
    });
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
            {filter.value === 'pending_approval' && pendingCount > 0 && ` (${pendingCount})`}
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

      {error && <p className={styles.targetError} style={{ marginBottom: 10 }}>{error}</p>}

      {visible.length === 0 ? (
        <div className={styles.emptyState}>
          <ImageIcon size={36} opacity={0.5} />
          <p>{statusFilter === 'pending_approval' ? 'Nenhum post aguardando aprovação.' : 'Nenhum post por aqui ainda.'}</p>
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
                <span>
                  {post.status === 'pending_approval' && !post.scheduled_at
                    ? 'Publicar ao aprovar'
                    : formatDateTime(postCalendarDate(post))}
                </span>
                {post.project_id && (
                  <span className={styles.projectPill} title="Projeto">{projectsById.get(post.project_id) || 'Projeto'}</span>
                )}
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
              {post.status === 'rejected' && post.rejection_reason && (
                <p className={styles.rejectionNote}>Motivo: {post.rejection_reason}</p>
              )}
              {post.targets
                .filter((target) => target.error)
                .map((target) => (
                  <p key={target.id} className={styles.targetError}>{target.error}</p>
                ))}
              {renderResults(post)}
            </div>

            <div className={styles.rowActions}>
              {canApprove && post.status === 'pending_approval' && (
                <>
                  <button
                    type="button"
                    className={styles.approveButton}
                    onClick={() => callAction(post, 'approve')}
                    disabled={busy !== null}
                  >
                    <Check size={13} /> {busy === `approve:${post.id}` ? 'Aprovando…' : 'Aprovar'}
                  </button>
                  <button type="button" className={styles.dangerButton} onClick={() => reject(post)} disabled={busy !== null}>
                    <X size={13} /> Reprovar
                  </button>
                </>
              )}
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
              {PUBLISHED_STATUSES.includes(post.status) && (
                <button type="button" className={styles.secondaryButton} onClick={() => toggleResults(post)}>
                  <BarChart3 size={13} /> {results[post.id] ? 'Ocultar resultados' : 'Resultados'}
                </button>
              )}
              {(post.status === 'failed' || post.status === 'partial') && (
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => callAction(post, 'retry')}
                  disabled={busy !== null}
                >
                  <RotateCcw size={13} /> {busy === `retry:${post.id}` ? 'Tentando…' : 'Tentar de novo'}
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
