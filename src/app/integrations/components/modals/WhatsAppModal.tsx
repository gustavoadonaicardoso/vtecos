import { MessageCircle, X, Lock, CheckCircle2, Loader2 } from 'lucide-react';
import styles from '../../integrations.module.css';
import type { WaConfig, SaveStatus } from '../../constants';

interface WhatsAppModalProps {
  waConfig: WaConfig;
  onWaConfigChange: (config: WaConfig) => void;
  isTesting: boolean;
  saveStatus: SaveStatus;
  originUrl: string;
  onTestConnection: () => void;
  onSave: () => void;
  onClose: () => void;
}

export default function WhatsAppModal({
  waConfig,
  onWaConfigChange,
  isTesting,
  saveStatus,
  originUrl,
  onTestConnection,
  onSave,
  onClose,
}: WhatsAppModalProps) {
  return (
    <>
      <div className={styles.modalHeader}>
        <div className={styles.modalTitle}>
          <div className={styles.iconBox} style={{ width: 40, height: 40, background: '#25D36622', color: '#25D366' }}>
            <MessageCircle size={20} />
          </div>
          <div>
            <span style={{ fontSize: '1.1rem', display: 'block' }}>Configuração Official WhatsApp API</span>
            <span style={{ fontSize: '0.75rem', opacity: 0.6, fontWeight: 400 }}>Plataforma Meta for Developers</span>
          </div>
        </div>
        <button className={styles.closeBtn} onClick={onClose}><X size={20} /></button>
      </div>
      <div className={styles.modalBody}>
        <div className={styles.alertBox}>
          <p>Utilize o <strong>Token de Acesso Permanente (System User)</strong> para garantir que a conexão não expire.</p>
          <a href="https://developers.facebook.com/" target="_blank" rel="noreferrer" style={{ color: '#25D366', fontSize: '0.8rem', textDecoration: 'underline', marginTop: '4px', display: 'inline-block' }}>Acessar Portal do Desenvolvedor →</a>
        </div>

        <div className={styles.formGrid}>
          <div className={styles.formGroup}>
            <label>Token de Acesso (API Key)</label>
            <div className={styles.inputWrapper}>
              <input
                type="password"
                name="wa-token"
                autoComplete="new-password"
                placeholder="EAAG..."
                className={styles.premiumInput}
                value={waConfig.token || ''}
                onChange={(e) => onWaConfigChange({ ...waConfig, token: e.target.value })}
              />
              <Lock size={14} className={styles.inputIcon} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className={styles.formGroup}>
              <label>ID do Número de Telefone</label>
              <input
                type="text"
                name="wa-phone-id"
                autoComplete="off"
                placeholder="Ex: 109283..."
                className={styles.premiumInput}
                value={waConfig.phoneId || ''}
                onChange={(e) => onWaConfigChange({ ...waConfig, phoneId: e.target.value })}
              />
            </div>
            <div className={styles.formGroup}>
              <label>ID da Conta Business (WABA)</label>
              <input
                type="text"
                name="wa-account-id"
                autoComplete="off"
                placeholder="Ex: 987654..."
                className={styles.premiumInput}
                value={waConfig.wabaId || ''}
                onChange={(e) => onWaConfigChange({ ...waConfig, wabaId: e.target.value })}
              />
            </div>
          </div>

          <div className={styles.formGroup}>
            <label>Webhook Verify Token (Opcional)</label>
            <div className={styles.inputWrapper}>
              <input type="text" defaultValue="vortice_verify_token_2024" readOnly className={styles.premiumInput} style={{ background: 'rgba(255,255,255,0.03)', cursor: 'not-allowed' }} />
              <CheckCircle2 size={14} className={styles.inputIcon} color="#25D366" />
            </div>
            <small style={{ opacity: 0.5, marginTop: '4px', display: 'block' }}>URL Webhook: {originUrl}/api/webhooks/meta</small>
          </div>
        </div>

        <div style={{ marginTop: '1.5rem', padding: '1rem', border: '1px solid var(--border)', borderRadius: '12px', background: 'rgba(255,255,255,0.01)' }}>
          <h5 style={{ marginBottom: '0.5rem', fontSize: '0.9rem' }}>Recursos Ativados:</h5>
          <ul style={{ fontSize: '0.85rem', opacity: 0.7, paddingLeft: '1.2rem', lineHeight: '1.6' }}>
            <li>Envio de Templates Oficiais (Utility, Marketing)</li>
            <li>Recebimento de Mensagens e Mídia em Tempo Real</li>
            <li>Métricas de Entrega e Leitura (Read Receipts)</li>
            <li>Suporte a Botões Interativos e Listas</li>
          </ul>
        </div>
      </div>
      <div className={styles.modalFooter}>
        <button className={styles.btnCancel} onClick={onClose}>Cancelar</button>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            className={styles.btnTest}
            onClick={onTestConnection}
            disabled={isTesting}
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: 'white', padding: '10px 15px', borderRadius: '10px', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            {isTesting && <Loader2 size={14} className={styles.loader} />}
            {isTesting ? 'Validando...' : 'Testar Conexão'}
          </button>
          <button
            className={styles.btnSave}
            onClick={onSave}
            disabled={saveStatus !== 'idle'}
            style={{ background: '#25D366', color: 'black' }}
          >
            {saveStatus === 'saving' ? 'Salvando...' : saveStatus === 'success' ? 'Salvo!' : 'Salvar e Ativar API'}
          </button>
        </div>
      </div>
    </>
  );
}
