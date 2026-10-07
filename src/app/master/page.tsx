"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useTheme } from '@/components/ThemeProvider';
import styles from './master.module.css';
import { supabase } from '@/lib/supabase';
import { AnimatePresence } from 'framer-motion';
import { DEFAULT_ROLE_PERMISSIONS, DEFAULT_SETTINGS, SIDEBAR_PRESETS } from './constants';
import type { BrandingConfig } from '@/types';
import type { BannerItem, MasterSettings, Role, RolePermissions, TabId } from './types';
import MasterHeader from './components/MasterHeader';
import ModulesTab from './components/ModulesTab';
import PermissionsTab from './components/PermissionsTab';
import BannersTab from './components/BannersTab';
import BannerEditModal from './components/BannerEditModal';
import TenantsTab from './components/TenantsTab';
import HelpTab from './components/HelpTab';
import BrandingTab from './components/BrandingTab';
import PlatformTab from './components/PlatformTab';
import StatusTab from './components/StatusTab';

const IMAGE_LIMITS = { logoUrl: 300 * 1024, faviconUrl: 100 * 1024 };
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const ROLE_LABELS: Record<Role, string> = { ADMIN: 'Administrador', MANAGER: 'Gerente', SELLER: 'Vendedor / Atendente' };

/** Configuração salva → campos da aba (cor hex fora dos presets = "Personalizado"). */
function settingsFromConfig(config: BrandingConfig | undefined) {
  const sidebar = config?.sidebar_bg || '';
  const custom = !SIDEBAR_PRESETS.some((preset) => preset.value === sidebar) && HEX_COLOR.test(sidebar);
  return {
    customColor: custom ? sidebar : '#1e293b',
    settings: {
      primaryColor: config?.primary_color || DEFAULT_SETTINGS.primaryColor,
      accentColor: config?.secondary_color || DEFAULT_SETTINGS.accentColor,
      siteName: config?.app_name || DEFAULT_SETTINGS.siteName,
      sidebarBg: custom ? '__custom__' : sidebar,
      logoUrl: config?.logo_url || '',
      faviconUrl: config?.favicon_url || '',
    } satisfies MasterSettings,
  };
}

export default function MasterPage() {
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // ?tab=help&article=slug abre direto o editor (botão "Editar" da Ajuda).
  // A página só monta no navegador (depois do login), então ler a URL aqui é seguro.
  const [deepLink] = useState(() => {
    if (typeof window === 'undefined') return { tab: null as string | null, article: null as string | null };
    const params = new URLSearchParams(window.location.search);
    return { tab: params.get('tab'), article: params.get('article') };
  });
  const [activeTab, setActiveTab] = useState<TabId>(() => (deepLink.tab === 'help' || deepLink.tab === 'platform' || deepLink.tab === 'status' ? deepLink.tab : 'modules'));
  const [selectedRole, setSelectedRole] = useState<Role>('SELLER');
  const { refreshConfig, config: themeConfig } = useTheme();
  // Enquanto não há edição, a aba mostra o que está salvo.
  const savedBranding = useMemo(() => settingsFromConfig(themeConfig), [themeConfig]);
  const [edits, setEdits] = useState<MasterSettings | null>(null);
  const [customColorEdit, setCustomSidebarColor] = useState<string | null>(null);
  const settings = edits ?? savedBranding.settings;
  const customSidebarColor = customColorEdit ?? savedBranding.customColor;
  const [rolePermissions, setRolePermissions] = useState<RolePermissions>(DEFAULT_ROLE_PERMISSIONS);

  const [banners, setBanners] = useState<BannerItem[]>([]);
  const [editingBanner, setEditingBanner] = useState<BannerItem | null>(null);
  const [bannerSaved, setBannerSaved] = useState(false);
  const [bannerLoading, setBannerLoading] = useState(false);
  const [bannerError, setBannerError] = useState('');

  const logoRef = useRef<HTMLInputElement>(null);
  const faviconRef = useRef<HTMLInputElement>(null);

  // ── Banners ──────────────────────────────────────────────────

  const fetchBanners = useCallback(async () => {
    setBannerLoading(true);
    try {
      const response = await fetch('/api/master/banners', { cache: 'no-store' });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || 'Falha ao carregar.');
      setBanners(json.data as BannerItem[]);
      setBannerError('');
    } catch (loadError) {
      setBannerError(`Não foi possível carregar os banners: ${(loadError as Error).message}`);
    }
    setBannerLoading(false);
  }, []);

  const changeTab = (tab: TabId) => {
    setActiveTab(tab);
    setError('');
    setSaved(false);
    if (tab === 'banners') fetchBanners();
  };

  const saveBanner = async (banner: BannerItem): Promise<string | null> => {
    const response = await fetch(banner.id ? `/api/master/banners/${banner.id}` : '/api/master/banners', {
      method: banner.id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(banner),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) return `Não foi possível salvar: ${json.error || 'erro desconhecido'}`;

    setEditingBanner(null);
    setBannerSaved(true);
    setTimeout(() => setBannerSaved(false), 2500);
    await fetchBanners();
    return null;
  };

  const removeBanner = async (banner: BannerItem): Promise<string | null> => {
    if (!banner.id) return null;
    const response = await fetch(`/api/master/banners/${banner.id}`, { method: 'DELETE' });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) return `Não foi possível remover: ${json.error || 'erro desconhecido'}`;
    setEditingBanner(null);
    await fetchBanners();
    return null;
  };

  /** Sobe/desce um banner no carrossel. */
  const moveBanner = async (banner: BannerItem, direction: -1 | 1) => {
    const index = banners.findIndex((item) => item.id === banner.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= banners.length) return;
    const next = [...banners];
    [next[index], next[target]] = [next[target], next[index]];
    setBanners(next);
    await fetch('/api/master/banners/order', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: next.map((item) => item.id) }) });
  };

  const addBanner = () => {
    setEditingBanner({
      title: 'Novo comunicado',
      description: 'Descreva aqui o conteúdo do banner.',
      date: '',
      type: 'Novidade',
      color: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
      iconName: 'sparkles',
      imageUrl: '',
      linkUrl: '/suporte',
      buttonLabel: 'Abrir',
      startsAt: '',
      endsAt: '',
      active: true,
      audience: 'clients',
      targetTenants: [],
      targetModules: [],
      target_roles: [],
      dismissible: true,
    });
  };

  // ── Identidade visual ────────────────────────────────────────

  const handleChange = (key: keyof MasterSettings, value: string) => {
    setEdits(prev => ({ ...(prev ?? settings), [key]: value }));
  };

  const handleFileUpload = (key: 'logoUrl' | 'faviconUrl', e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Envie um arquivo de imagem (PNG, JPG, SVG, WEBP ou ICO).');
      return;
    }
    if (file.size > IMAGE_LIMITS[key]) {
      setError(`Imagem muito grande: o limite é ${IMAGE_LIMITS[key] / 1024} KB. Reduza o arquivo e tente de novo.`);
      return;
    }

    setError('');
    const reader = new FileReader();
    reader.onload = (event) => {
      const value = String(event.target?.result || '');
      setEdits(prev => ({ ...(prev ?? settings), [key]: value }));
    };
    reader.readAsDataURL(file);
  };

  const flashSaved = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleSave = async () => {
    if (!supabase) return;
    if (!settings.siteName.trim()) {
      setError('Informe o nome do sistema.');
      return;
    }

    setSaving(true);
    setError('');
    const sidebarBgValue = settings.sidebarBg === '__custom__' ? customSidebarColor : settings.sidebarBg;

    const { error: saveError } = await supabase
      .from('system_config')
      .upsert({
        id: 'branding',
        primary_color: settings.primaryColor,
        secondary_color: settings.accentColor,
        sidebar_bg: sidebarBgValue,
        app_name: settings.siteName.trim(),
        logo_url: settings.logoUrl,
        favicon_url: settings.faviconUrl,
      });

    if (saveError) {
      setSaving(false);
      setError(`Não foi possível salvar a identidade visual: ${saveError.message}`);
      return;
    }

    // Recarrega a configuração global: aplica cores, menu, favicon e título.
    await refreshConfig();
    setEdits(null);
    setCustomSidebarColor(null);
    setSaving(false);
    flashSaved();
  };

  const handleReset = () => {
    if (!confirm('Voltar nome, cor, logo, favicon e menu lateral para o padrão? Nada muda até você clicar em Salvar.')) return;
    setEdits(DEFAULT_SETTINGS);
  };

  // ── Menu por função ──────────────────────────────────────────

  useEffect(() => {
    // Lê as permissões atuais da equipe (a RLS limita à própria empresa).
    // Perfil sem permissões gravadas vê tudo, então não serve de modelo:
    // nesse caso a função fica com o padrão.
    const fetchPermissions = async () => {
      if (!supabase) return;
      const { data } = await supabase.from('profiles').select('role, permissions').neq('role', 'ADMIN');
      if (!data) return;

      const next: RolePermissions = { ...DEFAULT_ROLE_PERMISSIONS };
      const taken = new Set<string>();
      data.forEach((profile) => {
        const perms = profile.permissions as RolePermissions[string] | null;
        if (!profile.role || taken.has(profile.role) || !perms || Object.keys(perms).length === 0) return;
        next[profile.role] = perms;
        taken.add(profile.role);
      });
      setRolePermissions(next);
    };

    fetchPermissions();
  }, []);

  const toggleRolePermission = (category: string, field: string) => {
    if (selectedRole === 'ADMIN') return;
    setRolePermissions((prev) => ({
      ...prev,
      [selectedRole]: {
        ...prev[selectedRole],
        [category]: {
          ...prev[selectedRole]?.[category],
          [field]: !prev[selectedRole]?.[category]?.[field],
        },
      },
    }));
  };

  const applyToAll = async () => {
    if (selectedRole === 'ADMIN') {
      setError('Administradores têm acesso total: escolha Gerente ou Vendedor para ajustar o menu.');
      return;
    }
    if (!confirm(`Aplicar este menu a todos os usuários com a função ${ROLE_LABELS[selectedRole]}? Ajustes individuais feitos em Equipe serão substituídos.`)) return;

    setSaving(true);
    setError('');
    // Pelo servidor: só os usuários da própria empresa recebem as permissões.
    const response = await fetch('/api/users/role-permissions', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: selectedRole, permissions: rolePermissions[selectedRole] }),
    });
    const result = await response.json().catch(() => ({}));
    setSaving(false);

    if (!response.ok) {
      setError(`Não foi possível aplicar: ${result.error || 'falha desconhecida'}`);
      return;
    }
    flashSaved();
  };

  return (
    <div className={styles.container}>
      <MasterHeader
        activeTab={activeTab}
        onTabChange={changeTab}
        saved={saved}
        saving={saving}
        bannerSaved={bannerSaved}
        onSave={activeTab === 'branding' ? handleSave : applyToAll}
        onReset={handleReset}
        onAddBanner={addBanner}
      />

      {error && <div className={styles.errorBanner} role="alert">{error}</div>}

      <AnimatePresence mode="wait">
        {activeTab === 'modules' ? (
          <ModulesTab key="modules" onOpenTab={changeTab} />
        ) : activeTab === 'permissions' ? (
          <PermissionsTab
            key="permissions"
            selectedRole={selectedRole}
            onSelectRole={setSelectedRole}
            rolePermissions={rolePermissions}
            onTogglePermission={toggleRolePermission}
          />
        ) : activeTab === 'banners' ? (
          <BannersTab
            key="banners"
            banners={banners}
            bannerLoading={bannerLoading}
            error={bannerError}
            onEditBanner={setEditingBanner}
            onMove={moveBanner}
          />
        ) : activeTab === 'tenants' ? (
          <TenantsTab key="tenants" />
        ) : activeTab === 'help' ? (
          <HelpTab key="help" initialArticle={deepLink.article} />
        ) : activeTab === 'status' ? (
          <StatusTab key="status" />
        ) : activeTab === 'platform' ? (
          <PlatformTab key="platform" />
        ) : (
          <BrandingTab
            key="branding"
            settings={settings}
            onChange={handleChange}
            onFileUpload={handleFileUpload}
            logoRef={logoRef}
            faviconRef={faviconRef}
            customSidebarColor={customSidebarColor}
            onCustomSidebarColorChange={setCustomSidebarColor}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editingBanner && (
          <BannerEditModal
            key={editingBanner.id || 'new'}
            banner={editingBanner}
            onClose={() => setEditingBanner(null)}
            onSave={saveBanner}
            onRemove={removeBanner}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
