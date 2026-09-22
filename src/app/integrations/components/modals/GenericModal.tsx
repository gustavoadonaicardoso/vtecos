import { X } from 'lucide-react';
import styles from '../../integrations.module.css';

interface GenericModalProps {
  onClose: () => void;
}

export default function GenericModal({ onClose }: GenericModalProps) {
  return (
    <>
      <div className={styles.modalHeader}>
        <div className={styles.modalTitle}>Conexão Genérica</div>
        <button className={styles.closeBtn} onClick={onClose}><X size={20} /></button>
      </div>
      <div className={styles.modalBody}>
        <p>Integração será construída via Backend.</p>
      </div>
    </>
  );
}
