import { Trash2 } from 'lucide-react';
import styles from '../users.module.css';

interface UserUpdatesTabProps {
  upAction: string;
  upTarget: string;
  loading: boolean;
  systemUpdates: any[];
  onUpActionChange: (value: string) => void;
  onUpTargetChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onDeleteUpdate: (id: string) => void;
}

export default function UserUpdatesTab({
  upAction,
  upTarget,
  loading,
  systemUpdates,
  onUpActionChange,
  onUpTargetChange,
  onSubmit,
  onDeleteUpdate,
}: UserUpdatesTabProps) {
  return (
    <div className={styles.updatesManager}>
      <div className={styles.updatesFormCard}>
        <h4>Nova Atualização no Dashboard</h4>
        <p>Esta atualização aparecerá para todos os usuários em "Atualizações Recentes".</p>
        <form onSubmit={onSubmit} className={styles.miniForm}>
          <div className={styles.inputGroup}>
            <label>Ação realizada</label>
            <input
              placeholder="Ex: Atualizou os workflows de"
              value={upAction}
              onChange={e => onUpActionChange(e.target.value)}
              required
            />
          </div>
          <div className={styles.inputGroup}>
            <label>Alvo / Destino</label>
            <input
              placeholder="Ex: Lead Comercial"
              value={upTarget}
              onChange={e => onUpTargetChange(e.target.value)}
            />
          </div>
          <button type="submit" className={styles.broadcastBtn} disabled={loading}>
            Emitir para o Sistema
          </button>
        </form>
      </div>

      <div className={styles.historyList}>
        <h4>Histórico de Emissões</h4>
        {systemUpdates.map(up => (
          <div key={up.id} className={styles.historyItem}>
            <div className={styles.historyMeta}>
              <strong>{up.action} {up.target}</strong>
              <span>por {up.user_name} • {new Date(up.created_at).toLocaleString()}</span>
            </div>
            <button className={styles.miniDelete} onClick={() => onDeleteUpdate(up.id)}>
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
