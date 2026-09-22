import { X } from "lucide-react";
import styles from "../automations.module.css";

interface HelpModalProps {
  onClose: () => void;
}

export default function HelpModal({ onClose }: HelpModalProps) {
  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={`${styles.modal} ${styles.helpModal}`} onClick={event => event.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div><span className={styles.inspectorEyebrow}>GUIA RÁPIDO</span><h2>Como montar um fluxo</h2></div>
          <button type="button" className={styles.closeModalBtn} onClick={onClose}><X size={18} /></button>
        </div>
        <div className={styles.helpSteps}>
          <div><b>1</b><p>Ative os canais que o projeto poderá usar.</p></div>
          <div><b>2</b><p>Clique em um bloco da biblioteca ou arraste-o para o canvas.</p></div>
          <div><b>3</b><p>Selecione um bloco e configure seus campos no inspector.</p></div>
          <div><b>4</b><p>Clique em uma saída e depois na entrada de outro bloco para criar conexões.</p></div>
          <div><b>5</b><p>Use “Testar fluxo” para conferir a sequência antes de ativar.</p></div>
        </div>
      </div>
    </div>
  );
}
