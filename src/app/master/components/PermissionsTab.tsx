import { motion } from 'framer-motion';
import { Lock } from 'lucide-react';
import styles from '../master.module.css';
import { MENU_PERMISSION_ITEMS, ROLE_TABS } from '../constants';
import type { Role, RolePermissions } from '../types';

interface PermissionsTabProps {
  selectedRole: Role;
  onSelectRole: (role: Role) => void;
  rolePermissions: RolePermissions;
  onTogglePermission: (category: string, field: string) => void;
}

const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Administrador',
  MANAGER: 'Gerente',
  SELLER: 'Vendedor / Atendente',
};

export default function PermissionsTab({ selectedRole, onSelectRole, rolePermissions, onTogglePermission }: PermissionsTabProps) {
  // Administrador sempre enxerga tudo (usePermissions libera qualquer
  // permissão para ADMIN), então os interruptores dele ficam travados.
  const isAdminRole = selectedRole === 'ADMIN';

  return (
    <motion.div
      key="permissions"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      style={{ display: 'flex', flexDirection: 'column', gap: 20 }}
    >
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h2>Menu lateral por função</h2>
        </div>
        <p className={styles.hint}>
          Escolha uma função e ligue ou desligue o que ela vê no menu. Ao clicar em
          &quot;Aplicar à equipe&quot;, a configuração substitui as permissões de todos os usuários
          dessa função na equipe da Vórtice. Empresas clientes ajustam a própria equipe na tela Equipe.
        </p>

        <div className={styles.roleTabs}>
          {ROLE_TABS.map(({ value, icon: RoleIcon }) => (
            <button
              key={value}
              className={`${styles.roleTabBtn} ${selectedRole === value ? styles.roleTabActive : ''}`}
              onClick={() => onSelectRole(value)}
            >
              <RoleIcon size={16} />
              {ROLE_LABELS[value]}
            </button>
          ))}
        </div>
      </div>

      {isAdminRole && (
        <div className={styles.infoBanner}>
          Administradores têm acesso total ao menu e não podem ser limitados por aqui.
        </div>
      )}

      <div className={styles.menuItemsGrid}>
        {MENU_PERMISSION_ITEMS.map((item) => {
          const isEnabled = isAdminRole || rolePermissions[selectedRole]?.[item.cat]?.[item.field] === true;
          return (
            <button
              key={item.id}
              type="button"
              disabled={isAdminRole}
              className={`${styles.menuConfigCard} ${isEnabled ? styles.menuEnabled : ''}`}
              onClick={() => onTogglePermission(item.cat, item.field)}
              aria-pressed={isEnabled}
            >
              <div className={styles.menuIconBox}>
                <item.icon size={20} />
              </div>
              <div className={styles.menuText}>
                <h4>{item.label}</h4>
                <span>{isAdminRole ? 'Acesso total' : isEnabled ? 'Visível no menu' : 'Oculto para esta função'}</span>
              </div>
              {isAdminRole ? (
                <Lock size={16} style={{ color: 'var(--accent)', flex: 'none' }} />
              ) : (
                <div className={styles.toggleSwitch}>
                  <div className={`${styles.switchBall} ${isEnabled ? styles.switchOn : ''}`} />
                </div>
              )}
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}
