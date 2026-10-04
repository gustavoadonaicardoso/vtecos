"use client";

import React, { useRef, useState } from 'react';
import {
  AlertTriangle,
  BellRing,
  Building2,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Layers,
  Loader2,
  Lock,
  Save,
  ShieldCheck,
  Trash2,
  Upload,
  User,
  Volume2,
} from 'lucide-react';
import styles from './settings.module.css';
import { useAuth } from '@/context/AuthContext';
import { useBrowserNotifications, showBrowserNotification } from '@/hooks/useBrowserNotifications';
import { playNotificationSound } from '@/lib/notificationSound';
import { getNotificationPrefs, setNotificationPrefs, DEFAULT_NOTIFICATION_PREFS, type NotificationPrefs } from '@/lib/notificationPrefs';
import { PLAN_MODULES } from '@/lib/plans';

type TabId = 'profile' | 'security' | 'notifications' | 'company' | 'plan';

interface Company {
  name: string;
  document: string;
  contact_email: string;
  phone: string;
  website: string;
  address: string;
}

interface CompanyPlan {
  is_platform: boolean;
  status: string;
  name: string | null;
  price: number | null;
  active: boolean;
  modules: string[];
}

type Feedback = { type: 'success' | 'error'; text: string } | null;

const ROLE_LABEL: Record<string, string> = {
  ADMIN: 'Administrador',
  MANAGER: 'Gerente',
  SELLER: 'Vendedor / Atendente',
};

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error || 'Não foi possível concluir.');
  return json.data as T;
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : 'Não foi possível concluir.');

function FeedbackBar({ feedback }: { feedback: Feedback }) {
  if (!feedback) return null;
  return (
    <div className={feedback.type === 'success' ? styles.success : styles.error} role={feedback.type === 'error' ? 'alert' : 'status'}>
      {feedback.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
      {feedback.text}
    </div>
  );
}

function Toggle({ label, description, checked, disabled, onChange }: { label: string; description: string; checked: boolean; disabled?: boolean; onChange: () => void }) {
  return (
    <div className={styles.toggleRow}>
      <div>
        <div className={styles.toggleLabel}>{label}</div>
        <div className={styles.toggleDesc}>{description}</div>
      </div>
      <button
        type="button"
        className={`${styles.toggleSwitch} ${checked ? styles.active : ''}`}
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={onChange}
      >
        <span className={styles.toggleSlider} />
      </button>
    </div>
  );
}

export default function SettingsPage() {
  const { user, refreshUser } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const hasCrm = !user?.workspace || user.workspace.modules.includes('crm');
  const [activeTab, setActiveTab] = useState<TabId>('profile');

  // ── Perfil ───────────────────────────────────────────────────
  const [profileDraft, setProfileDraft] = useState<{ name: string; phone: string } | null>(null);
  const profile = profileDraft ?? { name: user?.name || '', phone: user?.phone || '' };
  const [profileBusy, setProfileBusy] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [profileFeedback, setProfileFeedback] = useState<Feedback>(null);
  const avatarInput = useRef<HTMLInputElement>(null);

  // ── Segurança ────────────────────────────────────────────────
  const [passwords, setPasswords] = useState({ current: '', next: '', confirm: '' });
  const [showPasswords, setShowPasswords] = useState(false);
  const [securityBusy, setSecurityBusy] = useState(false);
  const [securityFeedback, setSecurityFeedback] = useState<Feedback>(null);

  // ── Notificações (por aparelho) ──────────────────────────────
  const { permission, requestPermission } = useBrowserNotifications();
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_NOTIFICATION_PREFS);
  const [notifyFeedback, setNotifyFeedback] = useState<Feedback>(null);

  // ── Empresa e plano (administrador) ──────────────────────────
  const [company, setCompany] = useState<Company | null>(null);
  const [plan, setPlan] = useState<CompanyPlan | null>(null);
  const [companyDraft, setCompanyDraft] = useState<Company | null>(null);
  const [companyBusy, setCompanyBusy] = useState(false);
  const [companyFeedback, setCompanyFeedback] = useState<Feedback>(null);

  const loadCompany = async () => {
    setCompanyFeedback(null);
    try {
      const data = await api<{ company: Company; plan: CompanyPlan }>('/api/company');
      setCompany(data.company);
      setPlan(data.plan);
      setCompanyDraft(null);
    } catch (error) {
      setCompanyFeedback({ type: 'error', text: errorText(error) });
    }
  };

  const openTab = (tab: TabId) => {
    setActiveTab(tab);
    if (tab === 'notifications') setPrefs(getNotificationPrefs());
    if ((tab === 'company' || tab === 'plan') && !company) loadCompany();
  };

  const tabs: { id: TabId; label: string; icon: typeof User; adminOnly?: boolean }[] = [
    { id: 'profile', label: 'Meu perfil', icon: User },
    { id: 'security', label: 'Senha e segurança', icon: Lock },
    { id: 'notifications', label: 'Notificações', icon: BellRing },
    { id: 'company', label: 'Dados da empresa', icon: Building2, adminOnly: true },
    { id: 'plan', label: 'Plano e módulos', icon: Layers, adminOnly: true },
  ];
  const visibleTabs = tabs.filter((tab) => !tab.adminOnly || isAdmin);
  const currentTab = visibleTabs.some((tab) => tab.id === activeTab) ? activeTab : 'profile';

  // ── Ações: perfil ────────────────────────────────────────────

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!profile.name.trim()) {
      setProfileFeedback({ type: 'error', text: 'Informe seu nome.' });
      return;
    }
    setProfileBusy(true);
    setProfileFeedback(null);
    try {
      await api('/api/users/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: profile.name.trim(), phone: profile.phone.trim() }),
      });
      await refreshUser();
      setProfileDraft(null);
      setProfileFeedback({ type: 'success', text: 'Perfil atualizado. O novo nome já aparece no menu, no chat e na equipe.' });
    } catch (error) {
      setProfileFeedback({ type: 'error', text: errorText(error) });
    } finally {
      setProfileBusy(false);
    }
  };

  const uploadAvatar = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setProfileFeedback({ type: 'error', text: 'A foto precisa ter no máximo 5 MB.' });
      return;
    }
    setAvatarBusy(true);
    setProfileFeedback(null);
    try {
      const body = new FormData();
      body.append('file', file);
      await api('/api/users/avatar', { method: 'POST', body });
      await refreshUser();
      setProfileFeedback({ type: 'success', text: 'Foto atualizada.' });
    } catch (error) {
      setProfileFeedback({ type: 'error', text: errorText(error) });
    } finally {
      setAvatarBusy(false);
    }
  };

  const removeAvatar = async () => {
    if (!confirm('Remover sua foto de perfil?')) return;
    setAvatarBusy(true);
    setProfileFeedback(null);
    try {
      await api('/api/users/avatar', { method: 'DELETE' });
      await refreshUser();
      setProfileFeedback({ type: 'success', text: 'Foto removida.' });
    } catch (error) {
      setProfileFeedback({ type: 'error', text: errorText(error) });
    } finally {
      setAvatarBusy(false);
    }
  };

  // ── Ações: segurança ─────────────────────────────────────────

  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (passwords.next.length < 8) {
      setSecurityFeedback({ type: 'error', text: 'A nova senha deve ter pelo menos 8 caracteres.' });
      return;
    }
    if (passwords.next !== passwords.confirm) {
      setSecurityFeedback({ type: 'error', text: 'A confirmação não confere com a nova senha.' });
      return;
    }
    setSecurityBusy(true);
    setSecurityFeedback(null);
    try {
      await api('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: passwords.current, newPassword: passwords.next }),
      });
      setPasswords({ current: '', next: '', confirm: '' });
      setSecurityFeedback({ type: 'success', text: 'Senha alterada. Use a nova senha no próximo login.' });
    } catch (error) {
      setSecurityFeedback({ type: 'error', text: errorText(error) });
    } finally {
      setSecurityBusy(false);
    }
  };

  const requestAdminReset = async () => {
    if (!user?.email) return;
    if (!confirm('Avisar os administradores da sua empresa que você precisa de uma nova senha?')) return;
    setSecurityBusy(true);
    setSecurityFeedback(null);
    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || 'Não foi possível enviar o pedido.');
      setSecurityFeedback({ type: 'success', text: 'Pedido enviado: os administradores receberam um aviso no sino de notificações.' });
    } catch (error) {
      setSecurityFeedback({ type: 'error', text: errorText(error) });
    } finally {
      setSecurityBusy(false);
    }
  };

  // ── Ações: notificações ──────────────────────────────────────

  const togglePref = (key: keyof NotificationPrefs) => {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    setNotificationPrefs(next);
    setNotifyFeedback({ type: 'success', text: 'Preferência salva neste aparelho.' });
  };

  const askBrowserPermission = async () => {
    const result = await requestPermission();
    if (result === 'denied') setNotifyFeedback({ type: 'error', text: 'O navegador bloqueou as notificações. Libere no cadeado ao lado do endereço do site.' });
    else if (result === 'granted') setNotifyFeedback({ type: 'success', text: 'Notificações do navegador ativadas.' });
  };

  const sendTest = () => {
    showBrowserNotification({ id: `test-${Date.now()}`, title: 'Teste do vtec os', content: 'As notificações estão funcionando neste aparelho.' });
    setNotifyFeedback({ type: 'success', text: 'Notificação de teste enviada. Se não apareceu, confira o modo "Não perturbe" do computador.' });
  };

  // ── Ações: empresa ───────────────────────────────────────────

  const companyForm = companyDraft ?? company;
  const editCompany = (key: keyof Company, value: string) => {
    if (!companyForm) return;
    setCompanyDraft({ ...companyForm, [key]: value });
  };

  const saveCompany = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!companyForm) return;
    setCompanyBusy(true);
    setCompanyFeedback(null);
    try {
      const data = await api<{ company: Company; plan: CompanyPlan } | null>('/api/company', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(companyForm),
      });
      if (data) {
        setCompany(data.company);
        setPlan(data.plan);
      }
      setCompanyDraft(null);
      await refreshUser();
      setCompanyFeedback({ type: 'success', text: 'Dados da empresa salvos.' });
    } catch (error) {
      setCompanyFeedback({ type: 'error', text: errorText(error) });
    } finally {
      setCompanyBusy(false);
    }
  };

  // ── Telas ────────────────────────────────────────────────────

  const initials = (user?.name || 'U').split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  const profileChanged = profileDraft !== null && (profileDraft.name !== (user?.name || '') || profileDraft.phone !== (user?.phone || ''));

  const renderProfile = () => (
    <form className={styles.panel} onSubmit={saveProfile}>
      <div className={styles.panelHead}>
        <h3>Meu perfil</h3>
        <p>Seu nome e sua foto aparecem no menu, no chat interno, na equipe e nas conversas que você atende.</p>
      </div>

      <div className={styles.avatarRow}>
        <div className={styles.avatarPreview}>
          {user?.avatar_url
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={user.avatar_url} alt="Sua foto" />
            : initials}
          {avatarBusy && <span className={styles.avatarBusy}><Loader2 size={22} className={styles.spin} /></span>}
        </div>
        <div className={styles.avatarActions}>
          <input ref={avatarInput} type="file" accept="image/jpeg,image/png,image/gif" hidden onChange={uploadAvatar} />
          <div className={styles.buttonRow}>
            <button type="button" className={styles.secondaryBtn} onClick={() => avatarInput.current?.click()} disabled={avatarBusy}>
              <Upload size={16} /> {user?.avatar_url ? 'Trocar foto' : 'Enviar foto'}
            </button>
            {user?.avatar_url && (
              <button type="button" className={styles.ghostDanger} onClick={removeAvatar} disabled={avatarBusy}>
                <Trash2 size={16} /> Remover
              </button>
            )}
          </div>
          <span className={styles.hint}>JPG, PNG ou GIF até 5 MB. A foto é cortada em quadrado automaticamente.</span>
        </div>
      </div>

      <div className={styles.formGrid}>
        <label className={styles.field}>
          <span>Nome completo</span>
          <input className={styles.input} value={profile.name} maxLength={120} onChange={(e) => setProfileDraft({ ...profile, name: e.target.value })} required />
        </label>
        <label className={styles.field}>
          <span>Telefone / WhatsApp</span>
          <input className={styles.input} value={profile.phone} maxLength={30} inputMode="tel" placeholder="(11) 99999-9999" onChange={(e) => setProfileDraft({ ...profile, phone: e.target.value })} />
        </label>
        <label className={styles.field}>
          <span>E-mail de login</span>
          <input className={styles.input} value={user?.email || ''} readOnly />
          <small className={styles.hint}>Só um administrador troca o e-mail de login (tela Equipe).</small>
        </label>
        <div className={styles.field}>
          <span>Função e empresa</span>
          <div className={styles.readonlyBox}>
            <strong>{ROLE_LABEL[user?.role || ''] || user?.role}</strong>
            {user?.workspace?.tenant_name && <small>{user.workspace.tenant_name}</small>}
          </div>
        </div>
      </div>

      <FeedbackBar feedback={profileFeedback} />

      <div className={styles.panelActions}>
        {profileChanged && (
          <button type="button" className={styles.secondaryBtn} onClick={() => setProfileDraft(null)} disabled={profileBusy}>Descartar</button>
        )}
        <button type="submit" className={styles.primaryBtn} disabled={profileBusy || !profileChanged}>
          {profileBusy ? <Loader2 size={16} className={styles.spin} /> : <Save size={16} />} Salvar perfil
        </button>
      </div>
    </form>
  );

  const passwordType = showPasswords ? 'text' : 'password';
  const renderSecurity = () => (
    <div className={styles.panel}>
      <div className={styles.panelHead}>
        <h3>Senha e segurança</h3>
        <p>Troque sua senha de acesso. Você continua conectado neste aparelho.</p>
      </div>

      <form className={styles.formStack} onSubmit={changePassword}>
        <label className={styles.field}>
          <span>Senha atual</span>
          <input className={styles.input} type={passwordType} autoComplete="current-password" value={passwords.current} onChange={(e) => setPasswords({ ...passwords, current: e.target.value })} required />
        </label>
        <div className={styles.formGrid}>
          <label className={styles.field}>
            <span>Nova senha</span>
            <input className={styles.input} type={passwordType} autoComplete="new-password" minLength={8} value={passwords.next} onChange={(e) => setPasswords({ ...passwords, next: e.target.value })} required />
            <small className={styles.hint}>Mínimo de 8 caracteres.</small>
          </label>
          <label className={styles.field}>
            <span>Confirmar nova senha</span>
            <input className={styles.input} type={passwordType} autoComplete="new-password" value={passwords.confirm} onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })} required />
            {passwords.confirm && passwords.confirm !== passwords.next && <small className={styles.hintError}>As senhas não conferem.</small>}
          </label>
        </div>

        <FeedbackBar feedback={securityFeedback} />

        <div className={styles.panelActions}>
          <button type="button" className={styles.ghostBtn} onClick={() => setShowPasswords((value) => !value)}>
            {showPasswords ? <EyeOff size={16} /> : <Eye size={16} />} {showPasswords ? 'Ocultar senhas' : 'Mostrar senhas'}
          </button>
          <button type="submit" className={styles.primaryBtn} disabled={securityBusy}>
            {securityBusy ? <Loader2 size={16} className={styles.spin} /> : <KeyRound size={16} />} Alterar senha
          </button>
        </div>
      </form>

      <div className={styles.infoCard}>
        <ShieldCheck size={18} />
        <div>
          <strong>Esqueceu a senha atual?</strong>
          <p>Peça a um administrador da sua empresa: ele define uma senha nova para você na tela Equipe.</p>
          <button type="button" className={styles.linkBtn} onClick={requestAdminReset} disabled={securityBusy}>Avisar os administradores</button>
        </div>
      </div>
    </div>
  );

  const permissionText = permission === 'granted'
    ? 'Ativadas neste navegador.'
    : permission === 'denied'
      ? 'Bloqueadas. Libere clicando no cadeado ao lado do endereço do site e recarregue a página.'
      : permission === 'unsupported'
        ? 'Este navegador não oferece notificações do sistema.'
        : 'Ainda não autorizadas. Permita para receber avisos mesmo com a aba minimizada.';

  const renderNotifications = () => (
    <div className={styles.panel}>
      <div className={styles.panelHead}>
        <h3>Notificações</h3>
        <p>Essas opções valem para este aparelho: dá para silenciar o computador do escritório e manter o celular avisando.</p>
      </div>

      <div className={`${styles.permissionCard} ${permission === 'granted' ? styles.permissionOk : ''}`}>
        <BellRing size={20} />
        <div>
          <strong>Notificações do navegador</strong>
          <p>{permissionText}</p>
        </div>
        {permission === 'default' && (
          <button type="button" className={styles.primaryBtn} onClick={askBrowserPermission}>Permitir</button>
        )}
        {permission === 'granted' && (
          <button type="button" className={styles.secondaryBtn} onClick={sendTest}>Enviar teste</button>
        )}
      </div>

      {hasCrm && (
        <>
          <h4 className={styles.groupTitle}>Mensagens do WhatsApp</h4>
          <Toggle
            label="Som de mensagem nova"
            description="Toca um aviso curto quando um cliente manda mensagem, em qualquer tela do sistema."
            checked={prefs.whatsappSound}
            onChange={() => togglePref('whatsappSound')}
          />
          <Toggle
            label="Pop-up de mensagem nova"
            description="Mostra o nome do cliente e o começo da mensagem; clicar abre a conversa."
            checked={prefs.whatsappPopup}
            disabled={permission !== 'granted'}
            onChange={() => togglePref('whatsappPopup')}
          />
          <button type="button" className={styles.linkBtn} onClick={() => playNotificationSound()}>
            <Volume2 size={14} /> Ouvir o som
          </button>
        </>
      )}

      <h4 className={styles.groupTitle}>Avisos do sistema</h4>
      <Toggle
        label="Pop-up de avisos"
        description="Tarefas, aprovações de posts, pedidos de senha e demais avisos do sino de notificações."
        checked={prefs.systemPopup}
        disabled={permission !== 'granted'}
        onChange={() => togglePref('systemPopup')}
      />
      <p className={styles.hint}>Os avisos continuam sempre no sino do topo da tela, mesmo com os pop-ups desligados.</p>

      <FeedbackBar feedback={notifyFeedback} />
    </div>
  );

  const renderCompany = () => (
    <form className={styles.panel} onSubmit={saveCompany}>
      <div className={styles.panelHead}>
        <h3>Dados da empresa</h3>
        <p>O nome da empresa aparece para toda a equipe, no totem e no painel de senhas e nas mensagens de chamada pelo WhatsApp.</p>
      </div>

      {!companyForm ? (
        companyFeedback ? <FeedbackBar feedback={companyFeedback} /> : <div className={styles.loading}><Loader2 size={18} className={styles.spin} /> Carregando...</div>
      ) : (
        <>
          <div className={styles.formGrid}>
            <label className={`${styles.field} ${styles.fullWidth}`}>
              <span>Nome da empresa</span>
              <input className={styles.input} value={companyForm.name} maxLength={120} onChange={(e) => editCompany('name', e.target.value)} required />
            </label>
            <label className={styles.field}>
              <span>CNPJ / CPF</span>
              <input className={styles.input} value={companyForm.document} maxLength={20} placeholder="00.000.000/0001-00" onChange={(e) => editCompany('document', e.target.value)} />
            </label>
            <label className={styles.field}>
              <span>E-mail de contato</span>
              <input className={styles.input} type="email" value={companyForm.contact_email} maxLength={160} placeholder="contato@empresa.com" onChange={(e) => editCompany('contact_email', e.target.value)} />
            </label>
            <label className={styles.field}>
              <span>Telefone</span>
              <input className={styles.input} value={companyForm.phone} maxLength={30} inputMode="tel" placeholder="(11) 3333-4444" onChange={(e) => editCompany('phone', e.target.value)} />
            </label>
            <label className={styles.field}>
              <span>Site</span>
              <input className={styles.input} value={companyForm.website} maxLength={200} placeholder="www.suaempresa.com.br" onChange={(e) => editCompany('website', e.target.value)} />
            </label>
            <label className={`${styles.field} ${styles.fullWidth}`}>
              <span>Endereço</span>
              <input className={styles.input} value={companyForm.address} maxLength={300} placeholder="Rua, número, bairro, cidade - UF, CEP" onChange={(e) => editCompany('address', e.target.value)} />
            </label>
          </div>

          <FeedbackBar feedback={companyFeedback} />

          <div className={styles.panelActions}>
            {companyDraft && (
              <button type="button" className={styles.secondaryBtn} onClick={() => setCompanyDraft(null)} disabled={companyBusy}>Descartar</button>
            )}
            <button type="submit" className={styles.primaryBtn} disabled={companyBusy || !companyDraft}>
              {companyBusy ? <Loader2 size={16} className={styles.spin} /> : <Save size={16} />} Salvar dados
            </button>
          </div>
        </>
      )}
    </form>
  );

  const renderPlan = () => (
    <div className={styles.panel}>
      <div className={styles.panelHead}>
        <h3>Plano e módulos</h3>
        <p>Os módulos do plano definem o que aparece no menu para toda a sua equipe.</p>
      </div>

      {!plan ? (
        companyFeedback ? <FeedbackBar feedback={companyFeedback} /> : <div className={styles.loading}><Loader2 size={18} className={styles.spin} /> Carregando...</div>
      ) : (
        <>
          <div className={styles.planCard}>
            <div>
              <span className={styles.eyebrow}>Plano atual</span>
              <h4>{plan.is_platform ? 'Plataforma Vórtice' : plan.name || 'Sem plano'}</h4>
              {!plan.is_platform && plan.price !== null && <span className={styles.planPrice}>{money(plan.price)}<small>/mês</small></span>}
            </div>
            <span className={`${styles.badge} ${plan.is_platform || (plan.name && plan.active && plan.status === 'ACTIVE') ? styles.badgeOk : styles.badgeWarn}`}>
              {plan.is_platform ? 'Todos os módulos' : plan.status !== 'ACTIVE' ? 'Empresa suspensa' : !plan.name ? 'Sem plano' : plan.active ? 'Ativo' : 'Plano desativado'}
            </span>
          </div>

          {!plan.is_platform && (!plan.name || !plan.active) && (
            <div className={styles.error}><AlertTriangle size={16} /> Sem um plano ativo, a equipe só vê Início, Chat, Equipe, Integrações, Configurações e Ajuda.</div>
          )}

          <ul className={styles.moduleList}>
            {PLAN_MODULES.map((item) => {
              const included = plan.modules.includes(item.key) && (plan.is_platform || plan.active);
              return (
                <li key={item.key} className={included ? styles.moduleOn : styles.moduleOff}>
                  <span className={styles.moduleIcon}>{included ? <Check size={14} /> : <Lock size={13} />}</span>
                  <div>
                    <strong>{item.label}</strong>
                    <small>{item.description}</small>
                  </div>
                </li>
              );
            })}
          </ul>

          {!plan.is_platform && <p className={styles.hint}>Para mudar de plano ou liberar outro módulo, fale com a Vórtice Tecnologia.</p>}
        </>
      )}
    </div>
  );

  const content = {
    profile: renderProfile,
    security: renderSecurity,
    notifications: renderNotifications,
    company: renderCompany,
    plan: renderPlan,
  }[currentTab]();

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <span className={styles.eyebrow}>Preferências da conta</span>
        <h2>Configurações</h2>
        <p>{isAdmin ? 'Seu perfil, sua senha, avisos deste aparelho e o cadastro da sua empresa.' : 'Seu perfil, sua senha e os avisos deste aparelho.'}</p>
      </header>

      <div className={styles.layout}>
        <nav className={styles.nav} aria-label="Seções de configurações">
          {visibleTabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={`${styles.navItem} ${currentTab === id ? styles.navItemActive : ''}`}
              onClick={() => openTab(id)}
              aria-current={currentTab === id ? 'page' : undefined}
            >
              <Icon size={18} /> {label}
            </button>
          ))}
        </nav>
        <div className={styles.content}>{content}</div>
      </div>
    </div>
  );
}
