"use client";

import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import styles from './users.module.css';

import { supabase } from '@/lib/supabase';
import { useTheme } from '@/components/ThemeProvider';
import { useAuth } from '@/context/AuthContext';

import {
  type Role,
  type Status,
  type Permissions,
  DEFAULT_PERMISSIONS,
  SELLER_PERMISSIONS,
} from './constants';
import UserListSidebar from './components/UserListSidebar';
import UserInfoTab from './components/UserInfoTab';
import UserPermissionsTab from './components/UserPermissionsTab';
import UserUpdatesTab from './components/UserUpdatesTab';
import UserPersonalizationTab from './components/UserPersonalizationTab';
import NewMemberModal from './components/NewMemberModal';

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'info' | 'permissions' | 'updates' | 'personalization'>('info');
  const [isEditing, setIsEditing] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [systemUpdates, setSystemUpdates] = useState<any[]>([]);

  const { config, refreshConfig } = useTheme();
  const { user } = useAuth();

  // Branding states
  const [primaryColor, setPrimaryColor] = useState(config.primary_color);
  const [secondaryColor, setSecondaryColor] = useState(config.secondary_color);
  const [logoUrl, setLogoUrl] = useState(config.logo_url);
  const [faviconUrl, setFaviconUrl] = useState(config.favicon_url);
  const [appName, setAppName] = useState(config.app_name);

  const handleFileSelect = (type: 'logo' | 'favicon', e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Optional size/type check could go here
    const reader = new FileReader();
    reader.onload = (event) => {
      const b64 = event.target?.result as string;
      if (type === 'logo') setLogoUrl(b64);
      else setFaviconUrl(b64);
    };
    reader.readAsDataURL(file);
  };

  // Update form
  const [upAction, setUpAction] = useState('');
  const [upTarget, setUpTarget] = useState('');

  // New user form
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<Role>('SELLER');
  const [newUserPermissions, setNewUserPermissions] = useState<Permissions>(SELLER_PERMISSIONS);

  // Local form states
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('SELLER');
  const [status, setStatus] = useState<Status>('ACTIVE');
  const [userPermissions, setUserPermissions] = useState<any>(null);
  const [allTemplates, setAllTemplates] = useState<{ id: string; name: string }[]>([]);
  const [allowedTemplates, setAllowedTemplates] = useState<string[]>([]);

  const fetchUsers = async () => {
    if (!user) return;
    setLoading(true);
    const response = await fetch('/api/users?scope=team', {
      headers: { 'x-user-id': user.id },
      cache: 'no-store',
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error('Erro ao carregar equipe:', result.error);
    }

    const nextUsers = response.ok && Array.isArray(result.data)
      ? [...result.data]
      : [];

    // Garante que o administrador/usuário atual também apareça na própria equipe,
    // mesmo quando a lista retornar incompleta.
    if (!nextUsers.some(profile => profile.id === user.id)) {
      nextUsers.unshift(user);
    }

    setUsers(nextUsers);
    if (nextUsers.length > 0 && !selectedUserId) {
      setSelectedUserId(nextUsers[0].id);
    }
    setLoading(false);
  };

  const fetchAllTemplates = async () => {
    const res = await fetch('/api/messages/templates');
    const json = await res.json();
    setAllTemplates(json.templates ?? []);
  };

  const fetchSystemUpdates = async () => {
    if (!supabase) return;
    const { data } = await supabase.from('system_updates').select('*').order('created_at', { ascending: false });
    if (data) setSystemUpdates(data);
  };

  React.useEffect(() => {
    if (!user) return;
    fetchUsers();
    fetchSystemUpdates();
    fetchAllTemplates();
  }, [user]);

  const selectedUser = users.find(u => u.id === selectedUserId);

  React.useEffect(() => {
    if (selectedUser) {
      setName(selectedUser.name);
      setEmail(selectedUser.email);
      setRole(selectedUser.role as Role);
      setStatus((selectedUser.status || 'ACTIVE') as Status);
      setUserPermissions(selectedUser.permissions || SELLER_PERMISSIONS);
      setAllowedTemplates(selectedUser.allowed_templates ?? []);
      setIsEditing(false);
    }
  }, [selectedUserId, users]);

  const togglePermission = (category: keyof Permissions, field: string) => {
    setUserPermissions((prev: any) => ({
      ...prev,
      [category]: {
         ...(prev[category] as any),
        [field]: !(prev[category] as any)[field]
      }
    }));
    setIsEditing(true);
  };

  const toggleNewUserPermission = (category: keyof Permissions, field: string) => {
    setNewUserPermissions((prev: any) => ({
      ...prev,
      [category]: {
        ...(prev[category] as any),
        [field]: !(prev[category] as any)[field]
      }
    }));
  };

  const handleNameChange = (value: string) => { setName(value); setIsEditing(true); };
  const handleEmailChange = (value: string) => { setEmail(value); setIsEditing(true); };
  const handleStatusChange = (value: Status) => { setStatus(value); setIsEditing(true); };
  const handleRoleChange = (newRole: Role) => {
    setRole(newRole);
    setIsEditing(true);
    if (newRole === 'ADMIN') setUserPermissions(DEFAULT_PERMISSIONS);
    else if (newRole === 'SELLER') setUserPermissions(SELLER_PERMISSIONS);
  };
  const handleAllowedTemplatesChange = (next: string[]) => {
    setAllowedTemplates(next);
    setIsEditing(true);
  };

  const saveChanges = async () => {
    if (!name || !email || !selectedUserId || !supabase) return;

    setLoading(true);
    const { error } = await supabase.from('profiles').update({
      name,
      email,
      role,
      status,
      permissions: userPermissions,
      allowed_templates: allowedTemplates
    }).eq('id', selectedUserId);

    if (!error) {
      await fetchUsers();
      setIsEditing(false);
    }
    setLoading(false);
  };

  const handleCreateMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserName || !newUserEmail || !newUserPassword || !user?.id) return;

    setLoading(true);

    try {
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id,
        },
        body: JSON.stringify({
          name: newUserName,
          email: newUserEmail,
          password: newUserPassword,
          role: newUserRole,
          permissions: newUserPermissions,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Não foi possível criar o membro.');
      }

      await fetchUsers();
      setIsAddModalOpen(false);
      setNewUserName('');
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserRole('SELLER');
      setNewUserPermissions(SELLER_PERMISSIONS);
    } catch (error: unknown) {
      alert(`Erro ao criar membro: ${error instanceof Error ? error.message : 'Tente novamente.'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteMember = async () => {
    if (!selectedUserId || !supabase) return;

    if (window.confirm(`Tem certeza que deseja remover o membro ${selectedUser?.name}? Esta ação não pode ser desfeita.`)) {
      setLoading(true);
      const { error } = await supabase.from('profiles').delete().eq('id', selectedUserId);

      if (!error) {
        setSelectedUserId(null);
        await fetchUsers();
      } else {
        alert("Erro ao remover membro: " + error.message);
      }
      setLoading(false);
    }
  };

  const createNewMember = () => {
     setIsAddModalOpen(true);
  };

  const handleCreateUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!upAction || !supabase || !selectedUser) return;

    setLoading(true);
    const { error } = await supabase.from('system_updates').insert([{
      user_name: selectedUser.name,
      action: upAction,
      target: upTarget,
      icon_name: 'TrendingUp'
    }]);

    if (!error) {
      setUpAction('');
      setUpTarget('');
      await fetchSystemUpdates();
    }
    setLoading(false);
  };

  const handleDeleteUpdate = async (id: string) => {
     if (!supabase) return;
     await supabase.from('system_updates').delete().eq('id', id);
     await fetchSystemUpdates();
  };

  const saveBrandingConfig = async () => {
    if (!supabase) return;
    setLoading(true);
    const { error } = await supabase.from('system_config').update({
       primary_color: primaryColor,
       secondary_color: secondaryColor,
       logo_url: logoUrl,
       favicon_url: faviconUrl,
       app_name: appName,
       updated_at: new Date()
    }).eq('id', 'branding');

    if (!error) {
       await refreshConfig();
       alert("Identidade Visual atualizada com sucesso!");
    }
    setLoading(false);
  };

  return (
    <div className={styles.container}>
      <header className={styles.headerRow}>
        <div className={styles.titleSection}>
          <h2>Equipe e Permissões</h2>
          <p>Selecione um membro para gerenciar seus acessos e informações.</p>
        </div>

        <button className={styles.addBtn} onClick={createNewMember}>
          <Plus size={18} /> Novo Membro
        </button>
      </header>

      <div className={styles.splitLayout}>
        <UserListSidebar users={users} selectedUserId={selectedUserId} onSelectUser={setSelectedUserId} />

        <main className={styles.mainEditorSection}>
          {selectedUser && (
            <div className={styles.editorContainer}>
              <div className={styles.editorProfileHeader}>
                <div className={styles.profileMain}>
                  <div className={styles.profileAvatarLarge}>
                    {selectedUser.name.charAt(0)}{selectedUser.name.split(' ')[1]?.charAt(0) || ''}
                  </div>
                  <div className={styles.profileTexts}>
                    <h3>{selectedUser.name}</h3>
                    <p>{selectedUser.email}</p>
                  </div>
                </div>

                {isEditing && (
                  <button className={styles.saveAlertBtn} onClick={saveChanges}>
                    <Plus size={16} /> Salvar Alterações
                  </button>
                )}
              </div>

              <div className={styles.tabSwitcher}>
                <button
                  className={`${styles.tabBtn} ${activeTab === 'info' ? styles.tabActive : ''}`}
                  onClick={() => setActiveTab('info')}
                >
                  Informações
                </button>
                <button
                  className={`${styles.tabBtn} ${activeTab === 'permissions' ? styles.tabActive : ''}`}
                  onClick={() => setActiveTab('permissions')}
                >
                  Permissões de Acesso
                </button>
                <button
                  className={`${styles.tabBtn} ${activeTab === 'updates' ? styles.tabActive : ''}`}
                  onClick={() => setActiveTab('updates')}
                >
                  Emitir Atualização
                </button>
                <button
                  className={`${styles.tabBtn} ${activeTab === 'personalization' ? styles.tabActive : ''}`}
                  onClick={() => setActiveTab('personalization')}
                >
                  Personalização
                </button>
              </div>

              <div className={styles.editorScroller}>
                {activeTab === 'info' ? (
                  <UserInfoTab
                    name={name}
                    email={email}
                    role={role}
                    status={status}
                    loading={loading}
                    onNameChange={handleNameChange}
                    onEmailChange={handleEmailChange}
                    onRoleChange={handleRoleChange}
                    onStatusChange={handleStatusChange}
                    onDeleteMember={handleDeleteMember}
                  />
                ) : activeTab === 'permissions' ? (
                  <UserPermissionsTab
                    userPermissions={userPermissions}
                    allTemplates={allTemplates}
                    allowedTemplates={allowedTemplates}
                    onTogglePermission={togglePermission}
                    onAllowedTemplatesChange={handleAllowedTemplatesChange}
                  />
                ) : activeTab === 'updates' ? (
                  <UserUpdatesTab
                    upAction={upAction}
                    upTarget={upTarget}
                    loading={loading}
                    systemUpdates={systemUpdates}
                    onUpActionChange={setUpAction}
                    onUpTargetChange={setUpTarget}
                    onSubmit={handleCreateUpdate}
                    onDeleteUpdate={handleDeleteUpdate}
                  />
                ) : (
                  <UserPersonalizationTab
                    primaryColor={primaryColor}
                    secondaryColor={secondaryColor}
                    appName={appName}
                    logoUrl={logoUrl}
                    faviconUrl={faviconUrl}
                    loading={loading}
                    onPrimaryColorChange={setPrimaryColor}
                    onSecondaryColorChange={setSecondaryColor}
                    onAppNameChange={setAppName}
                    onLogoUrlChange={setLogoUrl}
                    onFaviconUrlChange={setFaviconUrl}
                    onFileSelect={handleFileSelect}
                    onSaveBranding={saveBrandingConfig}
                  />
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      <NewMemberModal
        isOpen={isAddModalOpen}
        loading={loading}
        newUserName={newUserName}
        newUserEmail={newUserEmail}
        newUserRole={newUserRole}
        newUserPassword={newUserPassword}
        newUserPermissions={newUserPermissions}
        onClose={() => setIsAddModalOpen(false)}
        onNameChange={setNewUserName}
        onEmailChange={setNewUserEmail}
        onRoleChange={setNewUserRole}
        onPasswordChange={setNewUserPassword}
        onTogglePermission={toggleNewUserPermission}
        onSubmit={handleCreateMember}
      />
    </div>
  );
}
