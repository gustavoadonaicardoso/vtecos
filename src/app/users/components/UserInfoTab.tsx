import { useState } from 'react';
import { KeyRound, Trash2 } from 'lucide-react';
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
  onResetPassword: (newPassword: string) => void;
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
  onResetPassword,
}: UserInfoTabProps) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleResetPasswordClick = () => {
    if (newPassword.length < 8) {
      alert('A nova senha deve ter pelo menos 8 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      alert('As senhas não coincidem.');
      return;
    }
    if (!window.confirm(`Redefinir a senha de ${name}? A senha atual dele(a) deixará de funcionar.`)) return;

    onResetPassword(newPassword);
    setNewPassword('');
    setConfirmPassword('');
  };

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

      <div className={styles.passwordResetZone}>
        <h4><KeyRound size={16} /> Redefinir Senha</h4>
        <p>Defina uma nova senha para este membro sem precisar da senha atual — use em casos de esquecimento.</p>
        <div className={styles.passwordResetFields}>
          <input
            className={styles.input}
            type="password"
            placeholder="Nova senha (mín. 8 caracteres)"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
          />
          <input
            className={styles.input}
            type="password"
            placeholder="Confirmar nova senha"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
          />
          <button
            className={styles.resetPasswordBtn}
            onClick={handleResetPasswordClick}
            disabled={loading || !newPassword || !confirmPassword}
          >
            <KeyRound size={16} /> Redefinir Senha
          </button>
        </div>
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
