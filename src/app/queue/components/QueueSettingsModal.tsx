'use client';

import React, { useRef, useState } from 'react';
import { Clapperboard, ImagePlus, Loader2, Trash2, X } from 'lucide-react';
import styles from '../queue.module.css';
import type { QueueSettings } from '@/lib/queue';

interface Props {
  settings: QueueSettings;
  onSaved: (settings: QueueSettings) => void;
  onOpenMedia: () => void;
  onClose: () => void;
}

const DESK_LABELS = ['Guichê', 'Mesa', 'Sala', 'Caixa', 'Consultório', 'Balcão'];

export default function QueueSettingsModal({ settings, onSaved, onOpenMedia, onClose }: Props) {
  const [draft, setDraft] = useState(settings);
  const [busy, setBusy] = useState<'save' | 'logo' | null>(null);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof QueueSettings>(key: K, value: QueueSettings[K]) => setDraft((current) => ({ ...current, [key]: value }));

  const save = async () => {
    setBusy('save');
    setError('');
    const response = await fetch('/api/queue/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) });
    const json = await response.json().catch(() => ({}));
    setBusy(null);
    if (!response.ok) return setError(json.error || 'Não foi possível salvar.');
    onSaved(json.data);
  };

  const uploadLogo = async (file: File) => {
    setBusy('logo');
    setError('');
    const body = new FormData();
    body.append('file', file);
    const response = await fetch('/api/queue/settings/logo', { method: 'POST', body });
    const json = await response.json().catch(() => ({}));
    setBusy(null);
    if (!response.ok) return setError(json.error || 'Não foi possível enviar a logo.');
    set('logoUrl', json.data.url);
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Configurações da fila">
        <header className={styles.modalHead}>
          <h2>Configurações da fila</h2>
          <button type="button" className={styles.iconBtn} onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </header>

        <div className={styles.modalBody}>
          <section className={styles.formSection}>
            <h3>Totem e TV</h3>
            <div className={styles.logoRow}>
              <div className={styles.logoPreview} style={{ borderColor: draft.primaryColor }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={draft.logoUrl || '/brand/vortice-logo.png'} alt="Logo" />
              </div>
              <div className={styles.logoActions}>
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden onChange={(e) => { const file = e.target.files?.[0]; if (file) void uploadLogo(file); e.target.value = ''; }} />
                <button type="button" className={styles.secondaryBtn} onClick={() => fileRef.current?.click()} disabled={busy !== null}>
                  {busy === 'logo' ? <Loader2 size={15} className={styles.spin} /> : <ImagePlus size={15} />} {draft.logoUrl ? 'Trocar logo' : 'Enviar logo'}
                </button>
                {draft.logoUrl && <button type="button" className={styles.linkDanger} onClick={() => set('logoUrl', '')}><Trash2 size={13} /> Usar a logo padrão</button>}
                <small>PNG, JPG, WEBP ou SVG até 2 MB. Fundo transparente fica melhor.</small>
              </div>
            </div>
            <label className={styles.field}>
              <span>Nome exibido</span>
              <input className={styles.input} value={draft.appName} maxLength={80} onChange={(e) => set('appName', e.target.value)} placeholder="Nome da empresa" />
            </label>
            <div className={styles.row2}>
              <label className={styles.field}>
                <span>Cor principal</span>
                <span className={styles.colorField}>
                  <input type="color" value={draft.primaryColor} onChange={(e) => set('primaryColor', e.target.value)} aria-label="Cor principal" />
                  <input className={styles.input} value={draft.primaryColor} maxLength={7} onChange={(e) => set('primaryColor', e.target.value)} />
                </span>
              </label>
              <label className={styles.field}>
                <span>Recado no rodapé da TV</span>
                <input className={styles.input} value={draft.welcomeText} maxLength={140} onChange={(e) => set('welcomeText', e.target.value)} placeholder="Atenção ao número chamado no painel" />
              </label>
            </div>
          </section>

          <section className={styles.formSection}>
            <h3>Atendimento</h3>
            <div className={styles.row2}>
              <label className={styles.field}>
                <span>Quantidade de pontos de atendimento</span>
                <input className={styles.input} type="number" min={1} max={99} value={draft.totalDesks} onChange={(e) => set('totalDesks', Number(e.target.value))} />
              </label>
              <label className={styles.field}>
                <span>Como chamar cada ponto</span>
                <select className={styles.input} value={DESK_LABELS.includes(draft.deskLabel) ? draft.deskLabel : 'Guichê'} onChange={(e) => set('deskLabel', e.target.value)}>
                  {DESK_LABELS.map((label) => <option key={label} value={label}>{label} 01</option>)}
                </select>
              </label>
            </div>
            <label className={styles.toggle}>
              <input type="checkbox" checked={draft.priorityEnabled} onChange={(e) => set('priorityEnabled', e.target.checked)} />
              <span>
                <strong>Senha preferencial no totem</strong>
                <small>Idosos, gestantes, pessoas com deficiência ou com criança de colo (Lei 10.048). Preferenciais são chamadas primeiro.</small>
              </span>
            </label>
            <label className={styles.toggle}>
              <input type="checkbox" checked={draft.voiceEnabled} onChange={(e) => set('voiceEnabled', e.target.checked)} />
              <span>
                <strong>TV fala a senha chamada</strong>
                <small>Além do aviso sonoro, a TV lê em voz alta: &quot;Senha 12, guichê 3&quot;.</small>
              </span>
            </label>
          </section>

          <button type="button" className={styles.mediaLink} onClick={onOpenMedia}>
            <Clapperboard size={16} /> Imagens e vídeos na TV entre as chamadas
          </button>

          {error && <div className={styles.errorBox}>{error}</div>}
        </div>

        <footer className={styles.modalFoot}>
          <button type="button" className={styles.secondaryBtn} onClick={onClose}>Cancelar</button>
          <button type="button" className={styles.primaryBtn} onClick={save} disabled={busy !== null}>
            {busy === 'save' && <Loader2 size={15} className={styles.spin} />} Salvar
          </button>
        </footer>
      </div>
    </div>
  );
}
