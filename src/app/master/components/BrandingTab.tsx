import React from 'react';
import { Eye, Image as ImageIcon, Palette, Type, Upload } from 'lucide-react';
import { motion } from 'framer-motion';
import styles from '../master.module.css';
import { SIDEBAR_PRESETS } from '../constants';
import type { MasterSettings } from '../types';

interface BrandingTabProps {
  settings: MasterSettings;
  onChange: (key: string, value: string) => void;
  onFileUpload: (key: 'logoUrl' | 'faviconUrl', e: React.ChangeEvent<HTMLInputElement>) => void;
  logoRef: React.RefObject<HTMLInputElement | null>;
  faviconRef: React.RefObject<HTMLInputElement | null>;
  customSidebarColor: string;
  onCustomSidebarColorChange: (value: string) => void;
}

export default function BrandingTab({ settings, onChange, onFileUpload, logoRef, faviconRef, customSidebarColor, onCustomSidebarColorChange }: BrandingTabProps) {
  return (
    <motion.div
      key="branding"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      className={styles.grid}
    >
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <Type size={20} />
          <h2>Identidade do Sistema</h2>
        </div>
        <div className={styles.field}>
          <label>Nome do Sistema</label>
          <input
            type="text"
            value={settings.siteName}
            onChange={e => onChange('siteName', e.target.value)}
            className={styles.input}
          />
        </div>
        <div className={styles.field}>
          <label>Texto do Logo (Fallback)</label>
          <input
            type="text"
            value={settings.logoText}
            onChange={e => onChange('logoText', e.target.value)}
            className={styles.input}
          />
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <ImageIcon size={20} />
          <h2>Logo & Favicon</h2>
        </div>
        <div className={styles.uploadArea}>
          <div className={styles.uploadBox} onClick={() => logoRef.current?.click()}>
            {settings.logoUrl ? <img src={settings.logoUrl} alt="Logo" className={styles.previewImg} /> : <Upload size={24} />}
          </div>
          <input ref={logoRef} type="file" hidden onChange={e => onFileUpload('logoUrl', e)} />
          <div className={styles.uploadBoxSmall} onClick={() => faviconRef.current?.click()}>
            {settings.faviconUrl ? <img src={settings.faviconUrl} alt="Favicon" style={{ width: 24 }} /> : <ImageIcon size={20} />}
          </div>
          <input ref={faviconRef} type="file" hidden onChange={e => onFileUpload('faviconUrl', e)} />
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <Palette size={20} />
          <h2>Paleta de Cores</h2>
        </div>
        <div className={styles.colorGrid}>
          {(['primaryColor', 'accentColor', 'bgColor'] as const).map(key => (
            <div key={key} className={styles.colorItem}>
              <div className={styles.colorPreview} style={{ background: settings[key] }}>
                <input type="color" value={settings[key]} onChange={e => onChange(key, e.target.value)} className={styles.colorInput} />
              </div>
              <span>{key === 'primaryColor' ? 'Primária' : key === 'accentColor' ? 'Destaque' : 'Fundo'}</span>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <Palette size={20} />
          <h2>Background da Sidebar</h2>
        </div>
        <p style={{ fontSize: '0.83rem', opacity: 0.5, marginBottom: '1rem' }}>
          Escolha um preset ou defina uma cor personalizada para o fundo do menu lateral.
        </p>
        <div className={styles.sidebarPresets}>
          {SIDEBAR_PRESETS.map((preset) => {
            const isCustom = preset.value === '__custom__';
            const isActive = settings.sidebarBg === preset.value;
            return (
              <button
                key={preset.label}
                className={`${styles.presetBtn} ${isActive ? styles.presetBtnActive : ''}`}
                onClick={() => onChange('sidebarBg', preset.value)}
                title={preset.label}
              >
                <span
                  className={styles.presetSwatch}
                  style={{
                    background: isCustom ? customSidebarColor : (preset.value || 'var(--panel-bg)'),
                    border: preset.value === '' ? '2px dashed rgba(255,255,255,0.25)' : undefined,
                  }}
                />
                <span className={styles.presetLabel}>{preset.label}</span>
              </button>
            );
          })}
        </div>
        {settings.sidebarBg === '__custom__' && (
          <div className={styles.customColorRow}>
            <label>Cor personalizada</label>
            <div className={styles.colorPreview} style={{ background: customSidebarColor }}>
              <input
                type="color"
                value={customSidebarColor}
                onChange={e => onCustomSidebarColorChange(e.target.value)}
                className={styles.colorInput}
              />
            </div>
            <span style={{ fontSize: '0.8rem', opacity: 0.5 }}>{customSidebarColor}</span>
          </div>
        )}
        {/* Live preview strip */}
        <div className={styles.sidebarPreviewStrip}>
          <div
            className={styles.sidebarPreviewBox}
            style={{
              background: settings.sidebarBg === '__custom__'
                ? customSidebarColor
                : (settings.sidebarBg || 'var(--panel-bg)'),
            }}
          >
            <div className={styles.previewNavItem} />
            <div className={styles.previewNavItem} style={{ opacity: 0.4 }} />
            <div className={styles.previewNavItem} style={{ opacity: 0.4 }} />
            <div className={styles.previewNavItemActive} />
            <div className={styles.previewNavItem} style={{ opacity: 0.4 }} />
          </div>
          <span style={{ fontSize: '0.75rem', opacity: 0.4 }}>Pré-visualização do menu</span>
        </div>
      </div>
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <Eye size={20} />
          <h2>Pré-visualização</h2>
        </div>
        <div className={styles.preview} style={{ background: settings.bgColor }}>
          <div style={{ padding: '20px', color: settings.primaryColor }}>{settings.siteName}</div>
          <div style={{ marginLeft: '20px', padding: '10px 20px', borderRadius: '8px', background: settings.primaryColor, color: '#fff', width: 'fit-content' }}>Botão de Exemplo</div>
        </div>
      </div>
    </motion.div>
  );
}
