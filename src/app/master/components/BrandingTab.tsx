import React from 'react';
import { Eye, Image as ImageIcon, PanelLeft, Palette, Trash2, Type, Upload } from 'lucide-react';
import { motion } from 'framer-motion';
import styles from '../master.module.css';
import { SIDEBAR_PRESETS } from '../constants';
import type { MasterSettings } from '../types';

type ImageKey = 'logoUrl' | 'faviconUrl';

interface BrandingTabProps {
  settings: MasterSettings;
  onChange: (key: keyof MasterSettings, value: string) => void;
  onFileUpload: (key: ImageKey, e: React.ChangeEvent<HTMLInputElement>) => void;
  logoRef: React.RefObject<HTMLInputElement | null>;
  faviconRef: React.RefObject<HTMLInputElement | null>;
  customSidebarColor: string;
  onCustomSidebarColorChange: (value: string) => void;
}

export default function BrandingTab({ settings, onChange, onFileUpload, logoRef, faviconRef, customSidebarColor, onCustomSidebarColorChange }: BrandingTabProps) {
  const sidebarBackground = settings.sidebarBg === '__custom__' ? customSidebarColor : settings.sidebarBg;

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
          <h2>Nome do sistema</h2>
        </div>
        <p className={styles.hint}>Aparece na aba do navegador e como texto alternativo do logo.</p>
        <div className={styles.field}>
          <label htmlFor="master-site-name">Nome</label>
          <input
            id="master-site-name"
            type="text"
            value={settings.siteName}
            maxLength={60}
            onChange={e => onChange('siteName', e.target.value)}
            className={styles.input}
          />
        </div>

        <div className={styles.cardHeader} style={{ marginTop: 24 }}>
          <Palette size={20} />
          <h2>Cor principal</h2>
        </div>
        <div className={styles.colorItem}>
          <div className={styles.colorPreview} style={{ background: settings.primaryColor }}>
            <input
              type="color"
              value={settings.primaryColor}
              onChange={e => onChange('primaryColor', e.target.value)}
              className={styles.colorInput}
              aria-label="Cor principal"
            />
          </div>
          <div>
            <strong>{settings.primaryColor.toUpperCase()}</strong>
            <small style={{ display: 'block' }}>Botões, links, abas ativas e destaques do sistema inteiro.</small>
          </div>
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <ImageIcon size={20} />
          <h2>Logo e favicon</h2>
        </div>
        <p className={styles.hint}>
          PNG, JPG, SVG ou WEBP. Logo até 300 KB (aparece no topo do menu); favicon até 100 KB (ícone da aba).
          Sem logo, o sistema usa o da Vórtice.
        </p>
        <div className={styles.uploadArea}>
          <button type="button" className={styles.uploadBox} onClick={() => logoRef.current?.click()}>
            {settings.logoUrl
              ? <img src={settings.logoUrl} alt="Logo" className={styles.previewImg} />
              : <><Upload size={22} /> Enviar logo</>}
          </button>
          <button type="button" className={styles.uploadBox} onClick={() => faviconRef.current?.click()}>
            {settings.faviconUrl
              ? <img src={settings.faviconUrl} alt="Favicon" style={{ width: 32, height: 32, objectFit: 'contain' }} />
              : <><ImageIcon size={20} /> Favicon</>}
          </button>
          <input ref={logoRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" hidden onChange={e => onFileUpload('logoUrl', e)} />
          <input ref={faviconRef} type="file" accept="image/png,image/x-icon,image/vnd.microsoft.icon,image/svg+xml,image/webp" hidden onChange={e => onFileUpload('faviconUrl', e)} />
        </div>
        {(settings.logoUrl || settings.faviconUrl) && (
          <div className={styles.actionButtons} style={{ marginTop: 12 }}>
            {settings.logoUrl && (
              <button type="button" className={styles.ghostBtn} onClick={() => onChange('logoUrl', '')}>
                <Trash2 size={14} /> Remover logo
              </button>
            )}
            {settings.faviconUrl && (
              <button type="button" className={styles.ghostBtn} onClick={() => onChange('faviconUrl', '')}>
                <Trash2 size={14} /> Remover favicon
              </button>
            )}
          </div>
        )}
      </div>

      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <PanelLeft size={20} />
          <h2>Fundo do menu lateral</h2>
        </div>
        <p className={styles.hint}>&quot;Padrão&quot; acompanha o tema claro/escuro de cada usuário.</p>
        <div className={styles.sidebarPresets}>
          {SIDEBAR_PRESETS.map((preset) => {
            const isCustom = preset.value === '__custom__';
            const isActive = settings.sidebarBg === preset.value;
            return (
              <button
                key={preset.label}
                type="button"
                className={`${styles.presetBtn} ${isActive ? styles.presetBtnActive : ''}`}
                onClick={() => onChange('sidebarBg', preset.value)}
                title={preset.label}
              >
                <span
                  className={styles.presetSwatch}
                  style={{
                    background: isCustom ? customSidebarColor : (preset.value || 'var(--panel-bg)'),
                    borderStyle: preset.value === '' ? 'dashed' : undefined,
                  }}
                />
                <span className={styles.presetLabel}>{preset.label}</span>
              </button>
            );
          })}
        </div>
        {settings.sidebarBg === '__custom__' && (
          <div className={styles.customColorRow}>
            <label htmlFor="master-sidebar-color">Cor personalizada</label>
            <div className={styles.colorPreview} style={{ background: customSidebarColor }}>
              <input
                id="master-sidebar-color"
                type="color"
                value={customSidebarColor}
                onChange={e => onCustomSidebarColorChange(e.target.value)}
                className={styles.colorInput}
              />
            </div>
            <strong>{customSidebarColor.toUpperCase()}</strong>
          </div>
        )}
      </div>

      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <Eye size={20} />
          <h2>Pré-visualização</h2>
        </div>
        <div className={styles.livePreview}>
          <div className={styles.livePreviewSidebar} style={sidebarBackground ? { background: sidebarBackground } : undefined}>
            <div className={styles.livePreviewLogo} style={{ color: settings.primaryColor }}>
              {settings.logoUrl ? <img src={settings.logoUrl} alt="" /> : settings.siteName}
            </div>
            <div className={styles.previewNavItem} style={{ background: settings.primaryColor }} />
            <div className={styles.previewNavItem} />
            <div className={styles.previewNavItem} />
            <div className={styles.previewNavItem} />
          </div>
          <div className={styles.livePreviewMain}>
            <strong>{settings.siteName || 'Sem nome'}</strong>
            <div className={styles.previewNavItem} style={{ width: '70%' }} />
            <div className={styles.previewNavItem} style={{ width: '45%' }} />
            <div className={styles.previewButtons}>
              <span className={styles.previewButton} style={{ background: settings.primaryColor }}>Botão principal</span>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
