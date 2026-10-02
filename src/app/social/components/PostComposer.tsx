"use client";

import React, { useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ImagePlus, Send, Trash2, X, CalendarClock, Save } from 'lucide-react';
import styles from '../social.module.css';
import PlatformIcon from './PlatformIcon';
import PostPreview from './PostPreview';
import StatusBadge from './StatusBadge';
import {
  INSTAGRAM_CAPTION_LIMIT,
  INSTAGRAM_HASHTAG_LIMIT,
  MAX_IMAGES_PER_POST,
  countHashtags,
  isInstagramRatioValid,
  validatePostForPublishing,
} from '@/lib/social/rules';
import type { SocialAccount, SocialMediaItem, SocialPost, SocialPostStatus } from '@/types';

const LOCKED_STATUSES: SocialPostStatus[] = ['publishing', 'published', 'published_late', 'partial'];

function toLocalInput(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function defaultScheduleFor(day: Date | null) {
  const base = day ? new Date(day.getFullYear(), day.getMonth(), day.getDate(), 10, 0) : new Date(Date.now() + 60 * 60_000);
  // Dia clicado no passado (ou hoje já depois das 10h): sugere daqui a 1h.
  return base.getTime() > Date.now() ? base : new Date(Date.now() + 60 * 60_000);
}

interface PostComposerProps {
  post: SocialPost | null;
  initialDate: Date | null;
  accounts: SocialAccount[];
  onClose: () => void;
  onChanged: () => void;
}

export default function PostComposer({ post, initialDate, accounts, onClose, onChanged }: PostComposerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [postId, setPostId] = useState<string | null>(post?.id ?? null);
  const [caption, setCaption] = useState(post?.caption ?? '');
  const [media, setMedia] = useState<SocialMediaItem[]>(post?.media ?? []);
  const [selectedIds, setSelectedIds] = useState<string[]>(
    post ? post.targets.map((target) => target.account_id) : accounts.filter((a) => a.status === 'active').map((a) => a.id)
  );
  const [scheduledLocal, setScheduledLocal] = useState(
    toLocalInput(post?.scheduled_at ? new Date(post.scheduled_at) : defaultScheduleFor(initialDate))
  );
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState<null | 'draft' | 'schedule' | 'now' | 'delete'>(null);
  const [error, setError] = useState('');

  const locked = post ? LOCKED_STATUSES.includes(post.status) : false;
  const selectedAccounts = useMemo(
    () => accounts.filter((account) => selectedIds.includes(account.id)),
    [accounts, selectedIds]
  );
  const platforms = [...new Set(selectedAccounts.map((account) => account.platform))];
  const hasInstagram = platforms.includes('instagram');
  const hashtags = countHashtags(caption);
  const problems = validatePostForPublishing({ caption, media, platforms });

  const toggleAccount = (id: string) => {
    setSelectedIds((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError('');
    try {
      for (const file of Array.from(files)) {
        if (media.length >= MAX_IMAGES_PER_POST) break;
        const formData = new FormData();
        formData.append('file', file);
        const response = await fetch('/api/social/upload', { method: 'POST', body: formData });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          setError(result.error || 'Falha ao enviar imagem.');
          break;
        }
        setMedia((current) => [...current, result.data].slice(0, MAX_IMAGES_PER_POST));
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const moveMedia = (index: number, direction: -1 | 1) => {
    setMedia((current) => {
      const next = [...current];
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  /** Salva (cria ou atualiza) e devolve o id do post. */
  const save = async (): Promise<string | null> => {
    const payload = {
      caption,
      media,
      accountIds: selectedIds,
      scheduledAt: scheduledLocal ? new Date(scheduledLocal).toISOString() : null,
      projectId: post?.project_id ?? null,
    };
    const response = await fetch(postId ? `/api/social/posts/${postId}` : '/api/social/posts', {
      method: postId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(result.error || 'Não foi possível salvar o post.');
      return null;
    }
    setPostId(result.data.id);
    return result.data.id as string;
  };

  const run = async (action: 'draft' | 'schedule' | 'now') => {
    setBusy(action);
    setError('');
    try {
      const id = await save();
      if (!id) return;
      if (action !== 'draft') {
        const response = await fetch(`/api/social/posts/${id}/submit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: action }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          onChanged();
          setError(result.error || 'Não foi possível enviar o post.');
          return;
        }
      }
      onChanged();
      onClose();
    } catch {
      setError('Falha de conexão. Tente de novo.');
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!postId) return;
    const warning = post && LOCKED_STATUSES.includes(post.status)
      ? 'Excluir este post só remove do Vórtice — ele continua publicado na rede. Continuar?'
      : 'Excluir este post?';
    if (!confirm(warning)) return;
    setBusy('delete');
    const response = await fetch(`/api/social/posts/${postId}`, { method: 'DELETE' });
    setBusy(null);
    if (response.ok) {
      onChanged();
      onClose();
    } else {
      const result = await response.json().catch(() => ({}));
      setError(result.error || 'Não foi possível excluir.');
    }
  };

  const previewAccounts = selectedAccounts.length > 0 ? selectedAccounts : [];

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.drawer} onClick={(event) => event.stopPropagation()}>
        <div className={styles.drawerHeader}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h2>{post ? 'Editar post' : 'Novo post'}</h2>
            {post && <StatusBadge status={post.status} />}
          </div>
          <button type="button" className={styles.iconButton} onClick={onClose} aria-label="Fechar">
            <X size={16} />
          </button>
        </div>

        <div className={styles.drawerBody}>
          <div>
            {locked && (
              <div className={`${styles.banner} ${styles.bannerInfo}`} style={{ marginBottom: 18 }}>
                Este post já foi publicado (ou está sendo) e não pode mais ser editado. Use a lista de posts para tentar
                de novo os destinos que falharam.
              </div>
            )}

            <div className={styles.field}>
              <span className={styles.fieldLabel}>Publicar em</span>
              {accounts.length === 0 ? (
                <span className={styles.subtitle}>Nenhuma conta conectada. Conecte na aba Contas.</span>
              ) : (
                <div className={styles.accountPicker}>
                  {accounts.map((account) => (
                    <button
                      key={account.id}
                      type="button"
                      disabled={locked}
                      className={`${styles.accountOption} ${selectedIds.includes(account.id) ? styles.accountOptionActive : ''}`}
                      onClick={() => toggleAccount(account.id)}
                    >
                      <PlatformIcon platform={account.platform} />
                      {account.platform === 'instagram' ? `@${account.username || account.name}` : account.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="social-caption">Legenda</label>
              <textarea
                id="social-caption"
                className={styles.textarea}
                value={caption}
                disabled={locked}
                onChange={(event) => setCaption(event.target.value)}
                placeholder="Escreva a legenda do post…"
              />
              {hasInstagram && (
                <div className={styles.counters}>
                  <span className={caption.length > INSTAGRAM_CAPTION_LIMIT ? styles.counterOver : ''}>
                    {caption.length}/{INSTAGRAM_CAPTION_LIMIT} caracteres
                  </span>
                  <span className={hashtags > INSTAGRAM_HASHTAG_LIMIT ? styles.counterOver : ''}>
                    {hashtags}/{INSTAGRAM_HASHTAG_LIMIT} hashtags
                  </span>
                </div>
              )}
            </div>

            <div className={styles.field}>
              <span className={styles.fieldLabel}>Imagens ({media.length}/{MAX_IMAGES_PER_POST}) — JPG ou PNG</span>
              <div className={styles.mediaGrid}>
                {media.map((item, index) => (
                  <div
                    key={item.url}
                    className={`${styles.mediaItem} ${hasInstagram && !isInstagramRatioValid(item) ? styles.mediaWarning : ''}`}
                    title={hasInstagram && !isInstagramRatioValid(item) ? 'Proporção fora do aceito pelo Instagram' : undefined}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.url} alt={`Imagem ${index + 1}`} />
                    {!locked && (
                      <div className={styles.mediaControls}>
                        <button type="button" onClick={() => moveMedia(index, -1)} aria-label="Mover para a esquerda">
                          <ArrowLeft size={12} />
                        </button>
                        <button type="button" onClick={() => setMedia((current) => current.filter((_, i) => i !== index))} aria-label="Remover imagem">
                          <Trash2 size={12} />
                        </button>
                        <button type="button" onClick={() => moveMedia(index, 1)} aria-label="Mover para a direita">
                          <ArrowRight size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                {!locked && media.length < MAX_IMAGES_PER_POST && (
                  <button type="button" className={styles.uploadTile} onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                    <ImagePlus size={20} />
                    {uploading ? 'Enviando…' : 'Adicionar'}
                  </button>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png"
                multiple
                hidden
                onChange={(event) => handleFiles(event.target.files)}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="social-schedule">Data e hora do agendamento</label>
              <input
                id="social-schedule"
                type="datetime-local"
                className={styles.input}
                value={scheduledLocal}
                disabled={locked}
                onChange={(event) => setScheduledLocal(event.target.value)}
              />
            </div>

            {!locked && problems.length > 0 && (
              <div className={styles.field}>
                <span className={styles.fieldLabel}>Antes de agendar ou publicar</span>
                <ul className={styles.errorList}>
                  {problems.map((problem) => <li key={problem}>{problem}</li>)}
                </ul>
              </div>
            )}

            {post?.targets.some((target) => target.error) && (
              <div className={styles.field}>
                <span className={styles.fieldLabel}>Resultado por conta</span>
                {post.targets.map((target) => {
                  const account = accounts.find((a) => a.id === target.account_id);
                  return (
                    <p key={target.id} className={target.error ? styles.targetError : styles.subtitle} style={{ margin: 0 }}>
                      {account ? (account.username ? `@${account.username}` : account.name) : 'Conta removida'}:{' '}
                      {target.status === 'published' ? 'publicado' : target.error || 'pendente'}
                    </p>
                  );
                })}
              </div>
            )}
          </div>

          <div className={styles.previewColumn}>
            <span className={styles.fieldLabel}>Prévia</span>
            {previewAccounts.length === 0 ? (
              <span className={styles.subtitle}>Escolha uma conta para ver a prévia.</span>
            ) : (
              previewAccounts.map((account) => (
                <PostPreview key={account.id} account={account} caption={caption} media={media} />
              ))
            )}
          </div>
        </div>

        <div className={styles.drawerFooter}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {error && <span className={styles.targetError}>{error}</span>}
            {postId && !locked && (
              <button type="button" className={styles.dangerButton} onClick={remove} disabled={busy !== null}>
                <Trash2 size={14} /> Excluir
              </button>
            )}
            {postId && locked && (
              <button type="button" className={styles.dangerButton} onClick={remove} disabled={busy !== null || post?.status === 'publishing'}>
                <Trash2 size={14} /> Remover do Vórtice
              </button>
            )}
          </div>
          {!locked && (
            <div className={styles.footerActions}>
              <button type="button" className={styles.secondaryButton} onClick={() => run('draft')} disabled={busy !== null || uploading}>
                <Save size={14} /> {busy === 'draft' ? 'Salvando…' : post?.status === 'scheduled' ? 'Salvar alterações' : 'Salvar rascunho'}
              </button>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => run('schedule')}
                disabled={busy !== null || uploading || problems.length > 0 || !scheduledLocal}
              >
                <CalendarClock size={14} /> {busy === 'schedule' ? 'Agendando…' : 'Agendar'}
              </button>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() => run('now')}
                disabled={busy !== null || uploading || problems.length > 0}
              >
                <Send size={14} /> {busy === 'now' ? 'Publicando…' : 'Publicar agora'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
