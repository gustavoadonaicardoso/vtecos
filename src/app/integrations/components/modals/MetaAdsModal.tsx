import { LayoutGrid, MessageCircle, Camera, X, Lock, Globe } from 'lucide-react';
import styles from '../../integrations.module.css';
import type { MetaConfig, SaveStatus } from '../../constants';

interface MetaAdsModalProps {
  metaConfig: MetaConfig;
  onMetaConfigChange: (config: MetaConfig) => void;
  saveStatus: SaveStatus;
  originUrl: string;
  onSave: () => void;
  onClose: () => void;
}

export default function MetaAdsModal({
  metaConfig,
  onMetaConfigChange,
  saveStatus,
  originUrl,
  onSave,
  onClose,
}: MetaAdsModalProps) {
  return (
    <>
      <div className={styles.modalHeader}>
        <div className={styles.modalTitle}>
          <div className={styles.iconBox} style={{ width: 40, height: 40, background: '#1877F222', color: '#1877F2' }}>
            <LayoutGrid size={20} />
          </div>
          <div>
            <span style={{ fontSize: '1.1rem', display: 'block' }}>Configuração Meta Messaging</span>
            <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>Messenger & Instagram Direct API</span>
          </div>
        </div>
        <button className={styles.closeBtn} onClick={onClose}><X size={20} /></button>
      </div>
      <div className={styles.modalBody}>
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
          <div style={{ flex: 1, padding: '1rem', background: 'rgba(24, 119, 242, 0.05)', borderRadius: '12px', border: '1px solid rgba(24, 119, 242, 0.2)', textAlign: 'center' }}>
            <MessageCircle size={20} color="#1877F2" style={{ marginBottom: '8px' }} />
            <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>Messenger</div>
            <div style={{ fontSize: '0.75rem', opacity: 0.6 }}>Ativo via Page API</div>
          </div>
          <div style={{ flex: 1, padding: '1rem', background: 'rgba(225, 48, 108, 0.05)', borderRadius: '12px', border: '1px solid rgba(225, 48, 108, 0.2)', textAlign: 'center' }}>
            <Camera size={20} color="#E1306C" style={{ marginBottom: '8px' }} />
            <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>Instagram</div>
            <div style={{ fontSize: '0.75rem', opacity: 0.6 }}>Ativo via Graph API</div>
          </div>
        </div>

        <div className={styles.formGrid}>
          <div className={styles.formGroup}>
            <label>Page Access Token (Token da Página)</label>
            <div className={styles.inputWrapper}>
              <input
                type="password"
                name="meta-page-token"
                autoComplete="new-password"
                placeholder="EAAO..."
                className={styles.premiumInput}
                value={metaConfig.pageToken || ''}
                onChange={(e) => onMetaConfigChange({ ...metaConfig, pageToken: e.target.value })}
              />
              <Lock size={14} className={styles.inputIcon} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className={styles.formGroup}>
              <label>ID da Página Facebook</label>
              <input
                type="text"
                name="meta-page-id"
                autoComplete="off"
                placeholder="Ex: 1045..."
                className={styles.premiumInput}
                value={metaConfig.pageId || ''}
                onChange={(e) => onMetaConfigChange({ ...metaConfig, pageId: e.target.value })}
              />
            </div>
            <div className={styles.formGroup}>
              <label>ID Instagram Business</label>
              <input
                type="text"
                name="meta-ig-id"
                autoComplete="off"
                placeholder="Ex: 1784..."
                className={styles.premiumInput}
                value={metaConfig.instagramId || ''}
                onChange={(e) => onMetaConfigChange({ ...metaConfig, instagramId: e.target.value })}
              />
            </div>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '12px', border: '1px solid var(--border)' }}>
            <p style={{ fontSize: '0.8rem', opacity: 0.6, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Globe size={14} /> Webhook Meta: <code>{originUrl}/api/webhooks/meta</code>
            </p>
          </div>

          <button
            style={{ width: '100%', padding: '12px', background: '#1877F2', color: 'white', borderRadius: '12px', border: 'none', fontSize: '0.9rem', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', cursor: 'pointer', marginTop: '0.5rem' }}
          >
            <Lock size={16} /> Autenticar via OAuth2 (Rápido)
          </button>
        </div>
      </div>
      <div className={styles.modalFooter}>
        <button className={styles.btnCancel} onClick={onClose}>Cancelar</button>
        <button
          className={styles.btnSave}
          onClick={onSave}
          style={{ background: '#1877F2', color: 'white' }}
          disabled={saveStatus !== 'idle'}
        >
          {saveStatus === 'saving' ? 'Conectando...' : saveStatus === 'success' ? 'Salvo!' : 'Ativar Integração Meta'}
        </button>
      </div>
    </>
  );
}
