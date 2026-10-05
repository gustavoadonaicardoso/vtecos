import { useState } from 'react';
import { Check, ChevronDown, Copy, Eye, EyeOff, Loader2, Sparkles, X } from 'lucide-react';
import styles from '../users.module.css';
import type { PermissionMap } from '@/lib/permissions.constants';
import { generatePassword, ROLE_DEFAULT_PERMISSIONS, ROLE_HINT, ROLE_LABEL, type Role } from '../constants';
import AccessEditor from './AccessEditor';

interface NewMemberModalProps {
  modules: string[] | null;
  onClose: () => void;
  onCreated: (member: { id: string; name: string; email: string; password: string }) => void;
}

export default function NewMemberModal({ modules, onClose, onCreated }: NewMemberModalProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<Role>('SELLER');
  const [permissions, setPermissions] = useState<PermissionMap>(ROLE_DEFAULT_PERMISSIONS.SELLER);
  const [showAccess, setShowAccess] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const changeRole = (next: Role) => {
    setRole(next);
    setPermissions(ROLE_DEFAULT_PERMISSIONS[next]);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('A senha precisa ter pelo menos 8 caracteres.');
      return;
    }
    setBusy(true);
    const response = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), email: email.trim(), password, role, permissions }),
    });
    const json = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(json.error || 'Não foi possível cadastrar.');
      return;
    }
    onCreated({ id: json.data.id, name: name.trim(), email: email.trim().toLowerCase(), password });
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <form className={styles.modal} onClick={(event) => event.stopPropagation()} onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="new-member-title">
        <div className={styles.modalHead}>
          <div>
            <h3 id="new-member-title">Novo membro</h3>
            <p>A pessoa entra com este e-mail e senha. Envie os dados para ela por um canal seguro.</p>
          </div>
          <button type="button" className={styles.iconBtn} onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </div>

        <div className={styles.modalBody}>
          <div className={styles.formGrid}>
            <label className={styles.field}>
              <span>Nome completo</span>
              <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: João Silva" maxLength={120} required autoFocus />
            </label>
            <label className={styles.field}>
              <span>E-mail de acesso</span>
              <input className={styles.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="joao@empresa.com" required />
            </label>
          </div>

          <label className={styles.field}>
            <span>Senha inicial</span>
            <div className={styles.passwordRow}>
              <input className={styles.input} type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo de 8 caracteres" minLength={8} required autoComplete="new-password" />
              <button type="button" className={styles.iconBtn} onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Esconder senha' : 'Mostrar senha'}>
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
              {password && (
                <button type="button" className={styles.iconBtn} onClick={copy} aria-label="Copiar senha">{copied ? <Check size={16} /> : <Copy size={16} />}</button>
              )}
              <button type="button" className={styles.ghostBtn} onClick={() => { setPassword(generatePassword()); setShowPassword(true); }}>
                <Sparkles size={14} /> Gerar
              </button>
            </div>
          </label>

          <div className={styles.field}>
            <span>Cargo</span>
            <div className={styles.roleCards} role="radiogroup" aria-label="Cargo">
              {(['SELLER', 'MANAGER', 'ADMIN'] as Role[]).map((value) => (
                <button key={value} type="button" role="radio" aria-checked={role === value} className={`${styles.roleCard} ${role === value ? styles.roleCardOn : ''}`} onClick={() => changeRole(value)}>
                  <strong>{ROLE_LABEL[value]}</strong>
                  <small>{ROLE_HINT[value]}</small>
                </button>
              ))}
            </div>
          </div>

          {role !== 'ADMIN' && (
            <div className={styles.collapse}>
              <button type="button" className={styles.collapseHead} onClick={() => setShowAccess((value) => !value)} aria-expanded={showAccess}>
                <span>Acessos: padrão de {ROLE_LABEL[role]}</span>
                <span className={styles.collapseAction}>{showAccess ? 'Fechar' : 'Ajustar'} <ChevronDown size={14} className={showAccess ? styles.rotated : ''} /></span>
              </button>
              {showAccess && <AccessEditor role={role} permissions={permissions} modules={modules} readOnly={false} onChange={setPermissions} />}
            </div>
          )}

          {error && <div className={styles.errorBox}>{error}</div>}
        </div>

        <div className={styles.modalFoot}>
          <button type="button" className={styles.secondaryBtn} onClick={onClose}>Cancelar</button>
          <button type="submit" className={styles.primaryBtn} disabled={busy}>
            {busy && <Loader2 size={15} className={styles.spin} />} Cadastrar
          </button>
        </div>
      </form>
    </div>
  );
}
