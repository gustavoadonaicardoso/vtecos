import { Save, Sparkles, Trash2, X } from 'lucide-react';
import { motion } from 'framer-motion';
import styles from '../master.module.css';
import { BANNER_PRESET_COLORS, BANNER_PRESET_ICONS } from '../constants';
import type { BannerItem } from '../types';

interface BannerEditModalProps {
  banner: BannerItem;
  onUpdateField: (field: keyof BannerItem, value: any) => void;
  onToggleRole: (role: string) => void;
  onClose: () => void;
  onRemove: () => void;
  onSave: () => void;
}

export default function BannerEditModal({ banner, onUpdateField, onToggleRole, onClose, onRemove, onSave }: BannerEditModalProps) {
  const PreviewIcon = BANNER_PRESET_ICONS.find(i => i.id === banner.iconName)?.icon || Sparkles;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(10px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: 20 }}
        style={{ background: 'var(--panel-bg)', border: '1px solid var(--border)', borderRadius: 24, width: '100%', maxWidth: 540, maxHeight: '90vh', overflowY: 'auto', padding: '2rem', position: 'relative' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ fontWeight: 700, fontSize: '1.15rem' }}>Editar Banner</h2>
          <button style={{ background: 'rgba(128,128,128,0.1)', border: 'none', borderRadius: '50%', width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--foreground)' }} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Título e Tipo */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, opacity: 0.6, display: 'block', marginBottom: 6 }}>Título</label>
              <input
                value={banner.title}
                onChange={e => onUpdateField('title', e.target.value)}
                className={styles.input}
                placeholder="Título do banner"
              />
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, opacity: 0.6, display: 'block', marginBottom: 6 }}>Tipo / Badge</label>
              <input
                value={banner.type}
                onChange={e => onUpdateField('type', e.target.value)}
                className={styles.input}
                placeholder="Ex: Comunicado"
              />
            </div>
          </div>

          {/* Descrição */}
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 700, opacity: 0.6, display: 'block', marginBottom: 6 }}>Descrição</label>
            <textarea
              value={banner.description}
              onChange={e => onUpdateField('description', e.target.value)}
              className={styles.input}
              rows={3}
              style={{ resize: 'vertical', width: '100%' }}
              placeholder="Descrição curta para o card..."
            />
          </div>

          {/* Data */}
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 700, opacity: 0.6, display: 'block', marginBottom: 6 }}>Data de Exibição</label>
            <input
              value={banner.date}
              onChange={e => onUpdateField('date', e.target.value)}
              className={styles.input}
              placeholder="Ex: 23 Mai 2026"
            />
          </div>

          {/* Audiência (target_roles) */}
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 700, opacity: 0.6, display: 'block', marginBottom: 10 }}>Audiência (quem vê este banner)</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {(['ADMIN', 'MANAGER', 'SELLER'] as const).map(role => {
                const isSelected = (banner.target_roles ?? []).includes(role);
                return (
                  <button
                    key={role}
                    type="button"
                    onClick={() => onToggleRole(role)}
                    style={{
                      padding: '6px 16px', borderRadius: 100, border: '1px solid',
                      fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer',
                      transition: 'all 0.15s',
                      background: isSelected ? 'var(--accent)' : 'rgba(128,128,128,0.08)',
                      borderColor: isSelected ? 'var(--accent)' : 'var(--border)',
                      color: isSelected ? 'white' : 'var(--foreground)',
                    }}
                  >
                    {role}
                  </button>
                );
              })}
              <span style={{ fontSize: '0.78rem', opacity: 0.45, alignSelf: 'center' }}>
                {(banner.target_roles ?? []).length === 0 ? '→ Nenhum selecionado = todos verão' : ''}
              </span>
            </div>
          </div>

          {/* Cores */}
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 700, opacity: 0.6, display: 'block', marginBottom: 10 }}>Cor do Card</label>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {BANNER_PRESET_COLORS.map(c => (
                <div
                  key={c}
                  onClick={() => onUpdateField('color', c)}
                  style={{
                    width: 36, height: 36, borderRadius: 10, background: c, cursor: 'pointer',
                    border: banner.color === c ? '3px solid white' : '3px solid transparent',
                    boxShadow: banner.color === c ? '0 0 0 2px var(--accent)' : 'none',
                    transition: 'all 0.15s',
                  }}
                />
              ))}
            </div>
          </div>

          {/* Ícones */}
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 700, opacity: 0.6, display: 'block', marginBottom: 10 }}>Ícone</label>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {BANNER_PRESET_ICONS.map(({ id, icon: Ico }) => (
                <div
                  key={id}
                  onClick={() => onUpdateField('iconName', id)}
                  style={{
                    width: 40, height: 40, borderRadius: 10,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', transition: 'all 0.15s',
                    background: banner.iconName === id ? 'var(--accent)' : 'rgba(128,128,128,0.08)',
                    border: banner.iconName === id ? '1px solid var(--accent)' : '1px solid var(--border)',
                    color: banner.iconName === id ? 'white' : 'var(--foreground)',
                  }}
                >
                  <Ico size={18} />
                </div>
              ))}
            </div>
          </div>

          {/* Preview */}
          <div style={{ borderRadius: 16, padding: '1.25rem', background: banner.color, color: 'white', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', right: -8, bottom: -12, opacity: 0.12, transform: 'rotate(-12deg)' }}>
              <PreviewIcon size={80} />
            </div>
            <span style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', background: 'rgba(255,255,255,0.2)', padding: '3px 10px', borderRadius: 100 }}>{banner.type}</span>
            <h3 style={{ marginTop: 10, marginBottom: 6, fontWeight: 700 }}>{banner.title}</h3>
            <p style={{ fontSize: '0.82rem', opacity: 0.9 }}>{banner.description}</p>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border)' }}>
          <button
            onClick={onRemove}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 10, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', cursor: 'pointer', fontWeight: 700 }}
          >
            <Trash2 size={16} /> Remover
          </button>
          <button
            onClick={onSave}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 22px', borderRadius: 10, background: 'var(--accent)', border: 'none', color: 'white', cursor: 'pointer', fontWeight: 700 }}
          >
            <Save size={16} /> Salvar Banner
          </button>
        </div>
      </motion.div>
    </div>
  );
}
