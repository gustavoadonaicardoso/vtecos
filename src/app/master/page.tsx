"use client";

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  ShieldCheck, 
  Upload, 
  Palette, 
  Type, 
  Image as ImageIcon,
  Save,
  RotateCcw,
  Eye,
  CheckCircle2,
  Layout,
  ClipboardList,
  ShieldAlert,
  Activity,
  Settings,
  ChevronRight,
  Menu,
  Check,
  Zap,
  Users as UsersIcon,
  MessageSquare,
  MessageCircle,
  BarChart3,
  Lock,
  Blocks,
  Calendar,
  Ticket,
  Bell,
  HelpCircle,
  Building2,
  Plus
} from 'lucide-react';
import Link from 'next/link';
import ThemeToggle from '@/components/ThemeToggle';
import NotificationDropdown from '@/components/NotificationDropdown';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/components/ThemeProvider';
import styles from './master.module.css';
import { supabase } from '@/lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';

const DEFAULT_SETTINGS = {
  siteName: 'Vórtice CRM',
  primaryColor: '#3b82f6',
  accentColor: '#8b5cf6',
  bgColor: '#0a0a0f',
  logoText: 'Vórtice CRM',
  logoUrl: '',
  faviconUrl: '',
  sidebarBg: '',
};

const SIDEBAR_PRESETS = [
  { label: 'Padrão (Sistema)', value: '' },
  { label: 'Azul Escuro', value: 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)' },
  { label: 'Roxo Profundo', value: 'linear-gradient(180deg, #1a0533 0%, #2d1b69 100%)' },
  { label: 'Verde Flóresta', value: 'linear-gradient(180deg, #052e16 0%, #14532d 100%)' },
  { label: 'Carvão', value: 'linear-gradient(180deg, #111111 0%, #1c1c1c 100%)' },
  { label: 'Azul Céu', value: 'linear-gradient(180deg, #0c1445 0%, #1d3b8a 100%)' },
  { label: 'Rosa/Violâ', value: 'linear-gradient(180deg, #4a0e3f 0%, #7b1d6c 100%)' },
  { label: 'Cobre/Ouro', value: 'linear-gradient(180deg, #1c0e00 0%, #3d2000 100%)' },
  { label: 'Branco Puro', value: '#ffffff' },
  { label: 'Cinza Claro', value: 'linear-gradient(180deg, #f8f9fa 0%, #e9ecef 100%)' },
  { label: 'Personalizado', value: '__custom__' },
];

export default function MasterPage() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState<'branding' | 'modules' | 'permissions' | 'tenants'>('modules');
  const [tenants, setTenants] = useState<any[]>([]);
  const [newTenantName, setNewTenantName] = useState('');
  const [selectedRole, setSelectedRole] = useState<'ADMIN' | 'MANAGER' | 'SELLER'>('SELLER');
  const [loading, setLoading] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [customSidebarColor, setCustomSidebarColor] = useState('#1e293b');
  const { user } = useAuth();
  const { refreshConfig, config: themeConfig } = useTheme();
  const [rolePermissions, setRolePermissions] = useState<any>({
    ADMIN: { dashboard: { view: true, kpis: true }, pipeline: { view: true }, leads: { view: true }, messages: { view: true, send: true }, team: { view: true }, automations: { view: true }, integrations: { view: true }, admin: { projects: true, settings: true } },
    MANAGER: { dashboard: { view: true, kpis: true }, pipeline: { view: true }, leads: { view: true }, messages: { view: true, send: true }, team: { view: true }, automations: { view: false }, integrations: { view: true }, admin: { projects: true, settings: false } },
    SELLER: { dashboard: { view: true, kpis: false }, pipeline: { view: true }, leads: { view: true }, messages: { view: true, send: false }, team: { view: false }, automations: { view: false }, integrations: { view: false }, admin: { projects: false, settings: false } }
  });
  const router = useRouter();
  
  const logoRef = useRef<HTMLInputElement>(null);
  const faviconRef = useRef<HTMLInputElement>(null);

  const masterModules = [
    {
      id: 'banners',
      title: 'Gestão de Banners',
      desc: 'Altere os destaques e avisos exibidos na página inicial para todos os usuários.',
      icon: Layout,
      color: '#3b82f6',
      path: '/admin/banners'
    },
    {
      id: 'projetos',
      title: 'Planos de Ação',
      desc: 'Formule as estratégias, metas e projetos em andamento dos seus clientes.',
      icon: ClipboardList,
      color: '#8b5cf6',
      path: '/admin/projetos'
    },
    {
      id: 'permissions',
      title: 'Níveis de Permissão',
      desc: 'Configure papéis de acesso e permissões granulares de toda a estação.',
      icon: ShieldAlert,
      color: '#ef4444',
      path: '/users'
    },
    {
      id: 'logs',
      title: 'Audit Logs',
      desc: 'Veja o histórico completo de ações de todos os atendentes e robôs.',
      icon: Activity,
      color: '#10b981',
      path: '/admin/logs'
    },
    {
      id: 'automations',
      title: 'Configurações Master',
      desc: 'Ajuste tempos globais de expiração e limites de API.',
      icon: Settings,
      color: '#f59e0b',
      path: '/automations'
    }
  ];

  useEffect(() => {
    const stored = localStorage.getItem('vortice-master-settings');
    if (stored) setSettings(JSON.parse(stored));
    
    // Initial CSS apply
    if (stored) {
      const s = JSON.parse(stored);
      document.documentElement.style.setProperty('--brand-primary', s.primaryColor);
      document.documentElement.style.setProperty('--brand-accent', s.accentColor);
    }
  }, []);

  useEffect(() => {
    if (themeConfig) {
      setSettings(prev => ({
        ...prev,
        primaryColor: themeConfig.primary_color || prev.primaryColor,
        accentColor: themeConfig.secondary_color || prev.accentColor,
        siteName: themeConfig.app_name || prev.siteName,
        sidebarBg: themeConfig.sidebar_bg || prev.sidebarBg,
        logoUrl: themeConfig.logo_url || prev.logoUrl,
        faviconUrl: themeConfig.favicon_url || prev.faviconUrl,
      }));
    }
  }, [themeConfig]);

  useEffect(() => {
    // Fetch actual permissions from DB to sync UI
    const fetchPermissions = async () => {
      if (!supabase) return;
      
      const { data, error } = await supabase
        .from('profiles')
        .select('role, permissions');
      
      if (data && !error) {
        const perms: any = { ...rolePermissions };
        data.forEach(profile => {
          if (profile.role && profile.permissions) {
            perms[profile.role] = profile.permissions;
          }
        });
        setRolePermissions(perms);
      }
    };

    fetchPermissions();
  }, []);

  // Fetch Tenants
  useEffect(() => {
    if (activeTab === 'tenants') {
      const fetchTenants = async () => {
        const res = await fetch('/api/tenants');
        const json = await res.json();
        if (json.data) setTenants(json.data);
      };
      fetchTenants();
    }
  }, [activeTab]);

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTenantName.trim()) return;
    setLoading(true);

    const res = await fetch('/api/tenants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newTenantName.trim() }),
    });
    const json = await res.json();

    if (!res.ok || json.error) {
      alert(`Erro ao criar empresa:\n${json.error}`);
    } else if (json.data) {
      setTenants(prev => [json.data, ...prev]);
      setNewTenantName('');
    }
    setLoading(false);
  };


  // Realtime System Notifications
  useEffect(() => {
    if (!user || !supabase) return;

    const fetchCount = async () => {
      const { count, error } = await supabase
        .from('system_notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_read', false);
      
      if (!error) setUnreadCount(count || 0);
    };

    fetchCount();

    const channel = supabase
      .channel('master_system_notifications')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'system_notifications',
        filter: `user_id=eq.${user.id}`
      }, () => fetchCount())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const handleChange = (key: string, value: string) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleFileUpload = (key: 'logoUrl' | 'faviconUrl', e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const b64 = event.target?.result as string;
      setSettings(prev => ({ ...prev, [key]: b64 }));
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    localStorage.setItem('vortice-master-settings', JSON.stringify(settings));
    document.documentElement.style.setProperty('--brand-primary', settings.primaryColor);
    document.documentElement.style.setProperty('--brand-accent', settings.accentColor);
    document.title = settings.siteName;

    // Persiste no Supabase (incluindo todos os campos para não perder dados)
    if (supabase) {
      const sidebarBgValue = settings.sidebarBg === '__custom__' ? customSidebarColor : settings.sidebarBg;
      
      const { error } = await supabase
        .from('system_config')
        .upsert({
          id: 'branding',
          primary_color: settings.primaryColor,
          secondary_color: settings.accentColor,
          sidebar_bg: sidebarBgValue,
          app_name: settings.siteName,
          logo_url: settings.logoUrl,
          favicon_url: settings.faviconUrl,
        });

      if (error) {
        console.error('Erro ao salvar branding:', error);
        alert('Erro ao salvar configurações.');
        return;
      }

      // Aplica imediatamente na página via variável CSS
      if (sidebarBgValue) {
        document.documentElement.style.setProperty('--sidebar-bg', sidebarBgValue);
      } else {
        document.documentElement.style.removeProperty('--sidebar-bg');
      }
      
      // Atualiza o contexto global para que todos os componentes reflitam a mudança
      await refreshConfig();
    }

    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const toggleRolePermission = (category: string, field: string) => {
    setRolePermissions((prev: any) => ({
      ...prev,
      [selectedRole]: {
        ...prev[selectedRole],
        [category]: {
          ...prev[selectedRole][category],
          [field]: !prev[selectedRole][category]?.[field]
        }
      }
    }));
  };

  const applyToAll = async () => {
    if (!supabase) {
      alert("Configuração do Supabase não encontrada.");
      return;
    }
    
    setLoading(true);
    const { error } = await supabase
      .from('profiles')
      .update({ permissions: rolePermissions[selectedRole] })
      .eq('role', selectedRole);

    if (error) {
      alert("Erro ao aplicar permissões: " + error.message);
    } else {
      alert(`As permissões para ${selectedRole} foram salvas e aplicadas a todos os usuários deste nível com sucesso.`);
    }
    
    setSaved(true);
    setLoading(false);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleReset = () => {
    setSettings(DEFAULT_SETTINGS);
    localStorage.removeItem('vortice-master-settings');
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.headerIcon}>
            <ShieldCheck size={28} />
          </div>
          <div>
            <h1>Painel Master</h1>
            <p>Controle total sobre a infraestrutura e identidade do sistema.</p>
          </div>
        </div>
        
        <div className={styles.tabNav}>
          <button 
            className={`${styles.tabBtn} ${activeTab === 'modules' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('modules')}
          >
            Módulo de Comando
          </button>
          <button 
            className={`${styles.tabBtn} ${activeTab === 'branding' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('branding')}
          >
            Identidade Visual
          </button>
          <button 
            className={`${styles.tabBtn} ${activeTab === 'permissions' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('permissions')}
          >
            Gestão de Menu
          </button>
          <button 
            className={`${styles.tabBtn} ${activeTab === 'tenants' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('tenants')}
          >
            Múltiplas Empresas
          </button>
        </div>

        <div className={styles.headerActions}>

           {(activeTab === 'branding' || activeTab === 'permissions') && (
             <div className={styles.actionButtons}>
               {activeTab === 'branding' && (
                 <button className={styles.resetBtn} onClick={handleReset}>
                  <RotateCcw size={16} /> Padrões
                 </button>
               )}
               <button 
                className={`${styles.saveBtn} ${saved ? styles.saveBtnSuccess : ''}`} 
                onClick={activeTab === 'branding' ? handleSave : applyToAll}
               >
                {saved ? <><CheckCircle2 size={16} /> Salvo!</> : <><Save size={16} /> {activeTab === 'permissions' ? 'Salvar e Aplicar' : 'Salvar'}</>}
               </button>
             </div>
           )}
        </div>
      </header>

      <AnimatePresence mode="wait">
        {activeTab === 'modules' ? (
          <motion.div 
            key="modules"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className={styles.modulesGrid}
          >
            {masterModules.map((mod, idx) => (
              <div 
                key={mod.id} 
                className={styles.moduleCard}
                onClick={() => router.push(mod.path)}
              >
                <div className={styles.cardHeaderSmall}>
                  <div className={styles.iconBox} style={{ color: mod.color, background: `${mod.color}15` }}>
                    <mod.icon size={22} />
                  </div>
                  <ChevronRight size={18} className={styles.arrowIcon} />
                </div>
                <div className={styles.cardBodySmall}>
                  <h3>{mod.title}</h3>
                  <p>{mod.desc}</p>
                </div>
              </div>
            ))}

          </motion.div>
        ) : activeTab === 'permissions' ? (
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
                {['ADMIN', 'MANAGER', 'SELLER'].map((r) => (
                  <button
                    key={r}
                    className={`${styles.roleTabBtn} ${selectedRole === r ? styles.roleTabActive : ''}`}
                    onClick={() => setSelectedRole(r as any)}
                  >
                    {r === 'ADMIN' && <ShieldCheck size={16} />}
                    {r === 'MANAGER' && <UsersIcon size={16} />}
                    {r === 'SELLER' && <Zap size={16} />}
                    {r}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.menuItemsGrid}>
              {[
                { id: 'dashboard.view', label: 'Dashboard (Início)', icon: Layout, cat: 'dashboard', field: 'view' },
                { id: 'admin.projects', label: 'Projetos', icon: ClipboardList, cat: 'admin', field: 'projects' },
                { id: 'messages.view', label: 'Mensagens (WhatsApp)', icon: MessageSquare, cat: 'messages', field: 'view' },
                { id: 'messages.send', label: 'Chat Interno', icon: MessageCircle, cat: 'messages', field: 'send' },
                { id: 'pipeline.view', label: 'Pipeline/Kanban', icon: RotateCcw, cat: 'pipeline', field: 'view' },
                { id: 'leads.view', label: 'Gestão de Leads', icon: UsersIcon, cat: 'leads', field: 'view' },
                { id: 'dashboard.kpis', label: 'Relatórios/KPIs', icon: BarChart3, cat: 'dashboard', field: 'kpis' },
                { id: 'integrations.view', label: 'Integrações e Agendamento', icon: Blocks, cat: 'integrations', field: 'view' },
                { id: 'team.view', label: 'Gestão de Equipe', icon: Settings, cat: 'team', field: 'view' },
                { id: 'automations.view', label: 'Automações', icon: Zap, cat: 'automations', field: 'view' },
                { id: 'admin.settings', label: 'Configurações', icon: Lock, cat: 'admin', field: 'settings' },
              ].map((item) => {
                const isEnabled = rolePermissions[selectedRole][item.cat]?.[item.field];
                return (
                  <div 
                    key={item.id} 
                    className={`${styles.menuConfigCard} ${isEnabled ? styles.menuEnabled : ''}`}
                    onClick={() => toggleRolePermission(item.cat, item.field)}
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
        ) : activeTab === 'tenants' ? (
          <motion.div
            key="tenants"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className={styles.grid}
          >
            <div className={styles.card} style={{ gridColumn: '1 / -1' }}>
              <div className={styles.cardHeader}>
                <Building2 size={20} />
                <h2>Gestão de Empresas (Multi-Tenant)</h2>
              </div>
              <p style={{ opacity: 0.7, marginBottom: '20px', fontSize: '0.9rem' }}>
                Crie e gerencie ambientes isolados para diferentes clientes (empresas).
                Cada empresa criada ganha sua própria base de Leads, Configurações e Pipeline.
              </p>

              <form onSubmit={handleCreateTenant} style={{ display: 'flex', gap: '10px', marginBottom: '30px' }}>
                <input 
                  type="text" 
                  value={newTenantName}
                  onChange={(e) => setNewTenantName(e.target.value)}
                  placeholder="Nome do novo Tenant (Empresa)"
                  className={styles.input}
                  style={{ flex: 1 }}
                  required
                />
                <button type="submit" className={styles.saveBtn} disabled={loading} style={{ display:'flex', gap:'8px', alignItems:'center'}}>
                  <Plus size={18} /> Criar Empresa
                </button>
              </form>

              <div className={styles.tableWrapper}>
                <table className={styles.performanceTable}>
                  <thead>
                    <tr>
                      <th>ID da Empresa</th>
                      <th>Nome</th>
                      <th>Status</th>
                      <th>Criado Em</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tenants.map((t) => (
                      <tr key={t.id}>
                        <td style={{ opacity: 0.6, fontSize: '0.8rem' }}>{t.id}</td>
                        <td><strong>{t.name}</strong></td>
                        <td>
                          <span className={styles.statusBadge} style={{ background: t.status === 'ACTIVE' ? '#10b98120' : '#ef444420', color: t.status === 'ACTIVE' ? '#10b981' : '#ef4444' }}>
                            {t.status}
                          </span>
                        </td>
                        <td>{new Date(t.created_at).toLocaleDateString('pt-BR')}</td>
                      </tr>
                    ))}
                    {tenants.length === 0 && (
                      <tr><td colSpan={4} style={{ textAlign: 'center', opacity: 0.5 }}>Nenhuma empresa encontrada</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div 
            key="branding"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className={styles.grid}
          >
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <Type size={20} />
                <h2>Identidade do Sistema</h2>
              </div>
              <div className={styles.field}>
                <label>Nome do Sistema</label>
                <input
                  type="text"
                  value={settings.siteName}
                  onChange={e => handleChange('siteName', e.target.value)}
                  className={styles.input}
                />
              </div>
              <div className={styles.field}>
                <label>Texto do Logo (Fallback)</label>
                <input
                  type="text"
                  value={settings.logoText}
                  onChange={e => handleChange('logoText', e.target.value)}
                  className={styles.input}
                />
              </div>
            </div>

            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <ImageIcon size={20} />
                <h2>Logo & Favicon</h2>
              </div>
              <div className={styles.uploadArea}>
                <div className={styles.uploadBox} onClick={() => logoRef.current?.click()}>
                  {settings.logoUrl ? <img src={settings.logoUrl} alt="Logo" className={styles.previewImg} /> : <Upload size={24} />}
                </div>
                <input ref={logoRef} type="file" hidden onChange={e => handleFileUpload('logoUrl', e)} />
                <div className={styles.uploadBoxSmall} onClick={() => faviconRef.current?.click()}>
                   {settings.faviconUrl ? <img src={settings.faviconUrl} alt="Favicon" style={{width:24}} /> : <ImageIcon size={20} />}
                </div>
                <input ref={faviconRef} type="file" hidden onChange={e => handleFileUpload('faviconUrl', e)} />
              </div>
            </div>

            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <Palette size={20} />
                <h2>Paleta de Cores</h2>
              </div>
              <div className={styles.colorGrid}>
                {['primaryColor', 'accentColor', 'bgColor'].map(key => (
                  <div key={key} className={styles.colorItem}>
                    <div className={styles.colorPreview} style={{ background: settings[key as keyof typeof settings] }}>
                      <input type="color" value={settings[key as keyof typeof settings]} onChange={e => handleChange(key, e.target.value)} className={styles.colorInput} />
                    </div>
                    <span>{key === 'primaryColor' ? 'Primária' : key === 'accentColor' ? 'Destaque' : 'Fundo'}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <Palette size={20} />
                <h2>Background da Sidebar</h2>
              </div>
              <p style={{ fontSize: '0.83rem', opacity: 0.5, marginBottom: '1rem' }}>
                Escolha um preset ou defina uma cor personalizada para o fundo do menu lateral.
              </p>
              <div className={styles.sidebarPresets}>
                {SIDEBAR_PRESETS.map((preset) => {
                  const isCustom = preset.value === '__custom__';
                  const isActive = settings.sidebarBg === preset.value;
                  return (
                    <button
                      key={preset.label}
                      className={`${styles.presetBtn} ${isActive ? styles.presetBtnActive : ''}`}
                      onClick={() => handleChange('sidebarBg', preset.value)}
                      title={preset.label}
                    >
                      <span
                        className={styles.presetSwatch}
                        style={{
                          background: isCustom ? customSidebarColor : (preset.value || 'var(--panel-bg)'),
                          border: preset.value === '' ? '2px dashed rgba(255,255,255,0.25)' : undefined,
                        }}
                      />
                      <span className={styles.presetLabel}>{preset.label}</span>
                    </button>
                  );
                })}
              </div>
              {settings.sidebarBg === '__custom__' && (
                <div className={styles.customColorRow}>
                  <label>Cor personalizada</label>
                  <div className={styles.colorPreview} style={{ background: customSidebarColor }}>
                    <input
                      type="color"
                      value={customSidebarColor}
                      onChange={e => setCustomSidebarColor(e.target.value)}
                      className={styles.colorInput}
                    />
                  </div>
                  <span style={{ fontSize: '0.8rem', opacity: 0.5 }}>{customSidebarColor}</span>
                </div>
              )}
              {/* Live preview strip */}
              <div className={styles.sidebarPreviewStrip}>
                <div
                  className={styles.sidebarPreviewBox}
                  style={{
                    background: settings.sidebarBg === '__custom__'
                      ? customSidebarColor
                      : (settings.sidebarBg || 'var(--panel-bg)')
                  }}
                >
                  <div className={styles.previewNavItem} />
                  <div className={styles.previewNavItem} style={{ opacity: 0.4 }} />
                  <div className={styles.previewNavItem} style={{ opacity: 0.4 }} />
                  <div className={styles.previewNavItemActive} />
                  <div className={styles.previewNavItem} style={{ opacity: 0.4 }} />
                </div>
                <span style={{ fontSize: '0.75rem', opacity: 0.4 }}>Pré-visualização do menu</span>
              </div>
            </div>
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <Eye size={20} />
                <h2>Pré-visualização</h2>
              </div>
              <div className={styles.preview} style={{ background: settings.bgColor }}>
                 <div style={{ padding: '20px', color: settings.primaryColor }}>{settings.siteName}</div>
                 <div style={{ marginLeft: '20px', padding: '10px 20px', borderRadius: '8px', background: settings.primaryColor, color: '#fff', width: 'fit-content' }}>Botão de Exemplo</div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
