import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Loader2, Save, Sparkles, Trash2, X } from 'lucide-react';
import { motion } from 'framer-motion';
import styles from '../master.module.css';
import { BANNER_PRESET_COLORS, BANNER_PRESET_ICONS } from '../constants';
import { AUDIENCE_LABEL, BANNER_DESTINATIONS, type BannerAudience } from '@/lib/banners';
import { PLAN_MODULES } from '@/lib/plans';
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

/** ISO → valor de <input type="datetime-local"> no horário local. */
const toLocalInput = (iso: string) => {
  if (!iso) return '';
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
const fromLocalInput = (value: string) => (value ? new Date(value).toISOString() : '');

type DestinationKind = 'none' | 'module' | 'custom';
const destinationKind = (url: string): DestinationKind => (!url ? 'none' : BANNER_DESTINATIONS.some((item) => item.path === url) ? 'module' : 'custom');

/**
 * Edita uma cópia do banner: nada muda na lista até salvar, e fechar
 * descarta a edição (ou o banner novo que ainda não foi gravado).
 */
export default function BannerEditModal({ banner, onClose, onSave, onRemove }: BannerEditModalProps) {
  const [draft, setDraft] = useState<BannerItem>(banner);
  const [kind, setKind] = useState<DestinationKind>(destinationKind(banner.linkUrl));
  const [tenants, setTenants] = useState<{ id: string; name: string; is_platform?: boolean }[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const PreviewIcon = BANNER_PRESET_ICONS.find(i => i.id === draft.iconName)?.icon || Sparkles;
  const isNew = !banner.id;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  // Empresas para o público "Empresas escolhidas".
  useEffect(() => {
    fetch('/api/tenants', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((json) => { const list = json?.data ?? json; if (Array.isArray(list)) setTenants(list); })
      .catch(() => undefined);
  }, []);

  const set = <K extends keyof BannerItem>(field: K, value: BannerItem[K]) => setDraft(prev => ({ ...prev, [field]: value }));
  const toggle = (field: 'target_roles' | 'targetModules' | 'targetTenants', value: string) => {
    const current = draft[field] ?? [];
    set(field, current.includes(value) ? current.filter(item => item !== value) : [...current, value]);
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
    if (kind === 'custom' && !draft.linkUrl.trim()) { setError('Informe o link do botão.'); return; }
    run(() => onSave({ ...draft, title: draft.title.trim(), linkUrl: kind === 'none' ? '' : draft.linkUrl.trim() }));
  };

  const remove = () => {
    if (!confirm('Remover este banner permanentemente?')) return;
    run(() => onRemove(draft));
  };

  const uploadImage = async (file: File) => {
    setUploading(true);
    setError('');
    const body = new FormData();
    body.append('file', file);
    const response = await fetch('/api/master/banners/upload', { method: 'POST', body });
    const json = await response.json().catch(() => ({}));
    setUploading(false);
    if (!response.ok) { setError(json.error || 'Não foi possível enviar a imagem.'); return; }
    set('imageUrl', json.data.url);
  };

  const background = draft.imageUrl
    ? `linear-gradient(90deg, rgba(2,6,23,.78), rgba(2,6,23,.25)), url("${draft.imageUrl}") center/cover`
    : draft.color;

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

        {/* Prévia */}
        <div className={styles.bannerCard} style={{ background, cursor: 'default', transform: 'none' }}>
          {!draft.imageUrl && <div className={styles.bannerBgIcon}><PreviewIcon size={90} /></div>}
          <div className={styles.bannerTop}>
            <span className={styles.bannerBadge}>{draft.type || 'Selo'}</span>
            {draft.date && <span style={{ fontSize: '0.72rem', opacity: 0.85 }}>{draft.date}</span>}
          </div>
          <h3>{draft.title || 'Título'}</h3>
          <p>{draft.description}</p>
          {kind !== 'none' && <span className={styles.previewBtn}>{draft.buttonLabel || 'Saiba mais'} →</span>}
        </div>

        {error && <div className={styles.errorBanner}>{error}</div>}

        <div className={styles.formRow2}>
          <div className={styles.field}>
            <label htmlFor="banner-title">Título</label>
            <input id="banner-title" value={draft.title} maxLength={80} onChange={e => set('title', e.target.value)} className={styles.input} placeholder="Ex.: Novo portal de chamados" />
          </div>
          <div className={styles.field}>
            <label htmlFor="banner-type">Selo</label>
            <input id="banner-type" value={draft.type} maxLength={30} onChange={e => set('type', e.target.value)} className={styles.input} placeholder="Ex.: Novidade" />
          </div>
        </div>

        <div className={styles.field}>
          <label htmlFor="banner-description">Texto</label>
          <textarea id="banner-description" value={draft.description} maxLength={280} onChange={e => set('description', e.target.value)} className={styles.input} rows={3} style={{ resize: 'vertical' }} placeholder="Ex.: Abra e acompanhe seus pedidos de suporte direto pelo sistema." />
        </div>

        <div className={styles.bannerSection}>
          <h4>Botão</h4>
          <div className={styles.formRow2}>
            <div className={styles.field}>
              <label htmlFor="banner-dest">Leva para</label>
              <select
                id="banner-dest"
                className={styles.input}
                value={kind === 'module' ? draft.linkUrl : kind}
                onChange={e => {
                  const value = e.target.value;
                  if (value === 'none') { setKind('none'); set('linkUrl', ''); }
                  else if (value === 'custom') { setKind('custom'); set('linkUrl', ''); }
                  else { setKind('module'); set('linkUrl', value); }
                }}
              >
                <option value="none">Sem botão (só informativo)</option>
                <optgroup label="Módulos do sistema">
                  {BANNER_DESTINATIONS.map(item => <option key={item.path} value={item.path}>{item.label}</option>)}
                </optgroup>
                <option value="custom">Outro endereço ou link externo…</option>
              </select>
            </div>
            {kind !== 'none' && (
              <div className={styles.field}>
                <label htmlFor="banner-button">Texto do botão</label>
                <input id="banner-button" value={draft.buttonLabel} maxLength={30} onChange={e => set('buttonLabel', e.target.value)} className={styles.input} placeholder="Saiba mais" />
              </div>
            )}
          </div>
          {kind === 'custom' && (
            <div className={styles.field}>
              <label htmlFor="banner-link">Endereço</label>
              <input id="banner-link" value={draft.linkUrl} maxLength={500} onChange={e => set('linkUrl', e.target.value)} className={styles.input} placeholder="/help/chamados-suporte ou https://vorticetecnologia.com.br" />
            </div>
          )}
        </div>

        <div className={styles.bannerSection}>
          <h4>Visual</h4>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Imagem de fundo (opcional, 1200×400 fica ótimo)</span>
            <div className={styles.imageRow}>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={e => { const file = e.target.files?.[0]; if (file) void uploadImage(file); e.target.value = ''; }} />
              <button type="button" className={styles.chip} onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? <Loader2 size={14} className={styles.spin} /> : <ImagePlus size={14} />} {draft.imageUrl ? 'Trocar imagem' : 'Enviar imagem'}
              </button>
              {draft.imageUrl && <button type="button" className={styles.chip} onClick={() => set('imageUrl', '')}>Tirar imagem</button>}
            </div>
          </div>
          {!draft.imageUrl && (
            <>
              <div className={styles.field}>
                <span className={styles.fieldLabel}>Cor</span>
                <div className={styles.swatchRow}>
                  {BANNER_PRESET_COLORS.map(color => (
                    <button key={color} type="button" aria-label="Escolher cor" className={`${styles.swatch} ${draft.color === color ? styles.swatchActive : ''}`} style={{ background: color }} onClick={() => set('color', color)} />
                  ))}
                </div>
              </div>
              <div className={styles.field}>
                <span className={styles.fieldLabel}>Ícone</span>
                <div className={styles.swatchRow}>
                  {BANNER_PRESET_ICONS.map(({ id, icon: Ico }) => (
                    <button key={id} type="button" aria-label={`Ícone ${id}`} className={`${styles.iconChoice} ${draft.iconName === id ? styles.iconChoiceActive : ''}`} onClick={() => set('iconName', id)}>
                      <Ico size={18} />
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
          <div className={styles.field}>
            <label htmlFor="banner-date">Texto de data (opcional)</label>
            <input id="banner-date" value={draft.date} maxLength={30} onChange={e => set('date', e.target.value)} className={styles.input} placeholder="Ex.: 15 Out · 19h" />
          </div>
        </div>

        <div className={styles.bannerSection}>
          <h4>Quem vê</h4>
          <div className={styles.chipRow}>
            {(Object.keys(AUDIENCE_LABEL) as BannerAudience[]).map(value => (
              <button key={value} type="button" className={`${styles.chip} ${draft.audience === value ? styles.chipActive : ''}`} onClick={() => set('audience', value)}>
                {AUDIENCE_LABEL[value]}
              </button>
            ))}
          </div>
          {draft.audience === 'tenants' && (
            <div className={styles.tenantPick}>
              {tenants.filter(tenant => !tenant.is_platform).map(tenant => (
                <label key={tenant.id}>
                  <input type="checkbox" checked={draft.targetTenants.includes(tenant.id)} onChange={() => toggle('targetTenants', tenant.id)} />
                  {tenant.name}
                </label>
              ))}
              {tenants.length === 0 && <span className={styles.hint}>Carregando empresas...</span>}
            </div>
          )}
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Só para empresas com o módulo (nenhum marcado = qualquer plano)</span>
            <div className={styles.chipRow}>
              {PLAN_MODULES.map(module => (
                <button key={module.key} type="button" className={`${styles.chip} ${draft.targetModules.includes(module.key) ? styles.chipActive : ''}`} onClick={() => toggle('targetModules', module.key)}>
                  {module.label}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Cargos (nenhum marcado = todos)</span>
            <div className={styles.chipRow}>
              {ROLES.map(role => (
                <button key={role.value} type="button" className={`${styles.chip} ${(draft.target_roles ?? []).includes(role.value) ? styles.chipActive : ''}`} onClick={() => toggle('target_roles', role.value)}>
                  {role.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className={styles.bannerSection}>
          <h4>Quando</h4>
          <div className={styles.formRow2}>
            <div className={styles.field}>
              <label htmlFor="banner-start">Começa em (vazio = agora)</label>
              <input id="banner-start" type="datetime-local" className={styles.input} value={toLocalInput(draft.startsAt)} onChange={e => set('startsAt', fromLocalInput(e.target.value))} />
            </div>
            <div className={styles.field}>
              <label htmlFor="banner-end">Termina em (vazio = sem fim)</label>
              <input id="banner-end" type="datetime-local" className={styles.input} value={toLocalInput(draft.endsAt)} onChange={e => set('endsAt', fromLocalInput(e.target.value))} />
            </div>
          </div>
          <label className={styles.toggleRow}>
            <input type="checkbox" checked={draft.active} onChange={e => set('active', e.target.checked)} />
            Ligado (desligue para tirar do ar sem apagar)
          </label>
          <label className={styles.toggleRow}>
            <input type="checkbox" checked={draft.dismissible} onChange={e => set('dismissible', e.target.checked)} />
            O usuário pode fechar este banner
          </label>
        </div>

        <div className={styles.modalActions}>
          {isNew ? <span /> : (
            <button className={styles.dangerBtn} onClick={remove} disabled={busy}>
              <Trash2 size={16} /> Remover
            </button>
          )}
          <div className={styles.actionButtons}>
            <button className={styles.resetBtn} onClick={onClose} disabled={busy}>Cancelar</button>
            <button className={styles.saveBtn} onClick={save} disabled={busy || uploading}>
              {busy ? <Loader2 size={16} className={styles.spin} /> : <Save size={16} />} {isNew ? 'Publicar banner' : 'Salvar banner'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
