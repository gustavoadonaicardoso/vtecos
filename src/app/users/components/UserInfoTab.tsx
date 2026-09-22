import { Trash2 } from 'lucide-react';
import styles from '../users.module.css';
import type { Role, Status } from '../constants';

interface UserInfoTabProps {
  name: string;
  email: string;
  role: Role;
  status: Status;
  loading: boolean;
  onNameChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onRoleChange: (value: Role) => void;
  onStatusChange: (value: Status) => void;
  onDeleteMember: () => void;
}

export default function UserInfoTab({
  name,
  email,
  role,
  status,
  loading,
  onNameChange,
  onEmailChange,
  onRoleChange,
  onStatusChange,
  onDeleteMember,
}: UserInfoTabProps) {
  return (
    <div className={styles.infoFormGrid}>
      <div className={styles.formGroup}>
        <label>Nome Completo</label>
        <input
          className={styles.input}
          value={name}
          onChange={e => onNameChange(e.target.value)}
        />
      </div>
      <div className={styles.formGroup}>
        <label>E-mail Corporativo</label>
        <input
          className={styles.input}
          value={email}
          onChange={e => onEmailChange(e.target.value)}
        />
      </div>
      <div className={styles.formGroup}>
        <label>Papel no Sistema</label>
        <select
          className={styles.select}
          value={role}
          onChange={e => onRoleChange(e.target.value as Role)}
        >
          <option value="ADMIN">Administrador</option>
          <option value="MANAGER">Gerente</option>
          <option value="SELLER">Vendedor</option>
        </select>
      </div>
      <div className={styles.formGroup}>
        <label>Status</label>
        <select
          className={styles.select}
          value={status}
          onChange={e => onStatusChange(e.target.value as Status)}
        >
          <option value="ACTIVE">Ativo</option>
          <option value="INACTIVE">Inativo</option>
        </select>
      </div>

      <div className={styles.dangerZone}>
        <h4>Zona de Perigo</h4>
        <p>A remoção de um membro é permanente e remove todo o seu acesso ao CRM.</p>
        <button className={styles.deleteBtn} onClick={onDeleteMember} disabled={loading}>
          <Trash2 size={18} /> Excluir Membro da Equipe
        </button>
      </div>
    </div>
  );
}
