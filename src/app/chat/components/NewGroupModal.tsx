import { Users as UsersIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import styles from '../chat.module.css';
import type { Profile } from '../types';

interface NewGroupModalProps {
  profiles: Profile[];
  newGroupName: string;
  onNameChange: (value: string) => void;
  newGroupMembers: Set<string>;
  onMembersChange: (members: Set<string>) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function NewGroupModal({ profiles, newGroupName, onNameChange, newGroupMembers, onMembersChange, onCancel, onConfirm }: NewGroupModalProps) {
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
        <div className={styles.modalIcon} style={{ background: 'rgba(59, 130, 246, 0.12)', color: '#3b82f6' }}>
          <UsersIcon size={28} />
        </div>
        <h3>Criar Novo Grupo</h3>
        <input
          type="text"
          placeholder="Nome do grupo..."
          value={newGroupName}
          onChange={e => onNameChange(e.target.value)}
          style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', color: 'inherit', marginBottom: '12px' }}
        />
        <div style={{ width: '100%', maxHeight: '150px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px', textAlign: 'left' }}>
          {profiles.filter(p => !p.isGroup).map(p => (
            <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={newGroupMembers.has(p.id)}
                onChange={(e) => {
                  const newSet = new Set(newGroupMembers);
                  if (e.target.checked) newSet.add(p.id);
                  else newSet.delete(p.id);
                  onMembersChange(newSet);
                }}
              />
              <span style={{ fontSize: '0.9rem' }}>{p.name}</span>
            </label>
          ))}
        </div>
        <div className={styles.modalActions}>
          <button className={styles.cancelBtn} onClick={onCancel}>
            Cancelar
          </button>
          <button
            className={styles.confirmDeleteBtn}
            style={{ background: '#3b82f6' }}
            onClick={onConfirm}
            disabled={!newGroupName.trim() || newGroupMembers.size === 0}
          >
            Criar Grupo
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
