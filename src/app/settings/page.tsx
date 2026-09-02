"use client";

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import {
  BellRing,
  Building2,
  Check,
  CreditCard,
  Lock,
  Save,
  User,
  X,
} from 'lucide-react';
import styles from './settings.module.css';
import { useAuth } from '@/context/AuthContext';
import { useBrowserNotifications } from '@/hooks/useBrowserNotifications';

type TabType = 'profile' | 'company' | 'preferences' | 'billing';

interface CompanySettings {
  name: string;
  cnpj: string;
  site: string;
  currency: string;
  address: string;
}

interface PreferenceSettings {
  email: boolean;
  whatsapp: boolean;
  browser: boolean;
}

interface BillingSettings {
  plan: string;
  cycle: string;
  billingEmail: string;
  taxId: string;
  autoRenew: boolean;
}

const DEFAULT_COMPANY: CompanySettings = {
  name: 'Vórtice Tecnologia',
  cnpj: '',
  site: '',
  currency: 'BRL',
  address: '',
};

const DEFAULT_PREFERENCES: PreferenceSettings = {
  email: true,
  whatsapp: true,
  browser: false,
};

const DEFAULT_BILLING: BillingSettings = {
  plan: 'Não definido',
  cycle: 'monthly',
  billingEmail: '',
  taxId: '',
  autoRenew: false,
};

const storageKey = (name: string, userId?: string | null, tenantId?: string | null) => (
  `${name}:${tenantId || userId || 'default'}`
);

function readStorage<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const stored = localStorage.getItem(key);
    return stored ? { ...fallback, ...JSON.parse(stored) } : fallback;
  } catch {
    return fallback;
  }
}

export default function SettingsPage() {
  const { user, refreshUser } = useAuth();
  const { permission: browserPermission, requestPermission } = useBrowserNotifications();
  const [activeTab, setActiveTab] = useState<TabType>('profile');
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  const [profileName, setProfileName] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [profileAvatar, setProfileAvatar] = useState('');
  const [profileTimezone, setProfileTimezone] = useState('America/Sao_Paulo');

  const [company, setCompany] = useState<CompanySettings>(DEFAULT_COMPANY);
  const [preferences, setPreferences] = useState<PreferenceSettings>(DEFAULT_PREFERENCES);
  const [billing, setBilling] = useState<BillingSettings>(DEFAULT_BILLING);

  useEffect(() => {
    if (!user) return;
    // Hydrates the form from the authenticated profile and browser-persisted settings.
    setProfileName(user.name || '');
    setProfileEmail(user.email || '');
    setProfilePhone(user.phone || '');
    setProfileAvatar(user.avatar_url || '');
    setCompany(readStorage(storageKey('vortice-company-settings', user.id, user.tenant_id), DEFAULT_COMPANY));
    setPreferences(readStorage(storageKey('vortice-preferences', user.id, user.tenant_id), DEFAULT_PREFERENCES));
    setBilling(readStorage(storageKey('vortice-billing-settings', user.id, user.tenant_id), DEFAULT_BILLING));
    const profilePreferences = readStorage(storageKey('vortice-profile-settings', user.id, user.tenant_id), { timezone: 'America/Sao_Paulo' });
    setProfileTimezone(profilePreferences.timezone);
  }, [user]);

  useEffect(() => {
    setPreferences(current => ({ ...current, browser: browserPermission === 'granted' }));
  }, [browserPermission]);

  useEffect(() => {
    if (!statusMessage) return;
    const timeout = window.setTimeout(() => setStatusMessage(''), 3500);
    return () => window.clearTimeout(timeout);
  }, [statusMessage]);

  const handleAvatarChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setStatusMessage('A foto precisa ter no máximo 2MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = loadEvent => setProfileAvatar(String(loadEvent.target?.result || ''));
    reader.readAsDataURL(file);
  };

  const handleBrowserNotificationToggle = async () => {
    if (browserPermission === 'granted') return;
    const nextPermission = await requestPermission();
    if (nextPermission === 'denied') {
      setStatusMessage('As notificações foram bloqueadas pelo navegador.');
    }
  };

  const saveProfileLocally = () => {
    if (!user) return;
    try {
      const storedUser = JSON.parse(localStorage.getItem('vortice_user') || '{}');
      localStorage.setItem('vortice_user', JSON.stringify({
        ...storedUser,
        name: profileName,
        phone: profilePhone,
        avatar_url: profileAvatar || null,
      }));
    } catch {
      // The form remains usable even if browser storage is unavailable.
    }
  };

  const handleResetPasswordDemand = async () => {
    if (!profileEmail) return;
    setIsSaving(true);
    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: profileEmail }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível solicitar a redefinição.');
      setStatusMessage('Solicitação de redefinição enviada ao administrador.');
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Erro ao solicitar redefinição de senha.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    setIsSaving(true);
    try {
      const keySuffix = storageKey('', user.id, user.tenant_id).replace(/^:/, '');
      if (activeTab === 'profile') {
        let remoteSaved = false;
        try {
          const response = await fetch('/api/users/profile', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'x-user-id': user.id },
            body: JSON.stringify({ name: profileName.trim(), phone: profilePhone.trim(), avatar_url: profileAvatar }),
          });
          if (!response.ok) throw new Error('Perfil remoto indisponível.');
          await refreshUser();
          remoteSaved = true;
        } catch {
          saveProfileLocally();
        }
        localStorage.setItem(`vortice-profile-settings:${keySuffix}`, JSON.stringify({ timezone: profileTimezone }));
        setStatusMessage(remoteSaved ? 'Perfil atualizado com sucesso.' : 'Perfil salvo neste navegador.');
      } else if (activeTab === 'company') {
        localStorage.setItem(`vortice-company-settings:${keySuffix}`, JSON.stringify(company));
        setStatusMessage('Dados da empresa salvos neste navegador.');
      } else if (activeTab === 'preferences') {
        localStorage.setItem(`vortice-preferences:${keySuffix}`, JSON.stringify(preferences));
        setStatusMessage('Notificações e preferências salvas.');
      } else {
        localStorage.setItem(`vortice-billing-settings:${keySuffix}`, JSON.stringify(billing));
        setStatusMessage('Preferências de assinatura salvas.');
      }
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Não foi possível salvar as configurações.');
    } finally {
      setIsSaving(false);
    }
  };

  const renderToggle = (label: string, description: string, value: boolean, onChange: () => void) => (
    <div className={styles.toggleRow}>
      <div><div className={styles.toggleLabel}>{label}</div><div className={styles.toggleDesc}>{description}</div></div>
      <button type="button" className={`${styles.toggleSwitch} ${value ? styles.active : ''}`} role="switch" aria-checked={value} onClick={onChange}><span className={styles.toggleSlider} /></button>
    </div>
  );

  const renderContent = () => {
    if (activeTab === 'profile') {
      return (
        <div className={styles.panel}>
          <h3 className={styles.panelTitle}>Meu Perfil</h3>
          <div className={styles.avatarUpload}>
            <div className={styles.avatarPreview}>{profileAvatar ? <Image src={profileAvatar} alt="Avatar" width={80} height={80} unoptimized /> : profileName ? profileName.slice(0, 2).toUpperCase() : 'US'}</div>
            <div><input type="file" id="avatar-input" accept="image/*" className={styles.hiddenInput} onChange={handleAvatarChange} /><button type="button" className={styles.uploadBtn} onClick={() => document.getElementById('avatar-input')?.click()}>Trocar Foto (Avatar)</button><p className={styles.fieldHint}>JPG, GIF ou PNG. Máximo de 2MB.</p></div>
          </div>
          <div className={styles.formGrid}>
            <div className={styles.formGroup}><label>Nome Completo</label><input required type="text" className={styles.input} value={profileName} onChange={event => setProfileName(event.target.value)} /></div>
            <div className={styles.formGroup}><label>E-mail (Login)</label><input type="email" className={styles.input} value={profileEmail} readOnly /><span className={styles.fieldHint}>O e-mail de login é controlado pelo administrador.</span></div>
            <div className={styles.formGroup}><label>Telefone / WhatsApp</label><input type="text" className={styles.input} value={profilePhone} onChange={event => setProfilePhone(event.target.value)} /></div>
            <div className={styles.formGroup}><label>Fuso Horário</label><select className={styles.select} value={profileTimezone} onChange={event => setProfileTimezone(event.target.value)}><option value="America/Sao_Paulo">Brasília (GMT-3)</option><option value="America/Manaus">Manaus (GMT-4)</option><option value="America/Rio_Branco">Rio Branco (GMT-5)</option></select></div>
          </div>
          <div className={styles.dangerZone}><div className={styles.dangerTitle}>Segurança da Conta</div><p>Solicite ao administrador um link para redefinir sua senha.</p><button type="button" className={styles.uploadBtn} onClick={handleResetPasswordDemand} disabled={isSaving}><Lock size={16} /> Redefinir Senha</button></div>
        </div>
      );
    }

    if (activeTab === 'company') {
      return (
        <div className={styles.panel}>
          <h3 className={styles.panelTitle}>Dados da Empresa</h3>
          <p className={styles.panelIntro}>Esses dados ficam associados à sua conta neste navegador até que uma tabela corporativa seja conectada.</p>
          <div className={styles.formGrid}>
            <div className={styles.formGroup}><label>Razão Social / Nome Fantasia</label><input required type="text" className={styles.input} value={company.name} onChange={event => setCompany(current => ({ ...current, name: event.target.value }))} /></div>
            <div className={styles.formGroup}><label>CNPJ</label><input type="text" className={styles.input} value={company.cnpj} onChange={event => setCompany(current => ({ ...current, cnpj: event.target.value }))} placeholder="00.000.000/0000-00" /></div>
            <div className={styles.formGroup}><label>Site Oficial</label><input type="url" className={styles.input} value={company.site} onChange={event => setCompany(current => ({ ...current, site: event.target.value }))} placeholder="https://suaempresa.com.br" /></div>
            <div className={styles.formGroup}><label>Moeda Padrão</label><select className={styles.select} value={company.currency} onChange={event => setCompany(current => ({ ...current, currency: event.target.value }))}><option value="BRL">BRL - Real Brasileiro (R$)</option><option value="USD">USD - Dólar Americano ($)</option><option value="EUR">EUR - Euro (€)</option></select></div>
            <div className={`${styles.formGroup} ${styles.fullWidth}`}><label>Endereço Completo</label><input type="text" className={styles.input} value={company.address} onChange={event => setCompany(current => ({ ...current, address: event.target.value }))} placeholder="Rua, número, bairro, cidade e CEP" /></div>
          </div>
          <div className={styles.settingsInfo}><Building2 size={18} /><span>As alterações são persistidas por usuário e empresa neste navegador. Quando o cadastro corporativo estiver conectado ao banco, esta mesma estrutura poderá ser migrada sem perder os campos.</span></div>
        </div>
      );
    }

    if (activeTab === 'preferences') {
      return (
        <div className={styles.panel}>
          <h3 className={styles.panelTitle}>Notificações & Preferências</h3>
          {renderToggle('Alertas por E-mail', 'Receba resumos diários e alertas de novos leads via e-mail corporativo.', preferences.email, () => setPreferences(current => ({ ...current, email: !current.email })))}
          {renderToggle('Notificações no WhatsApp', 'Receba mensagens quando um lead responder aos funis ou te marcar.', preferences.whatsapp, () => setPreferences(current => ({ ...current, whatsapp: !current.whatsapp })))}
          <div className={styles.toggleRow} style={{ borderBottom: 'none' }}><div><div className={styles.toggleLabel}>Notificações do Navegador (Sistema)</div><div className={styles.toggleDesc}>{browserPermission === 'granted' ? 'Ativas neste navegador para alertas do CRM.' : browserPermission === 'denied' ? 'Bloqueadas pelo navegador. Altere a permissão nas configurações do site.' : browserPermission === 'unsupported' ? 'Este navegador não oferece notificações do sistema.' : 'Permita alertas do sistema para receber notificações mesmo com a aba minimizada.'}</div></div><button type="button" className={`${styles.toggleSwitch} ${preferences.browser ? styles.active : ''}`} role="switch" aria-checked={preferences.browser} onClick={handleBrowserNotificationToggle}><span className={styles.toggleSlider} /></button></div>
          <div className={styles.settingsInfo}><BellRing size={18} /><span>Use Salvar Alterações para persistir suas preferências. A permissão do navegador também depende das configurações do próprio Chrome.</span></div>
        </div>
      );
    }

    return (
      <div className={styles.panel}>
        <h3 className={styles.panelTitle}>Assinatura & Faturas</h3>
        <p className={styles.panelIntro}>Edite suas preferências de cobrança. Dados de plano e faturas aparecerão quando um provedor de pagamentos for conectado.</p>
        <div className={styles.formGrid}>
          <div className={styles.formGroup}><label>Plano atual</label><select className={styles.select} value={billing.plan} onChange={event => setBilling(current => ({ ...current, plan: event.target.value }))}><option>Não definido</option><option>Essencial</option><option>Profissional</option><option>Enterprise</option></select></div>
          <div className={styles.formGroup}><label>Ciclo de cobrança</label><select className={styles.select} value={billing.cycle} onChange={event => setBilling(current => ({ ...current, cycle: event.target.value }))}><option value="monthly">Mensal</option><option value="annual">Anual</option></select></div>
          <div className={styles.formGroup}><label>E-mail financeiro</label><input type="email" className={styles.input} value={billing.billingEmail} onChange={event => setBilling(current => ({ ...current, billingEmail: event.target.value }))} placeholder="financeiro@empresa.com" /></div>
          <div className={styles.formGroup}><label>Documento de cobrança</label><input type="text" className={styles.input} value={billing.taxId} onChange={event => setBilling(current => ({ ...current, taxId: event.target.value }))} placeholder="CPF ou CNPJ" /></div>
        </div>
        <div className={styles.toggleRow} style={{ marginTop: '1rem', borderBottom: 'none' }}><div><div className={styles.toggleLabel}>Renovação automática</div><div className={styles.toggleDesc}>Mantenha esta preferência pronta para quando a cobrança online estiver habilitada.</div></div><button type="button" className={`${styles.toggleSwitch} ${billing.autoRenew ? styles.active : ''}`} role="switch" aria-checked={billing.autoRenew} onClick={() => setBilling(current => ({ ...current, autoRenew: !current.autoRenew }))}><span className={styles.toggleSlider} /></button></div>
        <div className={styles.emptyBilling}><CreditCard size={22} /><strong>Histórico de faturas indisponível</strong><span>Nenhuma fonte de cobrança está conectada à conta.</span></div>
      </div>
    );
  };

  return (
    <div className={styles.container}>
      <header className={styles.headerRow}>
        <div className={styles.titleSection}><span className={styles.pageEyebrow}>PREFERÊNCIAS DA CONTA</span><h2>Configurações do Sistema</h2><p>Gerencie seu perfil, dados corporativos, notificações e preferências de assinatura.</p></div>
        <button type="button" className={styles.saveBtn} onClick={handleSave} disabled={isSaving}><Save size={18} /> {isSaving ? 'Salvando...' : 'Salvar Alterações'}</button>
      </header>

      {statusMessage && <div className={styles.statusMessage} role="status"><Check size={16} /> {statusMessage}<button type="button" onClick={() => setStatusMessage('')} aria-label="Fechar mensagem"><X size={14} /></button></div>}

      <div className={styles.contentArea}>
        <nav className={styles.sidebarNav} aria-label="Seções de configurações">
          <button type="button" className={`${styles.navItem} ${activeTab === 'profile' ? styles.navItemActive : ''}`} onClick={() => setActiveTab('profile')}><User size={18} /> Meu Perfil</button>
          <button type="button" className={`${styles.navItem} ${activeTab === 'company' ? styles.navItemActive : ''}`} onClick={() => setActiveTab('company')}><Building2 size={18} /> Dados da Empresa</button>
          <button type="button" className={`${styles.navItem} ${activeTab === 'preferences' ? styles.navItemActive : ''}`} onClick={() => setActiveTab('preferences')}><BellRing size={18} /> Notificações</button>
          <button type="button" className={`${styles.navItem} ${activeTab === 'billing' ? styles.navItemActive : ''}`} onClick={() => setActiveTab('billing')}><CreditCard size={18} /> Assinatura & Faturas</button>
        </nav>
        <div className={styles.dynamicContent}>{renderContent()}</div>
      </div>
    </div>
  );
}
