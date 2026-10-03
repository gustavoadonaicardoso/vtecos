import { useEffect, useState } from 'react';
import { Loader2, Save, Sparkles, Trash2, X } from 'lucide-react';
import { motion } from 'framer-motion';
import styles from '../master.module.css';
import { BANNER_PRESET_COLORS, BANNER_PRESET_ICONS } from '../constants';
import type { BannerItem } from '../types';

interface BannerEditModalProps {
  banner: BannerItem;
  onClose: () => void;
  /** Devolve a mensagem de erro, ou null se salvou. */
  onSave: (banner: BannerItem) => Promise<string | null>;
  onRemove: (banner: BannerItem) => Promise<string | null>;
}

const ROLES = [
  { value: 'ADMIN', label: 'Administradores' },
  { value: 'MANAGER', label: 'Gerentes' },
  { value: 'SELLER', label: 'Vendedores' },
];

/**
 * Edita uma cópia do banner: nada muda na lista até salvar, e fechar
 * descarta a edição (ou o banner novo que ainda não foi gravado).
 */
export default function BannerEditModal({ banner, onClose, onSave, onRemove }: BannerEditModalProps) {
  const [draft, setDraft] = useState<BannerItem>(banner);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const PreviewIcon = BANNER_PRESET_ICONS.find(i => i.id === draft.iconName)?.icon || Sparkles;
  const isNew = !banner.id;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const set = <K extends keyof BannerItem>(field: K, value: BannerItem[K]) => setDraft(prev => ({ ...prev, [field]: value }));

  const toggleRole = (role: string) => {
    const current = draft.target_roles ?? [];
    set('target_roles', current.includes(role) ? current.filter(r => r !== role) : [...current, role]);
  };

  const run = async (action: () => Promise<string | null>) => {
    setBusy(true);
    setError('');
    const message = await action();
    setBusy(false);
    if (message) setError(message);
  };

  const save = () => {
    if (!draft.title.trim()) { setError('Informe o título do banner.'); return; }
    run(() => onSave({ ...draft, title: draft.title.trim() }));
  };

  const remove = () => {
    if (!confirm('Remover este banner permanentemente?')) return;
    run(() => onRemove(draft));
  };

  return (
    <div className={styles.overlay} onClick={() => !busy && onClose()}>
      <motion.div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="banner-modal-title"
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 16 }}
        onClick={e => e.stopPropagation()}
      >
        <div className={styles.modalHead}>
          <h2 id="banner-modal-title">{isNew ? 'Novo banner' : 'Editar banner'}</h2>
          <button className={styles.iconButton} onClick={onClose} disabled={busy} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        {error && <div className={styles.errorBanner}>{error}</div>}

        <div className={styles.formRow2}>
          <div className={styles.field}>
            <label htmlFor="banner-title">Título</label>
            <input id="banner-title" value={draft.title} maxLength={80} onChange={e => set('title', e.target.value)} className={styles.input} placeholder="Título do banner" />
          </div>
          <div className={styles.field}>
            <label htmlFor="banner-type">Selo</label>
            <input id="banner-type" value={draft.type} maxLength={30} onChange={e => set('type', e.target.value)} className={styles.input} placeholder="Ex: Comunicado" />
          </div>
        </div>

        <div className={styles.field}>
          <label htmlFor="banner-description">Descrição</label>
          <textarea
            id="banner-description"
            value={draft.description}
            maxLength={280}
            onChange={e => set('description', e.target.value)}
            className={styles.input}
            rows={3}
            style={{ resize: 'vertical' }}
            placeholder="Texto curto exibido no card"
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="banner-date">Data exibida</label>
          <input id="banner-date" value={draft.date} maxLength={30} onChange={e => set('date', e.target.value)} className={styles.input} placeholder="Ex: 23 Mai 2026" />
        </div>

        <div className={styles.field}>
          <span className={styles.fieldLabel}>Quem vê (nenhum marcado = todos)</span>
          <div className={styles.chipRow}>
            {ROLES.map(role => (
              <button
                key={role.value}
                type="button"
                className={`${styles.chip} ${(draft.target_roles ?? []).includes(role.value) ? styles.chipActive : ''}`}
                onClick={() => toggleRole(role.value)}
              >
                {role.label}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.field}>
          <span className={styles.fieldLabel}>Cor do card</span>
          <div className={styles.swatchRow}>
            {BANNER_PRESET_COLORS.map(color => (
              <button
                key={color}
                type="button"
                aria-label="Escolher cor"
                className={`${styles.swatch} ${draft.color === color ? styles.swatchActive : ''}`}
                style={{ background: color }}
                onClick={() => set('color', color)}
              />
            ))}
          </div>
        </div>

        <div className={styles.field}>
          <span className={styles.fieldLabel}>Ícone</span>
          <div className={styles.swatchRow}>
            {BANNER_PRESET_ICONS.map(({ id, icon: Ico }) => (
              <button
                key={id}
                type="button"
                aria-label={`Ícone ${id}`}
                className={`${styles.iconChoice} ${draft.iconName === id ? styles.iconChoiceActive : ''}`}
                onClick={() => set('iconName', id)}
              >
                <Ico size={18} />
              </button>
            ))}
          </div>
        </div>

        <div className={styles.bannerCard} style={{ background: draft.color, cursor: 'default', transform: 'none' }}>
          <div className={styles.bannerBgIcon}><PreviewIcon size={90} /></div>
          <div className={styles.bannerTop}>
            <span className={styles.bannerBadge}>{draft.type || 'Selo'}</span>
            <span style={{ fontSize: '0.72rem', opacity: 0.85 }}>{draft.date}</span>
          </div>
          <h3>{draft.title || 'Título'}</h3>
          <p>{draft.description}</p>
        </div>

        <div className={styles.modalActions}>
          {isNew ? <span /> : (
            <button className={styles.dangerBtn} onClick={remove} disabled={busy}>
              <Trash2 size={16} /> Remover
            </button>
          )}
          <div className={styles.actionButtons}>
            <button className={styles.resetBtn} onClick={onClose} disabled={busy}>Cancelar</button>
            <button className={styles.saveBtn} onClick={save} disabled={busy}>
              {busy ? <Loader2 size={16} className={styles.spin} /> : <Save size={16} />} Salvar banner
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
