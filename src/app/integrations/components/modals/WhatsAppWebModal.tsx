import Image from 'next/image';
import { MessageCircle, X, Zap, Loader2 } from 'lucide-react';
import styles from '../../integrations.module.css';
import type { WebConfig, SaveStatus, WhatsAppWebConnectionState } from '../../constants';

interface WhatsAppWebModalProps {
  webConfig: WebConfig;
  onWebConfigChange: (config: WebConfig) => void;
  whatsappWebQr: string | null;
  whatsappWebConnection: WhatsAppWebConnectionState;
  whatsappWebConnectionMessage: string;
  isFetchingQr: boolean;
  saveStatus: SaveStatus;
  isConnected: boolean;
  onFetchQr: () => void;
  onSave: () => void;
  onDisconnect: () => void;
  onClose: () => void;
}

export default function WhatsAppWebModal({
  webConfig,
  onWebConfigChange,
  whatsappWebQr,
  whatsappWebConnection,
  whatsappWebConnectionMessage,
  isFetchingQr,
  saveStatus,
  isConnected,
  onFetchQr,
  onSave,
  onDisconnect,
  onClose,
}: WhatsAppWebModalProps) {
  return (
    <>
      <div className={styles.modalHeader}>
        <div className={styles.modalTitle}>
          <div className={styles.iconBox} style={{ width: 40, height: 40, background: '#11c1d922', color: '#11c1d9' }}>
            <MessageCircle size={20} />
          </div>
          <div>
            <span style={{ fontSize: '1.1rem', display: 'block', fontWeight: 600 }}>Conectar WhatsApp Web</span>
            <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>Conexão gratuita e autogerenciada por QR Code</span>
          </div>
        </div>
        <button className={styles.closeBtn} onClick={onClose}><X size={20} /></button>
      </div>
      <div className={styles.modalBody} style={{ gap: '1.25rem', display: 'flex', flexDirection: 'column' }}>

        <div className={styles.formGroup}>
          <label>Nome da conexão</label>
          <input
            type="text"
            placeholder="Ex: WhatsApp comercial"
            className={styles.premiumInput}
            value={webConfig.name}
            onChange={(e) => onWebConfigChange({ name: e.target.value })}
          />
        </div>

        <div className={styles.alertBox}>
          <p><strong>Como conectar:</strong> abra o WhatsApp no celular, acesse Aparelhos conectados, escolha Conectar um aparelho e leia o código abaixo.</p>
          <p style={{ marginTop: '8px', fontSize: '0.78rem', opacity: 0.75 }}>A sessão fica armazenada no servidor. Esta opção não é uma API oficial da Meta e automações excessivas podem causar bloqueio do número.</p>
        </div>

        <div className={styles.qrContainer} style={{ marginTop: '0.5rem', textAlign: 'center', padding: '1.5rem', background: 'rgba(255,255,255,0.02)', borderRadius: '20px', border: '1px solid var(--border)' }}>
          {whatsappWebConnectionMessage && (
            <p style={{ marginBottom: '1rem', fontSize: '0.85rem', color: whatsappWebConnection === 'connected' ? '#25D366' : whatsappWebConnection === 'error' ? '#ef4444' : 'var(--foreground)', opacity: whatsappWebConnection === 'waiting' ? 0.7 : 1 }}>
            {whatsappWebConnectionMessage}
            </p>
          )}
          {whatsappWebQr ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
              <div style={{ background: 'white', padding: '12px', borderRadius: '12px', lineHeight: 0 }}>
                <Image src={whatsappWebQr} alt="QR Code do WhatsApp Web" width={220} height={220} unoptimized />
              </div>
              <button onClick={onFetchQr} style={{ background: 'none', border: 'none', color: '#11c1d9', fontSize: '0.8rem', cursor: 'pointer', textDecoration: 'underline' }}>
                Atualizar QR Code
              </button>
            </div>
          ) : (
            <button
              className={styles.btnTest}
              onClick={onFetchQr}
              disabled={isFetchingQr}
              style={{ margin: '0 auto', background: 'rgba(17, 193, 217, 0.1)', color: '#11c1d9', border: '1px solid #11c1d944' }}
            >
              {isFetchingQr ? <Loader2 size={16} className={styles.loader} /> : <Zap size={16} />}
              {isFetchingQr ? 'Gerando QR...' : 'Gerar QR Code de Conexão'}
            </button>
          )}
        </div>

      </div>
      <div className={styles.modalFooter}>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button className={styles.btnCancel} onClick={onClose}>Cancelar</button>
          {isConnected && (
            <button
              onClick={onDisconnect}
              style={{
                background: 'rgba(239, 68, 68, 0.1)',
                color: '#ef4444',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                padding: '10px 16px',
                borderRadius: '10px',
                fontSize: '0.875rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.2s'
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)')}
            >
              <X size={14} /> Remover Integração
            </button>
          )}
        </div>
        <button
          className={styles.btnSave}
          onClick={onSave}
          style={{ background: '#11c1d9', color: 'black' }}
          disabled={saveStatus !== 'idle'}
        >
          {saveStatus === 'saving' ? 'Salvando...' : saveStatus === 'success' ? 'Salvo!' : 'Salvar Conexão'}
        </button>
      </div>
    </>
  );
}
