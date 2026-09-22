import { ShieldAlert, MessageSquare } from 'lucide-react';
import styles from '../users.module.css';
import { CATEGORY_MAP, FIELD_MAP, type Permissions } from '../constants';

interface UserPermissionsTabProps {
  userPermissions: Permissions;
  allTemplates: { id: string; name: string }[];
  allowedTemplates: string[];
  onTogglePermission: (category: keyof Permissions, field: string) => void;
  onAllowedTemplatesChange: (next: string[]) => void;
}

export default function UserPermissionsTab({
  userPermissions,
  allTemplates,
  allowedTemplates,
  onTogglePermission,
  onAllowedTemplatesChange,
}: UserPermissionsTabProps) {
  return (
    <div>
      <div className={styles.permissionsLayoutGrid}>
        {Object.entries(userPermissions).map(([category, items]) => {
          const cat = CATEGORY_MAP[category] || { name: category, icon: ShieldAlert, color: '#ccc' };

          return (
            <div key={category} className={styles.permissionCardSection}>
              <div className={styles.cardHeaderSmall}>
                <cat.icon size={14} color={cat.color} />
                <h4>{cat.name}</h4>
              </div>
              <div className={styles.permissionSwitchList}>
                {Object.entries(items as any).map(([field, value]) => (
                  <div key={field} className={styles.switchRow}>
                    <label className={styles.cyberLabel}>
                      <span>{FIELD_MAP[field] || field}</span>
                      <div className={styles.cyberSwitch}>
                        <input
                          type="checkbox"
                          checked={value as boolean}
                          onChange={() => onTogglePermission(category as keyof Permissions, field)}
                        />
                        <span className={styles.cyberSlider}></span>
                      </div>
                    </label>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className={styles.templatesVisSection}>
        <div className={styles.templatesVisHeader}>
          <MessageSquare size={14} color="#f59e0b" />
          <h4>Templates Visíveis</h4>
        </div>
        <p className={styles.templatesVisDesc}>
          Controle quais modelos de mensagem este usuário pode usar na central de mensagens.
        </p>
        <label className={styles.cyberLabel} style={{ marginBottom: '0.75rem' }}>
          <span>Ver todos os templates</span>
          <div className={styles.cyberSwitch}>
            <input
              type="checkbox"
              checked={allowedTemplates.length === 0}
              onChange={() => onAllowedTemplatesChange([])}
            />
            <span className={styles.cyberSlider}></span>
          </div>
        </label>
        {allowedTemplates.length > 0 || allTemplates.length > 0 ? (
          <div className={styles.templateCheckList}>
            {allTemplates.map(t => {
              const checked = allowedTemplates.length === 0 || allowedTemplates.includes(t.id);
              return (
                <label key={t.id} className={styles.templateCheckRow}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      if (allowedTemplates.length === 0) {
                        onAllowedTemplatesChange(allTemplates.filter(x => x.id !== t.id).map(x => x.id));
                      } else if (checked) {
                        onAllowedTemplatesChange(allowedTemplates.filter(id => id !== t.id));
                      } else {
                        onAllowedTemplatesChange([...allowedTemplates, t.id]);
                      }
                    }}
                  />
                  <span>{t.name}</span>
                </label>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
