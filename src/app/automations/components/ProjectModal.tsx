import React from "react";
import { Plus as PlusIcon, X } from "lucide-react";
import styles from "../automations.module.css";

interface ProjectModalProps {
  show: boolean;
  name: string;
  description: string;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onSubmit: (event: React.FormEvent) => void;
  onClose: () => void;
}

export default function ProjectModal({ show, name, description, onNameChange, onDescriptionChange, onSubmit, onClose }: ProjectModalProps) {
  if (!show) return null;
  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <form className={styles.modal} onSubmit={onSubmit} onClick={event => event.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div><span className={styles.inspectorEyebrow}>NOVO WORKFLOW</span><h2>Criar projeto de automação</h2></div>
          <button type="button" className={styles.closeModalBtn} onClick={onClose}><X size={18} /></button>
        </div>
        <div className={styles.modalBody}>
          <label>Nome do projeto<input required autoFocus className={styles.inspectorInput} value={name} onChange={event => onNameChange(event.target.value)} placeholder="Ex.: Qualificação de leads" /></label>
          <label>Descrição<textarea className={styles.inspectorTextarea} value={description} onChange={event => onDescriptionChange(event.target.value)} placeholder="Qual é o objetivo deste fluxo?" rows={3} /></label>
        </div>
        <div className={styles.modalFooter}>
          <button type="button" className={styles.modalCancelBtn} onClick={onClose}>Cancelar</button>
          <button type="submit" className={styles.modalConfirmBtn}><PlusIcon size={15} /> Criar projeto</button>
        </div>
      </form>
    </div>
  );
}
