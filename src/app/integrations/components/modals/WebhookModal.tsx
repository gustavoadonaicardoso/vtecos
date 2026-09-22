import { Globe, X, Link2 } from 'lucide-react';
import styles from '../../integrations.module.css';
import type { WebhookConfig, SaveStatus } from '../../constants';

interface WebhookModalProps {
  webhookConfig: WebhookConfig;
  onWebhookConfigChange: (config: WebhookConfig) => void;
  saveStatus: SaveStatus;
  onSave: () => void;
  onClose: () => void;
}

export default function WebhookModal({
  webhookConfig,
  onWebhookConfigChange,
  saveStatus,
  onSave,
  onClose,
}: WebhookModalProps) {
  return (
    <>
      <div className={styles.modalHeader}>
        <div className={styles.modalTitle}>
          <div className={styles.iconBox} style={{ width: 40, height: 40, background: '#3b82f622', color: '#3b82f6' }}>
            <Globe size={20} />
          </div>
          <div>
            <span style={{ fontSize: '1.1rem', display: 'block' }}>Configurar Webhooks Customizados</span>
            <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>Comunicação total via API</span>
          </div>
        </div>
        <button className={styles.closeBtn} onClick={onClose}><X size={20} /></button>
      </div>
      <div className={styles.modalBody}>
        <div className={styles.alertBox} style={{ marginBottom: '1.5rem', background: 'rgba(59, 130, 246, 0.05)', color: '#3b82f6', borderColor: 'rgba(59, 130, 246, 0.2)' }}>
          <p><strong>URL de Notificação:</strong> Toda vez que o CRM receber uma mensagem ou lead, enviaremos um POST para a URL configurada abaixo.</p>
        </div>

        <div className={styles.formGrid}>
          <div className={styles.formGroup}>
            <label>Endpoint para Recebimento (Sua URL)</label>
            <input
              type="url"
              placeholder="https://suaapi.com/webhooks/vortice"
              autoComplete="off"
              className={styles.premiumInput}
              value={webhookConfig.url || ''}
              onChange={(e) => onWebhookConfigChange({ ...webhookConfig, url: e.target.value })}
            />
          </div>
          <div className={styles.formGroup}>
            <label>Security Token / Secret</label>
            <input
              type="password"
              placeholder="Sua chave de segurança"
              autoComplete="new-password"
              className={styles.premiumInput}
              value={webhookConfig.secret || ''}
              onChange={(e) => onWebhookConfigChange({ ...webhookConfig, secret: e.target.value })}
            />
            <small style={{ opacity: 0.5, marginTop: '4px', display: 'block' }}>Usado para assinar o cabeçalho e validar a origem do POST.</small>
          </div>
        </div>

        <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid var(--border)' }}>
          <h5 style={{ fontSize: '0.85rem', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Link2 size={14} /> Sua URL de Entrada (Para Enviar ao CRM)
          </h5>
          <code>https://api.vorticecrm.com/v1/webhook/incoming</code>
          <p style={{ fontSize: '0.75rem', opacity: 0.5, marginTop: '8px' }}>Utilize este endpoint para injetar leads ou enviar mensagens via sistemas externos.</p>
        </div>
      </div>
      <div className={styles.modalFooter}>
        <button className={styles.btnCancel} onClick={onClose}>Cancelar</button>
        <button
          className={styles.btnSave}
          onClick={onSave}
          style={{ background: '#3b82f6', color: 'white' }}
          disabled={saveStatus !== 'idle'}
        >
          {saveStatus === 'saving' ? 'Salvando...' : saveStatus === 'success' ? 'Ativo!' : 'Salvar Configuração'}
        </button>
      </div>
    </>
  );
}
