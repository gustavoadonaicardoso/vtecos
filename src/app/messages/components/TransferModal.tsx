import { useState } from 'react';
import { Loader2, X } from 'lucide-react';
import styles from '../messages.module.css';
import type { TeamMember } from '@/components/leads/useTeam';

interface TransferModalProps {
  leadName: string;
  currentOwner: string | null;
  team: TeamMember[];
  selfId: string;
  onClose: () => void;
  onTransfer: (memberId: string, note: string) => Promise<string | null>;
}

/** Passa a conversa para outra pessoa da equipe (ela recebe um aviso no sino). */
export default function TransferModal({ leadName, currentOwner, team, selfId, onClose, onTransfer }: TransferModalProps) {
  const [memberId, setMemberId] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const options = team.filter((member) => member.id !== currentOwner);

  const submit = async () => {
    if (!memberId) return;
    setBusy(true);
    const failure = await onTransfer(memberId, note.trim());
    setBusy(false);
    if (failure) setError(failure);
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="transfer-title">
        <div className={styles.modalHead}>
          <div>
            <h2 id="transfer-title">Transferir atendimento</h2>
            <p>{leadName} passa a ser atendido por quem você escolher. A pessoa recebe um aviso no sino.</p>
          </div>
          <button type="button" className={styles.iconBtn} onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.memberList} role="radiogroup" aria-label="Para quem">
            {options.map((member) => (
              <label key={member.id} className={`${styles.memberOption} ${memberId === member.id ? styles.memberOn : ''}`}>
                <input type="radio" name="member" value={member.id} checked={memberId === member.id} onChange={() => setMemberId(member.id)} />
                <span>{member.name}{member.id === selfId ? ' (você)' : ''}</span>
              </label>
            ))}
            {options.length === 0 && <p className={styles.muted}>Não há outra pessoa ativa na equipe.</p>}
          </div>
          <label className={styles.field}>
            <span>Recado para quem vai atender (opcional)</span>
            <textarea className={styles.input} rows={3} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: cliente quer orçamento para 3 unidades" />
          </label>
          {error && <div className={styles.errorBox}>{error}</div>}
        </div>
        <div className={styles.modalFoot}>
          <button type="button" className={styles.secondaryBtn} onClick={onClose}>Cancelar</button>
          <button type="button" className={styles.primaryBtn} onClick={submit} disabled={!memberId || busy}>
            {busy && <Loader2 size={15} className={styles.spin} />} Transferir
          </button>
        </div>
      </div>
    </div>
  );
}
