import { motion } from 'framer-motion';
import styles from '../master.module.css';
import { MENU_PERMISSION_ITEMS, ROLE_TABS } from '../constants';
import type { Role, RolePermissions } from '../types';

interface PermissionsTabProps {
  selectedRole: Role;
  onSelectRole: (role: Role) => void;
  rolePermissions: RolePermissions;
  onTogglePermission: (category: string, field: string) => void;
}

export default function PermissionsTab({ selectedRole, onSelectRole, rolePermissions, onTogglePermission }: PermissionsTabProps) {
  return (
    <motion.div
      key="permissions"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      className={styles.permissionsContainer}
    >
      <div className={styles.roleSelectorCard}>
        <h3>Configurar Navbar por Função</h3>
        <p>Selecione uma função para decidir quais módulos estarão visíveis no menu lateral.</p>

        <div className={styles.roleTabs}>
          {ROLE_TABS.map(({ value, icon: RoleIcon }) => (
            <button
              key={value}
              className={`${styles.roleTabBtn} ${selectedRole === value ? styles.roleTabActive : ''}`}
              onClick={() => onSelectRole(value)}
            >
              <RoleIcon size={16} />
              {value}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.menuItemsGrid}>
        {MENU_PERMISSION_ITEMS.map((item) => {
          const isEnabled = rolePermissions[selectedRole][item.cat]?.[item.field];
          return (
            <div
              key={item.id}
              className={`${styles.menuConfigCard} ${isEnabled ? styles.menuEnabled : ''}`}
              onClick={() => onTogglePermission(item.cat, item.field)}
            >
              <div className={styles.menuIconBox}>
                <item.icon size={20} />
              </div>
              <div className={styles.menuText}>
                <h4>{item.label}</h4>
                <span>{isEnabled ? 'Visível na Sidebar' : 'Oculto para esta função'}</span>
              </div>
              <div className={styles.toggleSwitch}>
                <div className={`${styles.switchBall} ${isEnabled ? styles.switchOn : ''}`} />
              </div>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
