"use client";

import React, { useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ImagePlus, Send, Trash2, X, CalendarClock, Save, Sparkles, ShieldCheck } from 'lucide-react';
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
import type { SocialAccount, SocialMediaItem, SocialPost, SocialPostStatus, SocialProjectOption, SocialSettings } from '@/types';

const LOCKED_STATUSES: SocialPostStatus[] = ['publishing', 'published', 'published_late', 'partial'];

const AI_TONES = [
  { value: 'profissional', label: 'Profissional' },
  { value: 'descontraido', label: 'Descontraído' },
  { value: 'inspirador', label: 'Inspirador' },
  { value: 'vendedor', label: 'Vendedor' },
  { value: 'educativo', label: 'Educativo' },
];

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
  projects: SocialProjectOption[];
  settings: SocialSettings;
  /** O usuário envia para aprovação em vez de agendar/publicar direto. */
  needsApproval: boolean;
  onClose: () => void;
  onChanged: () => void;
}

function initialAccountIds(accounts: SocialAccount[], settings: SocialSettings) {
  const active = accounts.filter((account) => account.status === 'active');
  const defaults = active.filter((account) => settings.defaultAccountIds.includes(account.id));
  return (defaults.length > 0 ? defaults : active).map((account) => account.id);
}

export default function PostComposer({
  post,
  initialDate,
  accounts,
  projects,
  settings,
  needsApproval,
  onClose,
  onChanged,
}: PostComposerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [postId, setPostId] = useState<string | null>(post?.id ?? null);
  const [caption, setCaption] = useState(post?.caption ?? '');
  const [media, setMedia] = useState<SocialMediaItem[]>(post?.media ?? []);
  const [selectedIds, setSelectedIds] = useState<string[]>(
    post ? post.targets.map((target) => target.account_id) : initialAccountIds(accounts, settings)
  );
  const [projectId, setProjectId] = useState<string>(() => {
    if (post) return post.project_id ?? '';
    // Post novo herda o projeto da primeira conta marcada que tiver um.
    const linked = accounts.find((account) => selectedIds.includes(account.id) && account.project_id);
    return linked?.project_id ?? '';
  });
  const [aiOpen, setAiOpen] = useState(false);
  const [aiBrief, setAiBrief] = useState('');
  const [aiTone, setAiTone] = useState('profissional');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiResult, setAiResult] = useState<{ caption: string; hashtags: string[] } | null>(null);
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

  const isPending = post?.status === 'pending_approval';
  const reviewingAsApprover = isPending && !needsApproval;

  const toggleAccount = (id: string) => {
    const adding = !selectedIds.includes(id);
    setSelectedIds((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
    const account = accounts.find((item) => item.id === id);
    if (adding && !projectId && account?.project_id) setProjectId(account.project_id);
  };

  const generateCaption = async () => {
    setAiBusy(true);
    setAiError('');
    try {
      const response = await fetch('/api/social/ai/caption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brief: aiBrief, tone: aiTone, platforms, currentCaption: aiBrief ? '' : caption }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setAiError(result.error || 'Não foi possível gerar a legenda.');
        return;
      }
      setAiResult(result.data);
    } catch {
      setAiError('Falha de conexão com a IA.');
    } finally {
      setAiBusy(false);
    }
  };

  const applyAiCaption = () => {
    if (!aiResult) return;
    if (caption.trim() && !confirm('Substituir a legenda atual pela sugestão da IA?')) return;
    setCaption([aiResult.caption, aiResult.hashtags.join(' ')].filter(Boolean).join('\n\n'));
    setAiOpen(false);
    setAiResult(null);
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
      projectId: projectId || null,
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
        if (result.pendingApproval) {
          alert('Post enviado para aprovação. Você será avisado quando um administrador ou gerente revisar.');
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

  /** Para quem precisa de aprovação: horário no futuro = agendar; senão, publicar assim que aprovado. */
  const submitForApproval = () => {
    const future = scheduledLocal && new Date(scheduledLocal).getTime() > Date.now();
    return run(future ? 'schedule' : 'now');
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

            {post?.status === 'rejected' && post.rejection_reason && (
              <div className={`${styles.banner} ${styles.bannerError}`} style={{ marginBottom: 18 }}>
                <div><strong>Reprovado:</strong> {post.rejection_reason}<br />Ajuste o post e envie de novo.</div>
              </div>
            )}
            {isPending && (
              <div className={`${styles.banner} ${styles.bannerInfo}`} style={{ marginBottom: 18 }}>
                {needsApproval
                  ? 'Este post está aguardando aprovação. Você ainda pode ajustar e salvar.'
                  : post?.scheduled_at
                    ? 'Aguardando sua aprovação. Ao aprovar, ele fica agendado para o horário escolhido (ou sai na hora, se o horário já passou).'
                    : 'Aguardando sua aprovação. O autor pediu para publicar assim que for aprovado.'}
              </div>
            )}

            {needsApproval && (post?.status === 'scheduled' || post?.status === 'failed') && (
              <div className={`${styles.banner} ${styles.bannerInfo}`} style={{ marginBottom: 18 }}>
                Este post já foi aprovado. Se você salvar alterações, ele volta para rascunho e precisa ser aprovado de novo.
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
              <div className={styles.labelRow}>
                <label className={styles.fieldLabel} htmlFor="social-caption">Legenda</label>
                {!locked && (
                  <button type="button" className={styles.aiButton} onClick={() => setAiOpen((open) => !open)}>
                    <Sparkles size={13} /> Gerar com IA
                  </button>
                )}
              </div>
              {aiOpen && !locked && (
                <div className={styles.aiPanel}>
                  <textarea
                    className={styles.textarea}
                    value={aiBrief}
                    maxLength={1500}
                    onChange={(event) => setAiBrief(event.target.value)}
                    placeholder={caption.trim()
                      ? 'Sobre o que é o post? (deixe vazio para a IA melhorar a legenda atual)'
                      : 'Sobre o que é o post? Ex.: lançamento do novo plano de automação para clínicas, com 7 dias grátis.'}
                  />
                  <div className={styles.aiRow}>
                    <select className={styles.select} value={aiTone} onChange={(event) => setAiTone(event.target.value)} aria-label="Tom da legenda">
                      {AI_TONES.map((tone) => <option key={tone.value} value={tone.value}>{tone.label}</option>)}
                    </select>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={generateCaption}
                      disabled={aiBusy || (!aiBrief.trim() && !caption.trim())}
                    >
                      <Sparkles size={13} /> {aiBusy ? 'Gerando…' : aiResult ? 'Gerar outra' : 'Gerar legenda'}
                    </button>
                  </div>
                  {aiError && <p className={styles.targetError}>{aiError}</p>}
                  {aiResult && (
                    <>
                      <div className={styles.aiResult}>
                        {aiResult.caption}
                        {aiResult.hashtags.length > 0 && (
                          <>{'\n\n'}<span className={styles.aiHashtags}>{aiResult.hashtags.join(' ')}</span></>
                        )}
                      </div>
                      <div className={styles.aiRow}>
                        <button type="button" className={styles.primaryButton} onClick={applyAiCaption}>Usar esta legenda</button>
                        <span className={styles.subtitle} style={{ fontSize: '0.75rem', margin: 0 }}>
                          Revise antes de publicar: a IA pode errar.
                        </span>
                      </div>
                    </>
                  )}
                </div>
              )}
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

            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="social-project">Projeto (opcional)</label>
              <select
                id="social-project"
                className={styles.input}
                value={projectId}
                disabled={locked}
                onChange={(event) => setProjectId(event.target.value)}
              >
                <option value="">Nenhum</option>
                {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                {projectId && !projects.some((project) => project.id === projectId) && (
                  <option value={projectId}>Projeto removido</option>
                )}
              </select>
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
          {!locked && needsApproval && (
            <div className={styles.footerActions}>
              <button type="button" className={styles.secondaryButton} onClick={() => run('draft')} disabled={busy !== null || uploading}>
                <Save size={14} /> {busy === 'draft' ? 'Salvando…' : isPending ? 'Salvar alterações' : 'Salvar rascunho'}
              </button>
              {!isPending && (
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={submitForApproval}
                  disabled={busy !== null || uploading || problems.length > 0}
                  title="Um administrador ou gerente revisa antes de publicar"
                >
                  <ShieldCheck size={14} /> {busy === 'schedule' || busy === 'now' ? 'Enviando…' : 'Enviar para aprovação'}
                </button>
              )}
            </div>
          )}
          {!locked && !needsApproval && (
            <div className={styles.footerActions}>
              <button type="button" className={styles.secondaryButton} onClick={() => run('draft')} disabled={busy !== null || uploading}>
                <Save size={14} /> {busy === 'draft' ? 'Salvando…' : post?.status === 'scheduled' || isPending ? 'Salvar alterações' : 'Salvar rascunho'}
              </button>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => run('schedule')}
                disabled={busy !== null || uploading || problems.length > 0 || !scheduledLocal}
              >
                <CalendarClock size={14} /> {busy === 'schedule' ? 'Agendando…' : reviewingAsApprover ? 'Aprovar e agendar' : 'Agendar'}
              </button>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() => run('now')}
                disabled={busy !== null || uploading || problems.length > 0}
              >
                <Send size={14} /> {busy === 'now' ? 'Publicando…' : reviewingAsApprover ? 'Aprovar e publicar agora' : 'Publicar agora'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
