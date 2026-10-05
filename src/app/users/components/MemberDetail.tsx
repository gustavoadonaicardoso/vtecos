import { useState } from 'react';
import { ArrowLeft, Check, Copy, KeyRound, Loader2, Sparkles, Trash2 } from 'lucide-react';
import styles from '../users.module.css';
import type { PermissionMap } from '@/lib/permissions.constants';
import { generatePassword, ROLE_DEFAULT_PERMISSIONS, ROLE_HINT, ROLE_LABEL, STATUS_LABEL, type Member, type Role, type Status, type Template } from '../constants';
import Avatar from './Avatar';
import AccessEditor from './AccessEditor';
import ActivityTab from './ActivityTab';

export interface Draft {
  name: string;
  email: string;
  role: Role;
  status: Status;
  permissions: PermissionMap;
  allowed_templates: string[];
}

interface MemberDetailProps {
  member: Member;
  draft: Draft;
  dirty: boolean;
  saving: boolean;
  canEdit: boolean;
  isSelf: boolean;
  online: boolean;
  presenceLabel: string;
  modules: string[] | null;
  templates: Template[];
  tab: 'data' | 'access' | 'activity';
  onTab: (tab: 'data' | 'access' | 'activity') => void;
  onDraft: (changes: Partial<Draft>) => void;
  onSave: () => void;
  onDiscard: () => void;
  onBack: () => void;
  onRemove: () => void;
  onNotice: (type: 'ok' | 'error', text: string) => void;
}

export default function MemberDetail(props: MemberDetailProps) {
  const { member, draft, dirty, saving, canEdit, isSelf, online, presenceLabel, modules, templates, tab, onTab, onDraft, onSave, onDiscard, onBack, onRemove, onNotice } = props;
  const [password, setPassword] = useState('');
  const [resetting, setResetting] = useState(false);
  const [copied, setCopied] = useState(false);
  const emailChanged = draft.email.trim().toLowerCase() !== member.email.toLowerCase();

  const resetPassword = async () => {
    if (password.length < 8) {
      onNotice('error', 'A nova senha precisa ter pelo menos 8 caracteres.');
      return;
    }
    if (!confirm(`Definir esta nova senha para ${member.name}? A senha atual deixa de funcionar.`)) return;
    setResetting(true);
    const response = await fetch(`/api/users/${member.id}/password`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPassword: password }),
    });
    const json = await response.json().catch(() => ({}));
    setResetting(false);
    if (!response.ok) {
      onNotice('error', json.error || 'Não foi possível trocar a senha.');
      return;
    }
    onNotice('ok', `Senha de ${member.name.split(' ')[0]} trocada. Envie a nova senha para a pessoa.`);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <div className={styles.detail}>
      <header className={styles.detailHead}>
        <button type="button" className={`${styles.iconBtn} ${styles.backBtn}`} onClick={onBack} aria-label="Voltar para a lista"><ArrowLeft size={18} /></button>
        <Avatar id={member.id} name={member.name} url={member.avatar_url} size={56} online={member.status === 'ACTIVE' ? online : undefined} />
        <div className={styles.detailTitle}>
          <h3>{member.name}{isSelf && <span className={styles.youTag}>você</span>}</h3>
          <p>{member.email}</p>
          <div className={styles.badges}>
            <span className={`${styles.badge} ${styles[`role_${member.role}`]}`}>{ROLE_LABEL[member.role]}</span>
            <span className={`${styles.badge} ${member.status === 'ACTIVE' ? styles.badgeOk : styles.badgeOff}`}>{STATUS_LABEL[member.status]}</span>
            {member.status === 'ACTIVE' && <span className={styles.presence}>{presenceLabel}</span>}
          </div>
        </div>
      </header>

      <nav className={styles.tabs} role="tablist">
        {([['data', 'Dados'], ['access', 'Acessos'], ['activity', 'Atividades']] as const).map(([value, label]) => (
          <button key={value} type="button" role="tab" aria-selected={tab === value} className={tab === value ? styles.tabOn : ''} onClick={() => onTab(value)}>
            {label}
          </button>
        ))}
      </nav>

      <div className={styles.detailBody}>
        {tab === 'data' && (
          <fieldset className={styles.dataForm} disabled={!canEdit}>
            <div className={styles.formGrid}>
              <label className={styles.field}>
                <span>Nome completo</span>
                <input className={styles.input} value={draft.name} maxLength={120} onChange={(e) => onDraft({ name: e.target.value })} />
              </label>
              <label className={styles.field}>
                <span>E-mail de acesso</span>
                <input className={styles.input} type="email" value={draft.email} onChange={(e) => onDraft({ email: e.target.value })} />
                {emailChanged && <small className={styles.warnText}>A pessoa passa a entrar com o e-mail novo (o antigo deixa de funcionar).</small>}
              </label>
            </div>

            <div className={styles.field}>
              <span>Cargo</span>
              <div className={styles.roleCards} role="radiogroup" aria-label="Cargo">
                {(['SELLER', 'MANAGER', 'ADMIN'] as Role[]).map((value) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={draft.role === value}
                    className={`${styles.roleCard} ${draft.role === value ? styles.roleCardOn : ''}`}
                    disabled={!canEdit || isSelf}
                    onClick={() => onDraft({ role: value, permissions: ROLE_DEFAULT_PERMISSIONS[value] })}
                  >
                    <strong>{ROLE_LABEL[value]}</strong>
                    <small>{ROLE_HINT[value]}</small>
                  </button>
                ))}
              </div>
              {isSelf && <small>Você não pode mudar o seu próprio cargo.</small>}
              {!isSelf && draft.role !== member.role && <small className={styles.warnText}>Os acessos voltam para o padrão de {ROLE_LABEL[draft.role]} — confira na aba Acessos antes de salvar.</small>}
            </div>

            <div className={styles.field}>
              <span>Acesso ao sistema</span>
              <div className={styles.segmented} role="radiogroup" aria-label="Status">
                {(['ACTIVE', 'INACTIVE'] as Status[]).map((value) => (
                  <button key={value} type="button" role="radio" aria-checked={draft.status === value} className={draft.status === value ? styles.segmentOn : ''} disabled={!canEdit || isSelf} onClick={() => onDraft({ status: value })}>
                    {value === 'ACTIVE' ? 'Ativo: pode entrar' : 'Inativo: login bloqueado'}
                  </button>
                ))}
              </div>
              <small>{isSelf ? 'Você não pode desativar o seu próprio acesso.' : 'Inativo não entra no sistema, mas o histórico fica guardado. Dá para reativar a qualquer momento.'}</small>
            </div>

            {canEdit && (
              <section className={styles.card}>
                <h4><KeyRound size={16} /> Trocar a senha</h4>
                <p>Para quem esqueceu a senha. A atual deixa de funcionar na hora.</p>
                <div className={styles.passwordRow}>
                  <input className={styles.input} type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Nova senha (mín. 8 caracteres)" autoComplete="new-password" />
                  {password && <button type="button" className={styles.iconBtn} onClick={copy} aria-label="Copiar senha">{copied ? <Check size={16} /> : <Copy size={16} />}</button>}
                  <button type="button" className={styles.ghostBtn} onClick={() => setPassword(generatePassword())}><Sparkles size={14} /> Gerar</button>
                  <button type="button" className={styles.secondaryBtn} onClick={resetPassword} disabled={resetting || !password}>
                    {resetting && <Loader2 size={14} className={styles.spin} />} Definir senha
                  </button>
                </div>
              </section>
            )}

            {canEdit && !isSelf && (
              <section className={`${styles.card} ${styles.dangerCard}`}>
                <h4><Trash2 size={16} /> Remover da equipe</h4>
                <p>Apaga o acesso de vez. Os leads da pessoa podem passar para outro membro.</p>
                <button type="button" className={styles.dangerBtn} onClick={onRemove}>Remover {member.name.split(' ')[0]}</button>
              </section>
            )}
          </fieldset>
        )}

        {tab === 'access' && (
          <AccessEditor
            role={draft.role}
            permissions={draft.permissions}
            modules={modules}
            readOnly={!canEdit}
            onChange={(permissions) => onDraft({ permissions })}
            templates={templates}
            allowedTemplates={draft.allowed_templates}
            onTemplatesChange={(ids) => onDraft({ allowed_templates: ids })}
          />
        )}

        {tab === 'activity' && <ActivityTab member={member} canEdit={canEdit} />}
      </div>

      {dirty && canEdit && (
        <div className={styles.saveBar} role="status">
          <span>Alterações não salvas</span>
          <button type="button" className={styles.secondaryBtn} onClick={onDiscard} disabled={saving}>Descartar</button>
          <button type="button" className={styles.primaryBtn} onClick={onSave} disabled={saving}>
            {saving && <Loader2 size={15} className={styles.spin} />} Salvar
          </button>
        </div>
      )}
    </div>
  );
}
