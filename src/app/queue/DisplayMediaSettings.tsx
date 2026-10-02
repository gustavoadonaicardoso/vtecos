'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff, Film, ImageIcon, Minimize2, Maximize2, Plus, Save, Trash2, Upload, X } from 'lucide-react';
import styles from './DisplayMediaSettings.module.css';
import { supabase } from '@/lib/supabase';
import {
  DEFAULT_DISPLAY_CONFIG,
  IMAGE_TYPES,
  MODE_LABELS,
  VIDEO_TYPES,
  type DisplayConfig,
  type DisplayMediaItem,
  type DisplayMediaMode,
} from '@/lib/queue-display';

const MODE_COLORS: Record<DisplayMediaMode, string> = {
  fullscreen: '#3b82f6',
  minimized: '#8b5cf6',
  hidden: '#94a3b8',
};

const MODE_ICONS: Record<DisplayMediaMode, React.ComponentType<{ size?: number }>> = {
  fullscreen: Maximize2,
  minimized: Minimize2,
  hidden: EyeOff,
};

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes}min ${rest}s` : `${minutes}min`;
}

export default function DisplayMediaSettings({ onClose }: { onClose: () => void }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [config, setConfig] = useState<DisplayConfig>(DEFAULT_DISPLAY_CONFIG);
  const [savedConfig, setSavedConfig] = useState<string>(JSON.stringify(DEFAULT_DISPLAY_CONFIG));
  const [media, setMedia] = useState<DisplayMediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  const load = useCallback(async () => {
    const response = await fetch('/api/queue/media', { cache: 'no-store' });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage({ type: 'error', text: result.error || 'Não foi possível carregar a mídia do painel.' });
    } else {
      setMedia(result.data.media);
      setConfig(result.data.config);
      setSavedConfig(JSON.stringify(result.data.config));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const dirty = JSON.stringify(config) !== savedConfig;
  const cycleTotal = config.cycle.reduce((sum, phase) => sum + phase.seconds, 0);

  const saveConfig = async () => {
    setSaving(true);
    setMessage(null);
    const response = await fetch('/api/queue/display-config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    const result = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) {
      setMessage({ type: 'error', text: result.error || 'Não foi possível salvar.' });
      return;
    }
    setConfig(result.data);
    setSavedConfig(JSON.stringify(result.data));
    setMessage({ type: 'success', text: 'Rotina salva. O painel atualiza em até 1 minuto.' });
  };

  const updatePhase = (index: number, patch: Partial<DisplayConfig['cycle'][number]>) => {
    setConfig((current) => ({ ...current, cycle: current.cycle.map((phase, i) => (i === index ? { ...phase, ...patch } : phase)) }));
  };

  const movePhase = (index: number, direction: -1 | 1) => {
    setConfig((current) => {
      const cycle = [...current.cycle];
      const target = index + direction;
      if (target < 0 || target >= cycle.length) return current;
      [cycle[index], cycle[target]] = [cycle[target], cycle[index]];
      return { ...current, cycle };
    });
  };

  // ── Upload direto para o Storage (URL assinada) ──
  const uploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0 || !supabase) return;
    setMessage(null);
    for (const file of Array.from(files)) {
      if (![...IMAGE_TYPES, ...VIDEO_TYPES].includes(file.type)) {
        setMessage({ type: 'error', text: `"${file.name}": use JPG, PNG, WEBP, GIF, MP4 ou WEBM.` });
        continue;
      }
      setUploading(file.name);
      try {
        const prep = await fetch('/api/queue/media/upload-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: file.name, contentType: file.type, size: file.size }),
        });
        const prepResult = await prep.json().catch(() => ({}));
        if (!prep.ok) throw new Error(prepResult.error || 'Não foi possível preparar o envio.');

        const { path, token, type } = prepResult.data;
        const { error: uploadError } = await supabase.storage.from('queue-media').uploadToSignedUrl(path, token, file, {
          contentType: file.type,
        });
        if (uploadError) throw new Error(uploadError.message);

        const created = await fetch('/api/queue/media', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path, type, title: file.name.replace(/\.[^.]+$/, ''), durationSeconds: 10 }),
        });
        const createdResult = await created.json().catch(() => ({}));
        if (!created.ok) throw new Error(createdResult.error || 'Não foi possível salvar a mídia.');
        setMedia((current) => [...current, createdResult.data]);
      } catch (error) {
        setMessage({ type: 'error', text: `"${file.name}": ${error instanceof Error ? error.message : 'falha no envio.'}` });
      }
    }
    setUploading(null);
    if (fileInput.current) fileInput.current.value = '';
  };

  const patchMedia = async (item: DisplayMediaItem, patch: { title?: string; durationSeconds?: number; active?: boolean }) => {
    setMedia((current) =>
      current.map((m) =>
        m.id === item.id
          ? {
              ...m,
              ...(patch.title !== undefined ? { title: patch.title } : {}),
              ...(patch.durationSeconds !== undefined ? { duration_seconds: patch.durationSeconds } : {}),
              ...(patch.active !== undefined ? { active: patch.active } : {}),
            }
          : m
      )
    );
    const response = await fetch(`/api/queue/media/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      setMessage({ type: 'error', text: result.error || 'Não foi possível salvar a alteração.' });
      load();
    }
  };

  const removeMedia = async (item: DisplayMediaItem) => {
    if (!confirm(`Remover "${item.title || 'esta mídia'}" do painel?`)) return;
    setMedia((current) => current.filter((m) => m.id !== item.id));
    const response = await fetch(`/api/queue/media/${item.id}`, { method: 'DELETE' });
    if (!response.ok) load();
  };

  const moveMedia = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= media.length) return;
    const reordered = [...media];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setMedia(reordered);
    await fetch('/api/queue/media/order', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: reordered.map((m) => m.id) }),
    });
  };

  const activeCount = media.filter((m) => m.active).length;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Mídia do painel">
        <div className={styles.modalHeader}>
          <div>
            <h2>Mídia do Painel</h2>
            <p>Anúncios, imagens e vídeos exibidos no Display enquanto as senhas não são chamadas.</p>
          </div>
          <button type="button" className={styles.iconButton} onClick={onClose} aria-label="Fechar"><X size={16} /></button>
        </div>

        <div className={styles.modalBody}>
          {loading ? (
            <p className={styles.muted}>Carregando…</p>
          ) : (
            <>
              {message && <div className={message.type === 'error' ? styles.error : styles.success}>{message.text}</div>}

              <section className={styles.section}>
                <div className={styles.toggleRow}>
                  <div>
                    <strong>Exibir mídia no painel</strong>
                    <span className={styles.muted}>
                      {activeCount === 0 ? 'Adicione pelo menos uma imagem ou vídeo abaixo.' : `${activeCount} ${activeCount === 1 ? 'mídia ativa' : 'mídias ativas'} na playlist.`}
                    </span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={config.enabled}
                    aria-label="Exibir mídia no painel"
                    className={`${styles.switch} ${config.enabled ? styles.switchOn : ''}`}
                    onClick={() => setConfig((current) => ({ ...current, enabled: !current.enabled }))}
                  />
                </div>
              </section>

              <section className={styles.section}>
                <div className={styles.sectionHeader}>
                  <h3>Rotina de exibição</h3>
                  <span className={styles.muted}>repete a cada {formatDuration(cycleTotal)}</span>
                </div>
                <div className={styles.timeline} aria-hidden="true">
                  {config.cycle.map((phase, index) => (
                    <span key={index} style={{ flex: phase.seconds, background: MODE_COLORS[phase.mode] }} title={`${MODE_LABELS[phase.mode]} · ${formatDuration(phase.seconds)}`}>
                      {MODE_LABELS[phase.mode]}
                    </span>
                  ))}
                </div>
                <div className={styles.phaseList}>
                  {config.cycle.map((phase, index) => {
                    const Icon = MODE_ICONS[phase.mode];
                    return (
                      <div key={index} className={styles.phaseRow}>
                        <span className={styles.phaseIcon} style={{ color: MODE_COLORS[phase.mode] }}><Icon size={16} /></span>
                        <select
                          value={phase.mode}
                          onChange={(event) => updatePhase(index, { mode: event.target.value as DisplayMediaMode })}
                          aria-label="Modo"
                        >
                          <option value="fullscreen">Tela inteira</option>
                          <option value="minimized">Minimizada</option>
                          <option value="hidden">Oculta (só as senhas)</option>
                        </select>
                        <label className={styles.secondsField}>
                          <input
                            type="number"
                            min={5}
                            max={3600}
                            value={phase.seconds}
                            onChange={(event) => updatePhase(index, { seconds: Number(event.target.value) || 5 })}
                          />
                          seg
                        </label>
                        <div className={styles.rowButtons}>
                          <button type="button" onClick={() => movePhase(index, -1)} disabled={index === 0} aria-label="Subir"><ArrowUp size={14} /></button>
                          <button type="button" onClick={() => movePhase(index, 1)} disabled={index === config.cycle.length - 1} aria-label="Descer"><ArrowDown size={14} /></button>
                          <button
                            type="button"
                            onClick={() => setConfig((current) => ({ ...current, cycle: current.cycle.filter((_, i) => i !== index) }))}
                            disabled={config.cycle.length === 1}
                            aria-label="Remover etapa"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <button
                  type="button"
                  className={styles.linkButton}
                  onClick={() => setConfig((current) => ({ ...current, cycle: [...current.cycle, { mode: 'fullscreen', seconds: 30 }] }))}
                  disabled={config.cycle.length >= 12}
                >
                  <Plus size={14} /> Adicionar etapa
                </button>

                <div className={styles.interruptRow}>
                  <span>Quando uma senha for chamada, tirar a mídia da frente por</span>
                  <input
                    type="number"
                    min={0}
                    max={300}
                    value={config.callInterruptSeconds}
                    onChange={(event) => setConfig((current) => ({ ...current, callInterruptSeconds: Number(event.target.value) || 0 }))}
                  />
                  <span>segundos</span>
                </div>

                <div className={styles.saveRow}>
                  <button type="button" className={styles.primaryButton} onClick={saveConfig} disabled={!dirty || saving}>
                    <Save size={15} /> {saving ? 'Salvando…' : 'Salvar rotina'}
                  </button>
                </div>
              </section>

              <section className={styles.section}>
                <div className={styles.sectionHeader}>
                  <h3>Playlist</h3>
                  <button type="button" className={styles.secondaryButton} onClick={() => fileInput.current?.click()} disabled={uploading !== null}>
                    <Upload size={15} /> {uploading ? `Enviando ${uploading}…` : 'Adicionar imagens ou vídeos'}
                  </button>
                  <input
                    ref={fileInput}
                    type="file"
                    hidden
                    multiple
                    accept={[...IMAGE_TYPES, ...VIDEO_TYPES].join(',')}
                    onChange={(event) => uploadFiles(event.target.files)}
                  />
                </div>
                <p className={styles.muted}>
                  Imagens até 15 MB (JPG, PNG, WEBP, GIF) e vídeos até 100 MB (MP4, WEBM). Para melhor resultado, use 16:9
                  (ex.: 1920×1080). Os vídeos tocam sem som, como em qualquer TV de recepção.
                </p>

                {media.length === 0 ? (
                  <div className={styles.empty}><ImageIcon size={28} opacity={0.5} /><span>Nenhuma mídia ainda.</span></div>
                ) : (
                  <div className={styles.mediaList}>
                    {media.map((item, index) => (
                      <div key={item.id} className={`${styles.mediaRow} ${item.active ? '' : styles.mediaPaused}`}>
                        <div className={styles.thumb}>
                          {item.type === 'image' ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={item.url} alt="" />
                          ) : (
                            <video src={item.url} muted preload="metadata" />
                          )}
                          <span className={styles.typeTag}>{item.type === 'image' ? <ImageIcon size={11} /> : <Film size={11} />}</span>
                        </div>
                        <div className={styles.mediaInfo}>
                          <input
                            className={styles.titleInput}
                            defaultValue={item.title}
                            placeholder="Título (opcional)"
                            onBlur={(event) => event.target.value !== item.title && patchMedia(item, { title: event.target.value })}
                          />
                          {item.type === 'image' ? (
                            <label className={styles.secondsField}>
                              Exibir por
                              <input
                                type="number"
                                min={3}
                                max={600}
                                defaultValue={item.duration_seconds}
                                onBlur={(event) => {
                                  const value = Number(event.target.value) || 10;
                                  if (value !== item.duration_seconds) patchMedia(item, { durationSeconds: value });
                                }}
                              />
                              seg
                            </label>
                          ) : (
                            <span className={styles.muted}>Vídeo: toca até o fim</span>
                          )}
                        </div>
                        <div className={styles.rowButtons}>
                          <button type="button" onClick={() => patchMedia(item, { active: !item.active })} title={item.active ? 'Pausar' : 'Ativar'} aria-label={item.active ? 'Pausar' : 'Ativar'}>
                            {item.active ? <Eye size={14} /> : <EyeOff size={14} />}
                          </button>
                          <button type="button" onClick={() => moveMedia(index, -1)} disabled={index === 0} aria-label="Subir"><ArrowUp size={14} /></button>
                          <button type="button" onClick={() => moveMedia(index, 1)} disabled={index === media.length - 1} aria-label="Descer"><ArrowDown size={14} /></button>
                          <button type="button" onClick={() => removeMedia(item)} aria-label="Remover" className={styles.dangerIcon}><Trash2 size={14} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
