import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, UserX, X } from 'lucide-react';
import styles from '../users.module.css';
import type { Member } from '../constants';

interface RemoveMemberModalProps {
  member: Member;
  candidates: Member[];
  onClose: () => void;
  onDeactivate: () => void;
  onRemoved: () => void;
}

export default function RemoveMemberModal({ member, candidates, onClose, onDeactivate, onRemoved }: RemoveMemberModalProps) {
  const [summary, setSummary] = useState<{ leads: number; goals: number } | null>(null);
  const [transferTo, setTransferTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/users/${member.id}`, { cache: 'no-store' })
      .then((response) => response.json().then((json) => ({ ok: response.ok, json })))
      .then(({ ok, json }) => {
        if (cancelled) return;
        if (ok) setSummary(json.data);
        else setError(json.error || 'Não foi possível carregar os dados do membro.');
      })
      .catch(() => !cancelled && setError('Não foi possível carregar os dados do membro.'));
    return () => {
      cancelled = true;
    };
  }, [member.id]);

  const remove = async () => {
    if (summary && summary.leads > 0 && !transferTo) {
      setError('Escolha quem fica com os leads (ou "Deixar sem responsável").');
      return;
    }
    setBusy(true);
    setError('');
    const response = await fetch(`/api/users/${member.id}?transferTo=${encodeURIComponent(transferTo || 'none')}`, { method: 'DELETE' });
    const json = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(json.error || 'Não foi possível remover.');
      return;
    }
    onRemoved();
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={`${styles.modal} ${styles.modalSmall}`} onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="remove-title">
        <div className={styles.modalHead}>
          <div>
            <h3 id="remove-title">Remover {member.name}?</h3>
            <p>O acesso é apagado de vez e não dá para desfazer.</p>
          </div>
          <button type="button" className={styles.iconBtn} onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </div>

        <div className={styles.modalBody}>
          <div className={styles.infoBox}>
            <UserX size={18} />
            <div>
              <strong>Prefere só bloquear o acesso?</strong>
              <p>Desativar impede o login e mantém o histórico (conversas, leads e metas) com o nome da pessoa.</p>
              <button type="button" className={styles.linkBtn} onClick={onDeactivate}>Desativar em vez de remover</button>
            </div>
          </div>

          {!summary && !error && <p className={styles.muted}><Loader2 size={14} className={styles.spin} /> Verificando o que está com esta pessoa...</p>}

          {summary && (
            <>
              <ul className={styles.summaryList}>
                <li><strong>{summary.leads}</strong> lead(s) sob responsabilidade dela</li>
                <li><strong>{summary.goals}</strong> meta(s) — são apagadas junto</li>
              </ul>
              {summary.leads > 0 && (
                <label className={styles.field}>
                  <span>Passar os leads para</span>
                  <select className={styles.input} value={transferTo} onChange={(e) => setTransferTo(e.target.value)}>
                    <option value="">Escolha...</option>
                    {candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
                    <option value="none">Deixar sem responsável</option>
                  </select>
                </label>
              )}
            </>
          )}

          {error && <div className={styles.errorBox}><AlertTriangle size={15} /> {error}</div>}
        </div>

        <div className={styles.modalFoot}>
          <button type="button" className={styles.secondaryBtn} onClick={onClose}>Cancelar</button>
          <button type="button" className={styles.dangerBtn} onClick={remove} disabled={busy || !summary}>
            {busy && <Loader2 size={15} className={styles.spin} />} Remover de vez
          </button>
        </div>
      </div>
    </div>
  );
}
