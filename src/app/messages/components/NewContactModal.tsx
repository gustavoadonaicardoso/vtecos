import { AlertTriangle, Loader2, Mail, Phone, UserPlus, X } from 'lucide-react';
import { motion } from 'framer-motion';
import styles from '../messages.module.css';
import type { NewContactForm } from '../types';

interface PipelineStage {
  id: string;
  name: string;
}

interface NewContactModalProps {
  newContact: NewContactForm;
  onChange: (contact: NewContactForm) => void;
  pipelineStages: PipelineStage[];
  contactError: string;
  savingContact: boolean;
  onClose: () => void;
  onCreate: () => void;
}

export default function NewContactModal({ newContact, onChange, pipelineStages, contactError, savingContact, onClose, onCreate }: NewContactModalProps) {
  return (
    <motion.div
      className={styles.modalOverlay}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className={styles.newContactModal}
        initial={{ opacity: 0, scale: 0.93, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.93 }}
        onClick={e => e.stopPropagation()}
      >
        <div className={styles.modalHeader}>
          <div className={styles.modalTitleRow}>
            <UserPlus size={20} />
            <h3>Novo Contato</h3>
          </div>
          <button className={styles.actionBtn} onClick={onClose}><X size={20} /></button>
        </div>

        <div className={styles.modalBody}>
          <div className={styles.modalField}>
            <label>Nome *</label>
            <input
              className={styles.infoInput}
              value={newContact.name}
              onChange={e => onChange({ ...newContact, name: e.target.value })}
              placeholder="Nome completo"
              autoFocus
            />
          </div>
          <div className={styles.modalField}>
            <label><Phone size={13} /> Telefone / WhatsApp *</label>
            <input
              className={styles.infoInput}
              value={newContact.phone}
              onChange={e => onChange({ ...newContact, phone: e.target.value })}
              placeholder="(00) 00000-0000"
            />
          </div>
          <div className={styles.modalField}>
            <label><Mail size={13} /> E-mail</label>
            <input
              className={styles.infoInput}
              value={newContact.email}
              onChange={e => onChange({ ...newContact, email: e.target.value })}
              placeholder="email@exemplo.com"
            />
          </div>
          <div className={styles.modalField}>
            <label>Etapa do Pipeline</label>
            <select
              className={styles.infoInput}
              value={newContact.stage}
              onChange={e => onChange({ ...newContact, stage: e.target.value })}
            >
              <option value="">Primeira etapa</option>
              {pipelineStages.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          {contactError && (
            <div className={styles.contactErrorMsg}>
              <AlertTriangle size={14} /> {contactError}
            </div>
          )}
        </div>

        <div className={styles.modalFooter}>
          <button className={styles.secondaryBtn} onClick={onClose}>
            Cancelar
          </button>
          <button
            className={styles.transferBtn}
            onClick={onCreate}
            disabled={savingContact}
          >
            {savingContact ? <Loader2 size={16} style={{ animation: 'spin 0.8s linear infinite' }} /> : <UserPlus size={16} />}
            {savingContact ? 'Salvando...' : 'Criar Contato'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
