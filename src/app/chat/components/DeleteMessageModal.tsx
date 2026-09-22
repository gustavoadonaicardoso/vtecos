import { Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';
import styles from '../chat.module.css';

interface DeleteMessageModalProps {
  onCancel: () => void;
  onConfirm: () => void;
}

export default function DeleteMessageModal({ onCancel, onConfirm }: DeleteMessageModalProps) {
  return (
    <motion.div
      className={styles.modalOverlay}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onCancel}
    >
      <motion.div
        className={styles.modalContent}
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.92, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.modalIcon}>
          <Trash2 size={28} />
        </div>
        <h3>Apagar mensagem</h3>
        <p>A mensagem será removida da sua visualização. O histórico no banco de dados não será afetado.</p>
        <div className={styles.modalActions}>
          <button className={styles.cancelBtn} onClick={onCancel}>
            Cancelar
          </button>
          <button className={styles.confirmDeleteBtn} onClick={onConfirm}>
            Apagar
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
