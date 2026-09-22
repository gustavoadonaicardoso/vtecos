import { FileSpreadsheet, X, Link2 } from 'lucide-react';
import styles from '../../integrations.module.css';

interface GoogleSheetsModalProps {
  onClose: () => void;
}

export default function GoogleSheetsModal({ onClose }: GoogleSheetsModalProps) {
  return (
    <>
      <div className={styles.modalHeader}>
        <div className={styles.modalTitle}>
          <div className={styles.iconBox} style={{ width: 40, height: 40, background: '#0F9D5822', color: '#0F9D58' }}>
            <FileSpreadsheet size={20} />
          </div>
          Integração Google Sheets
        </div>
        <button className={styles.closeBtn} onClick={onClose}><X size={20} /></button>
      </div>
      <div className={styles.modalBody}>
        <p style={{ opacity: 0.7, fontSize: '0.95rem', lineHeight: 1.5, marginBottom: '1rem' }}>
          Cole o link compartilhado da sua planilha do Google Sheets. Toda vez que um Lead for inserido no pipeline, ele será escrito na primeira aba (aba base).
        </p>
        <div className={styles.formGroup}>
          <label>Link da Planilha (URL ou ID)</label>
          <input type="text" placeholder="https://docs.google.com/spreadsheets/d/1A2B3C..." />
        </div>
        <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '1rem', borderRadius: '12px', marginTop: '1rem', display: 'flex', gap: '12px', alignItems: 'center' }}>
          <Link2 size={24} color="#0F9D58" opacity={0.5} />
          <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>
            Lembre-se de dar permissão de &quot;Editor&quot; para <strong>vortice-api@appspot.gserviceaccount.com</strong> na sua planilha.
          </div>
        </div>
      </div>
      <div className={styles.modalFooter}>
        <button className={styles.btnCancel} onClick={onClose}>Cancelar</button>
        <button className={styles.btnSave} style={{ background: '#0F9D58' }}>Sincronizar Planilha</button>
      </div>
    </>
  );
}
