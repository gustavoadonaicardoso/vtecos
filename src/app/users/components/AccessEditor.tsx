import { RotateCcw, ShieldCheck } from 'lucide-react';
import styles from '../users.module.css';
import type { PermissionMap } from '@/lib/permissions.constants';
import { availablePermissions, ROLE_DEFAULT_PERMISSIONS, ROLE_LABEL, type Role, type Template } from '../constants';

interface AccessEditorProps {
  role: Role;
  permissions: PermissionMap;
  modules: string[] | null;
  readOnly: boolean;
  onChange: (permissions: PermissionMap) => void;
  /** Modelos de mensagem (só aparecem quando a empresa tem o CRM). */
  templates?: Template[];
  allowedTemplates?: string[];
  onTemplatesChange?: (ids: string[]) => void;
}

function Switch({ checked, disabled, onChange, label }: { checked: boolean; disabled: boolean; onChange: () => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className={`${styles.switch} ${checked ? styles.switchOn : ''}`} disabled={disabled} onClick={onChange}>
      <span />
    </button>
  );
}

export default function AccessEditor({ role, permissions, modules, readOnly, onChange, templates = [], allowedTemplates = [], onTemplatesChange }: AccessEditorProps) {
  if (role === 'ADMIN') {
    return (
      <div className={styles.infoBox}>
        <ShieldCheck size={18} />
        <div>
          <strong>Administrador tem acesso a tudo.</strong>
          <p>Para limitar o que esta pessoa vê, mude o cargo para Gerente ou Vendedor na aba Dados.</p>
        </div>
      </div>
    );
  }

  const items = availablePermissions(modules);
  const toggle = (cat: string, field: string) => {
    if (readOnly) return;
    onChange({ ...permissions, [cat]: { ...permissions[cat], [field]: !permissions[cat]?.[field] } });
  };
  const restrictTemplates = allowedTemplates.length > 0;

  const renderGroup = (kind: 'menu' | 'action', title: string, hint: string) => (
    <section className={styles.accessGroup}>
      <div className={styles.accessGroupHead}>
        <h4>{title}</h4>
        <p>{hint}</p>
      </div>
      <div className={styles.accessList}>
        {items.filter((item) => item.kind === kind).map((item) => {
          const checked = permissions[item.cat]?.[item.field] === true;
          return (
            <label key={item.id} className={`${styles.accessRow} ${checked ? styles.accessOn : ''}`}>
              <span>
                <strong>{item.label}</strong>
                <small>{item.description}</small>
              </span>
              <Switch checked={checked} disabled={readOnly} onChange={() => toggle(item.cat, item.field)} label={item.label} />
            </label>
          );
        })}
      </div>
    </section>
  );

  return (
    <div className={styles.access}>
      {!readOnly && (
        <div className={styles.accessToolbar}>
          <span>Comece pelo padrão do cargo e ajuste o que precisar.</span>
          <button type="button" className={styles.ghostBtn} onClick={() => onChange(ROLE_DEFAULT_PERMISSIONS[role])}>
            <RotateCcw size={14} /> Padrão de {ROLE_LABEL[role]}
          </button>
        </div>
      )}

      {renderGroup('menu', 'Páginas', 'O que esta pessoa vê no menu e consegue usar. Vale também no servidor: sem a permissão, o sistema recusa o acesso mesmo por link direto.')}
      {items.some((item) => item.kind === 'action') && renderGroup('action', 'Recursos', 'Botões e ferramentas dentro das páginas.')}

      {onTemplatesChange && templates.length > 0 && (
        <section className={styles.accessGroup}>
          <div className={styles.accessGroupHead}>
            <h4>Modelos de mensagem</h4>
            <p>Quais mensagens rápidas esta pessoa pode usar nas conversas.</p>
          </div>
          <div className={styles.segmented} role="radiogroup" aria-label="Modelos de mensagem">
            <button type="button" role="radio" aria-checked={!restrictTemplates} className={!restrictTemplates ? styles.segmentOn : ''} disabled={readOnly} onClick={() => onTemplatesChange([])}>
              Todos
            </button>
            <button type="button" role="radio" aria-checked={restrictTemplates} className={restrictTemplates ? styles.segmentOn : ''} disabled={readOnly} onClick={() => !restrictTemplates && onTemplatesChange([templates[0].id])}>
              Só os escolhidos
            </button>
          </div>
          {restrictTemplates && (
            <div className={styles.templateList}>
              {templates.map((template) => {
                const checked = allowedTemplates.includes(template.id);
                return (
                  <label key={template.id} className={styles.check}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={readOnly || (checked && allowedTemplates.length === 1)}
                      onChange={() => onTemplatesChange(checked ? allowedTemplates.filter((id) => id !== template.id) : [...allowedTemplates, template.id])}
                    />
                    {template.name}
                  </label>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
