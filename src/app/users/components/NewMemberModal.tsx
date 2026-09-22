import { motion, AnimatePresence } from 'framer-motion';
import { X, ShieldAlert } from 'lucide-react';
import styles from '../users.module.css';
import { CATEGORY_MAP, FIELD_MAP, type Permissions, type Role } from '../constants';

interface NewMemberModalProps {
  isOpen: boolean;
  loading: boolean;
  newUserName: string;
  newUserEmail: string;
  newUserRole: Role;
  newUserPassword: string;
  newUserPermissions: Permissions;
  onClose: () => void;
  onNameChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onRoleChange: (value: Role) => void;
  onPasswordChange: (value: string) => void;
  onTogglePermission: (category: keyof Permissions, field: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}

export default function NewMemberModal({
  isOpen,
  loading,
  newUserName,
  newUserEmail,
  newUserRole,
  newUserPassword,
  newUserPermissions,
  onClose,
  onNameChange,
  onEmailChange,
  onRoleChange,
  onPasswordChange,
  onTogglePermission,
  onSubmit,
}: NewMemberModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className={styles.modalOverlay} onClick={onClose}>
          <motion.div
            className={styles.modalContent}
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={e => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <h3>Novo Membro da Equipe</h3>
              <button className={styles.closeBtn} onClick={onClose}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={onSubmit} className={styles.addForm}>
              <div className={styles.formGroup}>
                <label>Nome Completo</label>
                <input
                  className={styles.input}
                  placeholder="Ex: João Silva"
                  value={newUserName}
                  onChange={e => onNameChange(e.target.value)}
                  required
                />
              </div>
              <div className={styles.formGroup}>
                <label>E-mail Corporativo</label>
                <input
                  type="email"
                  className={styles.input}
                  placeholder="joao@empresa.com"
                  value={newUserEmail}
                  onChange={e => onEmailChange(e.target.value)}
                  required
                />
              </div>
              <div className={styles.formGroup}>
                <label>Cargo / Função</label>
                <select
                  className={styles.select}
                  value={newUserRole}
                  onChange={e => onRoleChange(e.target.value as Role)}
                >
                  <option value="ADMIN">Administrador</option>
                  <option value="MANAGER">Gerente</option>
                  <option value="SELLER">Vendedor</option>
                </select>
              </div>

              <div className={styles.formGroup}>
                <label>Senha de Acesso</label>
                <input
                  type="password"
                  className={styles.input}
                  placeholder="••••••••"
                  value={newUserPassword}
                  onChange={e => onPasswordChange(e.target.value)}
                  required
                  minLength={8}
                />
              </div>

              <div className={styles.permissionSectionTitle}>
                <h4>Permissões do Novo Membro</h4>
                <p>Defina o que este usuário poderá ver e fazer</p>
              </div>

              <div className={styles.modalPermissionsGrid}>
                {Object.entries(newUserPermissions).map(([category, items]) => {
                  const cat = CATEGORY_MAP[category] || { name: category, icon: ShieldAlert, color: '#ccc' };
                  return (
                    <div key={category} className={styles.miniPermissionCard}>
                      <div className={styles.miniCardHeader}>
                        <cat.icon size={12} color={cat.color} />
                        <span>{cat.name}</span>
                      </div>
                      <div className={styles.miniSwitchList}>
                        {Object.entries(items as any).map(([field, value]) => (
                          <label key={field} className={styles.miniSwitchRow}>
                            <span className={styles.miniFieldName}>{FIELD_MAP[field] || field}</span>
                            <input
                              type="checkbox"
                              checked={value as boolean}
                              onChange={() => onTogglePermission(category as keyof Permissions, field)}
                            />
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className={styles.modalActions}>
                <button type="button" className={styles.cancelBtn} onClick={onClose}>
                  Cancelar
                </button>
                <button type="submit" className={styles.submitBtn} disabled={loading}>
                  {loading ? 'Salvando...' : 'Criar Membro'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
