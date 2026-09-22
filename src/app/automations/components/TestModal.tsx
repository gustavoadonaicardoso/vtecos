import { ArrowRight, Play, X } from "lucide-react";
import styles from "../automations.module.css";
import { channelLabel } from "../constants";
import type { AutomationNode, AutomationProject } from "../types";

interface TestModalProps {
  activeProject: AutomationProject;
  testInput: string;
  onTestInputChange: (value: string) => void;
  testTrace: AutomationNode[];
  onRunTest: () => void;
  onClose: () => void;
}

export default function TestModal({ activeProject, testInput, onTestInputChange, testTrace, onRunTest, onClose }: TestModalProps) {
  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={`${styles.modal} ${styles.testModal}`} onClick={event => event.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div><span className={styles.inspectorEyebrow}>SIMULADOR</span><h2>Testar automação</h2></div>
          <button type="button" className={styles.closeModalBtn} onClick={onClose}><X size={18} /></button>
        </div>
        <div className={styles.modalBody}>
          <p className={styles.modalDescription}>A simulação percorre o fluxo a partir do primeiro gatilho. Informe uma mensagem para seguir pelo caminho “Sim” de uma condição.</p>
          <label>Mensagem de teste<input className={styles.inspectorInput} value={testInput} onChange={event => onTestInputChange(event.target.value)} placeholder="Digite algo para simular uma entrada" /></label>
          <div className={styles.testChannels}>
            <span>Canais ativos</span>
            {activeProject.channels.length ? activeProject.channels.map(channel => <span key={channel} className={styles.testChannel}>{channelLabel(channel)}</span>) : <small>Nenhum canal ativado</small>}
          </div>
          <button type="button" className={styles.runTestBtn} onClick={onRunTest}><Play size={15} /> Executar teste</button>
          {testTrace.length > 0 && (
            <div className={styles.testTrace}>
              <div className={styles.inspectorSubheading}>SEQUÊNCIA PREVISTA</div>
              {testTrace.map((node, index) => (
                <div className={styles.traceItem} key={`${node.id}-${index}`}>
                  <span>{index + 1}</span>
                  <div><strong>{node.label}</strong><small>{node.content}</small></div>
                  {index < testTrace.length - 1 && <ArrowRight size={14} />}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
