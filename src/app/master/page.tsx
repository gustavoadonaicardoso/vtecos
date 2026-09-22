"use client";

import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/components/ThemeProvider';
import styles from './master.module.css';
import { supabase } from '@/lib/supabase';
import { AnimatePresence } from 'framer-motion';
import { DEFAULT_ROLE_PERMISSIONS, DEFAULT_SETTINGS } from './constants';
import type { BannerItem, MasterSettings, Role, RolePermissions, TabId, Tenant } from './types';
import MasterHeader from './components/MasterHeader';
import ModulesTab from './components/ModulesTab';
import PermissionsTab from './components/PermissionsTab';
import BannersTab from './components/BannersTab';
import TenantsTab from './components/TenantsTab';
import BrandingTab from './components/BrandingTab';

export default function MasterPage() {
  const [settings, setSettings] = useState<MasterSettings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('modules');
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [newTenantName, setNewTenantName] = useState('');
  const [selectedRole, setSelectedRole] = useState<Role>('SELLER');
  const [loading, setLoading] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [customSidebarColor, setCustomSidebarColor] = useState('#1e293b');
  const { user } = useAuth();
  const { refreshConfig, config: themeConfig } = useTheme();
  const [rolePermissions, setRolePermissions] = useState<RolePermissions>(DEFAULT_ROLE_PERMISSIONS);

  // ── Banner Management State ──────────────────────────────────
  const [banners, setBanners] = useState<BannerItem[]>([]);
  const [editingBannerIdx, setEditingBannerIdx] = useState<number | null>(null);
  const [bannerSaved, setBannerSaved] = useState(false);
  const [bannerLoading, setBannerLoading] = useState(false);

  useEffect(() => {
    if (activeTab === 'banners') fetchBanners();
  }, [activeTab]);

  const fetchBanners = async () => {
    if (!supabase) return;
    setBannerLoading(true);
    const { data } = await supabase.from('platform_banners').select('*').order('created_at', { ascending: false });
    if (data) {
      setBanners(data.map(b => ({
        id: b.id,
        title: b.title,
        description: b.description,
        date: b.date,
        type: b.type,
        color: b.color,
        iconName: b.icon_name,
        target_roles: b.target_roles ?? [],
      })));
    } else {
      try { const s = localStorage.getItem('vortice_banners'); if (s) setBanners(JSON.parse(s)); } catch {}
    }
    setBannerLoading(false);
  };

  const saveBanner = async (idx: number) => {
    const banner = banners[idx];
    if (!supabase) return;
    if (banner.id) {
      await supabase.from('platform_banners').update({
        title: banner.title,
        description: banner.description,
        date: banner.date,
        type: banner.type,
        color: banner.color,
        icon_name: banner.iconName,
        target_roles: banner.target_roles,
      }).eq('id', banner.id);
    } else {
      const { data } = await supabase.from('platform_banners').insert({
        title: banner.title,
        description: banner.description,
        date: banner.date,
        type: banner.type,
        color: banner.color,
        icon_name: banner.iconName,
        target_roles: banner.target_roles,
      }).select().single();
      if (data) {
        const updated = [...banners];
        updated[idx] = { ...updated[idx], id: data.id };
        setBanners(updated);
      }
    }
    localStorage.setItem('vortice_banners', JSON.stringify(banners));
    setBannerSaved(true);
    setEditingBannerIdx(null);
    setTimeout(() => setBannerSaved(false), 2500);
  };

  const removeBanner = async (idx: number) => {
    if (!confirm('Remover este banner permanentemente?')) return;
    const banner = banners[idx];
    if (supabase && banner.id) {
      await supabase.from('platform_banners').delete().eq('id', banner.id);
    }
    const next = banners.filter((_, i) => i !== idx);
    setBanners(next);
    localStorage.setItem('vortice_banners', JSON.stringify(next));
    setEditingBannerIdx(null);
  };

  const addBanner = () => {
    const newBanner: BannerItem = {
      title: 'Novo Comunicado',
      description: 'Descreva aqui o conteúdo do banner.',
      date: new Date().toLocaleDateString('pt-BR'),
      type: 'Comunicado',
      color: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
      iconName: 'sparkles',
      target_roles: [],
    };
    setBanners(prev => [newBanner, ...prev]);
    setEditingBannerIdx(0);
  };

  const updateBannerField = (idx: number, field: keyof BannerItem, val: any) => {
    const next = [...banners];
    next[idx] = { ...next[idx], [field]: val };
    setBanners(next);
  };

  const toggleBannerRole = (idx: number, role: string) => {
    const current = banners[idx].target_roles ?? [];
    const next = current.includes(role)
      ? current.filter(r => r !== role)
      : [...current, role];
    updateBannerField(idx, 'target_roles', next);
  };

  const logoRef = useRef<HTMLInputElement>(null);
  const faviconRef = useRef<HTMLInputElement>(null);

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
    setRolePermissions((prev) => ({
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
      <MasterHeader
        activeTab={activeTab}
        onTabChange={setActiveTab}
        saved={saved}
        bannerSaved={bannerSaved}
        onSave={activeTab === 'branding' ? handleSave : applyToAll}
        onReset={handleReset}
        onAddBanner={addBanner}
      />

      <AnimatePresence mode="wait">
        {activeTab === 'modules' ? (
          <ModulesTab key="modules" />
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
            editingBannerIdx={editingBannerIdx}
            onEditBanner={setEditingBannerIdx}
            onUpdateField={updateBannerField}
            onToggleRole={toggleBannerRole}
            onSaveBanner={saveBanner}
            onRemoveBanner={removeBanner}
          />
        ) : activeTab === 'tenants' ? (
          <TenantsTab
            key="tenants"
            tenants={tenants}
            newTenantName={newTenantName}
            onNewTenantNameChange={setNewTenantName}
            onCreateTenant={handleCreateTenant}
            loading={loading}
          />
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
    </div>
  );
}
