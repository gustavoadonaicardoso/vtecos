import { LogOut, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';
import styles from '../chat.module.css';
import type { Profile } from '../types';

interface DeleteChatModalProps {
  targetProfile: Profile | undefined;
  currentUserId: string | undefined;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function DeleteChatModal({ targetProfile, currentUserId, onCancel, onConfirm }: DeleteChatModalProps) {
  const isLeavingGroup = targetProfile?.isGroup && targetProfile?.createdBy !== currentUserId;

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
          {isLeavingGroup ? <LogOut size={28} /> : <Trash2 size={28} />}
        </div>
        <h3>
          {isLeavingGroup ? 'Sair do grupo' : 'Apagar conversa'}
        </h3>
        <p>
          {isLeavingGroup
            ? `Tem certeza que deseja sair do grupo ${targetProfile?.name}? Você não receberá mais mensagens dele.`
            : `Todas as mensagens com ${targetProfile?.name} serão apagadas permanentemente. Esta ação não pode ser desfeita.`
          }
        </p>
        <div className={styles.modalActions}>
          <button className={styles.cancelBtn} onClick={onCancel}>
            Cancelar
          </button>
          <button className={styles.confirmDeleteBtn} onClick={onConfirm}>
            {isLeavingGroup ? 'Sair' : 'Apagar'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
