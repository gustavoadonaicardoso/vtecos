"use client";

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Plus, 
  Search, 
  Edit2, 
  Trash2, 
  Key,
  ShieldAlert,
  X,
  User,
  LayoutDashboard,
  Kanban,
  Users,
  MessageSquare,
  Zap,
  Blocks,
  UserCog
} from 'lucide-react';
import styles from './users.module.css';

import { supabase } from '@/lib/supabase';
import { useTheme } from '@/components/ThemeProvider';

// Real Data Types
type Role = 'ADMIN' | 'MANAGER' | 'SELLER';
type Status = 'ACTIVE' | 'INACTIVE';

interface Permissions {
  dashboard: { view: boolean; kpis: boolean; funnel: boolean; activities: boolean };
  pipeline: { view: boolean; move: boolean; edit: boolean; manageStages: boolean };
  leads: { view: boolean; edit: boolean; delete: boolean; tags: boolean; export: boolean; create: boolean };
  messages: { view: boolean; send: boolean; start: boolean; addContact: boolean; templates: boolean; signatures: boolean };
  automations: { view: boolean; manage: boolean };
  integrations: { view: boolean; manage: boolean };
  team: { view: boolean; manage: boolean; editPermissions: boolean };
  admin: { banners: boolean; projects: boolean; settings: boolean };
}

const DEFAULT_PERMISSIONS: Permissions = {
  dashboard: { view: true, kpis: true, funnel: true, activities: true },
  pipeline: { view: true, move: true, edit: true, manageStages: true },
  leads: { view: true, edit: true, delete: true, tags: true, export: true, create: true },
  messages: { view: true, send: true, start: true, addContact: true, templates: true, signatures: true },
  automations: { view: true, manage: true },
  integrations: { view: true, manage: true },
  team: { view: true, manage: true, editPermissions: true },
  admin: { banners: true, projects: true, settings: true },
};

const SELLER_PERMISSIONS: Permissions = {
  dashboard: { view: true, kpis: true, funnel: false, activities: false },
  pipeline: { view: true, move: true, edit: true, manageStages: false },
  leads: { view: true, edit: true, delete: false, tags: true, export: false, create: false },
  messages: { view: true, send: true, start: true, addContact: false, templates: false, signatures: true },
  automations: { view: false, manage: false },
  integrations: { view: false, manage: false },
  team: { view: false, manage: false, editPermissions: false },
  admin: { banners: false, projects: false, settings: false },
};

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'info' | 'permissions' | 'updates' | 'personalization'>('info');
  const [isEditing, setIsEditing] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [systemUpdates, setSystemUpdates] = useState<any[]>([]);

  const { config, refreshConfig } = useTheme();

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
    if (!supabase) return;
    setLoading(true);
    const { data, error } = await supabase.from('profiles').select('*').order('name');
    if (data) {
      setUsers(data);
      if (data.length > 0 && !selectedUserId) {
        setSelectedUserId(data[0].id);
      }
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
    fetchUsers();
    fetchSystemUpdates();
    fetchAllTemplates();
  }, []);

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

  const categoryMap: any = {
    dashboard: { name: 'Painel Geral', icon: LayoutDashboard, color: '#3b82f6' },
    pipeline: { name: 'Funil & Kanban', icon: Kanban, color: '#8b5cf6' },
    leads: { name: 'Gestão de Lead', icon: Users, color: '#10b981' },
    messages: { name: 'Central Mensagens', icon: MessageSquare, color: '#f59e0b' },
    automations: { name: 'Robôs/Automações', icon: Zap, color: '#ef4444' },
    integrations: { name: 'Canais/API', icon: Blocks, color: '#3b82f6' },
    team: { name: 'Gestão de Equipe', icon: UserCog, color: '#10b981' },
    admin: { name: 'Config. Avançadas', icon: ShieldAlert, color: '#ef4444' }
  };

  const fieldMap: any = {
    view: 'Visualizar Módulo',
    kpis: 'Ver Indicadores',
    funnel: 'Ver Funil de Vendas',
    activities: 'Logs de Atividade',
    move: 'Mover no Kanban',
    edit: 'Editar Registros',
    manageStages: 'Criar Etapas',
    delete: 'Excluir Registros',
    tags: 'Gerenciar Tags',
    export: 'Exportar Lead',
    create: 'Adicionar Contato',
    send: 'Enviar Mensagem',
    start: 'Novo Chat',
    addContact: 'Adicionar Contato',
    templates: 'Gerenciar Modelos',
    signatures: 'Usar Assinatura',
    manage: 'Acesso Total',
    editPermissions: 'Alterar Permissões',
    banners: 'Gerenciar Banners',
    projects: 'Gerenciar Projetos',
    settings: 'Config. Sistema'
  };

  const handleCreateMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserName || !newUserEmail || !newUserPassword || !supabase) return;

    setLoading(true);
    const perms = newUserPermissions;
    
    const { data, error } = await supabase.from('profiles').insert([{
      name: newUserName,
      email: newUserEmail,
      password: newUserPassword,
      role: newUserRole,
      status: 'ACTIVE',
      permissions: perms
    }]).select();

    if (!error && data) {
      await fetchUsers();
      setIsAddModalOpen(false);
      setNewUserName('');
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserRole('SELLER');
    } else {
      alert("Erro ao criar membro: " + (error?.message || "Email já cadastrado?"));
    }
    setLoading(false);
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
        <aside className={styles.sidebarSection}>
          <div className={styles.searchBlock}>
            <Search size={16} />
            <input type="text" placeholder="Filtrar equipe..." />
          </div>
          
          <div className={styles.userList}>
            {users.map(u => (
              <div 
                key={u.id} 
                className={`${styles.userCard} ${selectedUserId === u.id ? styles.userCardActive : ''}`}
                onClick={() => setSelectedUserId(u.id)}
              >
                <div className={styles.userAvatarSmall}>
                  {u.name.charAt(0)}{u.name.split(' ')[1]?.charAt(0) || ''}
                </div>
                <div className={styles.userMetaCompact}>
                  <div className={styles.userNameSmall}>{u.name}</div>
                  <div className={styles.userRoleSmall}>{u.role}</div>
                </div>
              </div>
            ))}
          </div>
        </aside>

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
                  <div className={styles.infoFormGrid}>
                    <div className={styles.formGroup}>
                      <label>Nome Completo</label>
                      <input 
                        className={styles.input} 
                        value={name} 
                        onChange={e => { setName(e.target.value); setIsEditing(true); }} 
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label>E-mail Corporativo</label>
                      <input 
                        className={styles.input} 
                        value={email} 
                        onChange={e => { setEmail(e.target.value); setIsEditing(true); }} 
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label>Papel no Sistema</label>
                      <select 
                        className={styles.select} 
                        value={role} 
                        onChange={e => { 
                          const newRole = e.target.value as Role;
                          setRole(newRole);
                          setIsEditing(true);
                          if (newRole === 'ADMIN') setUserPermissions(DEFAULT_PERMISSIONS);
                          else if (newRole === 'SELLER') setUserPermissions(SELLER_PERMISSIONS);
                        }}
                      >
                        <option value="ADMIN">Administrador</option>
                        <option value="MANAGER">Gerente</option>
                        <option value="SELLER">Vendedor</option>
                      </select>
                    </div>
                    <div className={styles.formGroup}>
                      <label>Status</label>
                      <select 
                        className={styles.select} 
                        value={status} 
                        onChange={e => { setStatus(e.target.value as Status); setIsEditing(true); }}
                      >
                        <option value="ACTIVE">Ativo</option>
                        <option value="INACTIVE">Inativo</option>
                      </select>
                    </div>

                    <div className={styles.dangerZone}>
                      <h4>Zona de Perigo</h4>
                      <p>A remoção de um membro é permanente e remove todo o seu acesso ao CRM.</p>
                      <button className={styles.deleteBtn} onClick={handleDeleteMember} disabled={loading}>
                        <Trash2 size={18} /> Excluir Membro da Equipe
                      </button>
                    </div>
                  </div>
                ) : activeTab === 'permissions' ? (
                  <div>
                    <div className={styles.permissionsLayoutGrid}>
                      {Object.entries(userPermissions).map(([category, items]) => {
                        const cat = categoryMap[category] || { name: category, icon: ShieldAlert, color: '#ccc' };

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
                                     <span>{fieldMap[field] || field}</span>
                                     <div className={styles.cyberSwitch}>
                                        <input
                                          type="checkbox"
                                          checked={value as boolean}
                                          onChange={() => togglePermission(category as keyof Permissions, field)}
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
                            onChange={() => {
                              setAllowedTemplates([]);
                              setIsEditing(true);
                            }}
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
                                    setIsEditing(true);
                                    if (allowedTemplates.length === 0) {
                                      setAllowedTemplates(allTemplates.filter(x => x.id !== t.id).map(x => x.id));
                                    } else if (checked) {
                                      const next = allowedTemplates.filter(id => id !== t.id);
                                      setAllowedTemplates(next);
                                    } else {
                                      setAllowedTemplates([...allowedTemplates, t.id]);
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
                ) : activeTab === 'updates' ? (
                  <div className={styles.updatesManager}>
                    <div className={styles.updatesFormCard}>
                       <h4>Nova Atualização no Dashboard</h4>
                       <p>Esta atualização aparecerá para todos os usuários em "Atualizações Recentes".</p>
                       <form onSubmit={handleCreateUpdate} className={styles.miniForm}>
                          <div className={styles.inputGroup}>
                             <label>Ação realizada</label>
                             <input 
                               placeholder="Ex: Atualizou os workflows de" 
                               value={upAction} 
                               onChange={e => setUpAction(e.target.value)} 
                               required
                             />
                          </div>
                          <div className={styles.inputGroup}>
                             <label>Alvo / Destino</label>
                             <input 
                               placeholder="Ex: Lead Comercial" 
                               value={upTarget} 
                               onChange={e => setUpTarget(e.target.value)} 
                             />
                          </div>
                          <button type="submit" className={styles.broadcastBtn} disabled={loading}>
                             Emitir para o Sistema
                          </button>
                       </form>
                    </div>

                    <div className={styles.historyList}>
                       <h4>Histórico de Emissões</h4>
                       {systemUpdates.map(up => (
                         <div key={up.id} className={styles.historyItem}>
                            <div className={styles.historyMeta}>
                               <strong>{up.action} {up.target}</strong>
                               <span>por {up.user_name} • {new Date(up.created_at).toLocaleString()}</span>
                            </div>
                            <button className={styles.miniDelete} onClick={() => handleDeleteUpdate(up.id)}>
                               <Trash2 size={14} />
                            </button>
                         </div>
                       ))}
                    </div>
                  </div>
                ) : (
                  <div className={styles.personalizationSection}>
                    <div className={styles.brandingHeader}>
                       <h4>Identidade Visual e Marca</h4>
                       <p>Personalize as cores e logotipos de todo o sistema sem precisar de código.</p>
                    </div>

                    <div className={styles.brandingGrid}>
                       <div className={styles.formGroup}>
                          <label>Cor Primária</label>
                          <div className={styles.colorRow}>
                            <input type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} />
                            <input type="text" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} />
                          </div>
                       </div>
                       <div className={styles.formGroup}>
                          <label>Cor Secundária</label>
                          <div className={styles.colorRow}>
                            <input type="color" value={secondaryColor} onChange={e => setSecondaryColor(e.target.value)} />
                            <input type="text" value={secondaryColor} onChange={e => setSecondaryColor(e.target.value)} />
                          </div>
                       </div>
                       <div className={styles.formGroup} style={{ gridColumn: 'span 2' }}>
                          <label>Nome do Aplicativo (Título do Site)</label>
                          <input className={styles.input} value={appName} onChange={e => setAppName(e.target.value)} placeholder="Vórtice CRM" />
                       </div>

                       <div className={styles.formGroup} style={{ gridColumn: 'span 2' }}>
                          <label>Logotipo do CRM</label>
                          <div className={styles.fileInputRow}>
                             <button className={styles.fileSelectBtn} onClick={() => document.getElementById('logo-upload')?.click()}>
                                <Plus size={16} /> Selecionar Arquivo
                             </button>
                             <input className={styles.input} value={logoUrl} onChange={e => setLogoUrl(e.target.value)} placeholder="Ou cole a URL da imagem aqui" />
                             <input id="logo-upload" type="file" accept="image/*" hidden onChange={(e) => handleFileSelect('logo', e)} />
                          </div>
                          <span className={styles.idealSizeHint}>Tamanho ideal: 400x120px (Proporção horizontal)</span>
                       </div>

                       <div className={styles.formGroup} style={{ gridColumn: 'span 2' }}>
                          <label>Favicon (Ícone do Navegador)</label>
                          <div className={styles.fileInputRow}>
                             <button className={styles.fileSelectBtn} onClick={() => document.getElementById('favicon-upload')?.click()}>
                                <Plus size={16} /> Selecionar Arquivo
                             </button>
                             <input className={styles.input} value={faviconUrl} onChange={e => setFaviconUrl(e.target.value)} placeholder="Ou cole a URL do favicon aqui" />
                             <input id="favicon-upload" type="file" accept="image/*" hidden onChange={(e) => handleFileSelect('favicon', e)} />
                          </div>
                          <span className={styles.idealSizeHint}>Tamanho ideal: 32x32px ou 64x64px (.png ou .ico)</span>
                       </div>
                    </div>

                    <div className={styles.brandingPreview}>
                       <div className={styles.brandingHeaderSmall}>
                          <LayoutDashboard size={18} color="#3b82f6" />
                          <h5>Logo & Favicon Preview</h5>
                       </div>
                       
                       <div className={styles.previewBox}>
                          <div className={styles.logoPreviewArea}>
                             {logoUrl ? (
                               <img 
                                 src={logoUrl} 
                                 alt="Preview Logo" 
                                 onError={(e) => (e.currentTarget.style.display = 'none')} 
                               />
                             ) : (
                               <div className={styles.emptyState}>
                                  <Users size={32} />
                                  <span>Logotipo não definido</span>
                               </div>
                             )}
                          </div>
                          
                          <div className={styles.faviconPreviewArea}>
                             {faviconUrl ? (
                               <img 
                                 src={faviconUrl} 
                                 alt="Preview Favicon" 
                                 onError={(e) => (e.currentTarget.style.display = 'none')}
                               />
                             ) : (
                               <div className={styles.emptyFavicon}>
                                  <LayoutDashboard size={14} />
                               </div>
                             )}
                             <span>Favicon</span>
                          </div>
                       </div>
                    </div>

                    <div className={styles.brandingInstructions}>
                       <p><strong>Dica de Host:</strong> Para usar imagens personalizadas, você pode fazer upload em serviços como Imgur, Cloudinary ou no próprio Supabase Storage e colar o link público aqui.</p>
                    </div>

                    <button className={styles.saveBrandingBtn} onClick={saveBrandingConfig} disabled={loading}>
                       {loading ? 'Salvando...' : 'Salvar Alterações de Marca'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
      {/* Modal Novo Membro */}
      <AnimatePresence>
        {isAddModalOpen && (
          <div className={styles.modalOverlay} onClick={() => setIsAddModalOpen(false)}>
            <motion.div 
              className={styles.modalContent}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={e => e.stopPropagation()}
            >
              <div className={styles.modalHeader}>
                <h3>Novo Membro da Equipe</h3>
                <button className={styles.closeBtn} onClick={() => setIsAddModalOpen(false)}>
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleCreateMember} className={styles.addForm}>
                <div className={styles.formGroup}>
                  <label>Nome Completo</label>
                  <input 
                    className={styles.input} 
                    placeholder="Ex: João Silva" 
                    value={newUserName}
                    onChange={e => setNewUserName(e.target.value)}
                    required
                  />
                </div>
                <div className={styles.formGroup}>
                  <label>E-mail Corporativo</label>
                  <input 
                    type="email"
                    className={styles.input} 
                    placeholder="joao@empresa.com" 
                    value={newUserEmail}
                    onChange={e => setNewUserEmail(e.target.value)}
                    required
                  />
                </div>
                <div className={styles.formGroup}>
                  <label>Cargo / Função</label>
                  <select 
                    className={styles.select} 
                    value={newUserRole}
                    onChange={e => setNewUserRole(e.target.value as Role)}
                  >
                    <option value="ADMIN">Administrador</option>
                    <option value="MANAGER">Gerente</option>
                    <option value="SELLER">Vendedor</option>
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label>Senha de Acesso</label>
                  <input 
                    type="password"
                    className={styles.input} 
                    placeholder="••••••••" 
                    value={newUserPassword}
                    onChange={e => setNewUserPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                </div>

                <div className={styles.permissionSectionTitle}>
                  <h4>Permissões do Novo Membro</h4>
                  <p>Defina o que este usuário poderá ver e fazer</p>
                </div>

                <div className={styles.modalPermissionsGrid}>
                   {Object.entries(newUserPermissions).map(([category, items]) => {
                      const cat = categoryMap[category] || { name: category, icon: ShieldAlert, color: '#ccc' };
                      return (
                        <div key={category} className={styles.miniPermissionCard}>
                          <div className={styles.miniCardHeader}>
                            <cat.icon size={12} color={cat.color} />
                            <span>{cat.name}</span>
                          </div>
                          <div className={styles.miniSwitchList}>
                            {Object.entries(items as any).map(([field, value]) => (
                               <label key={field} className={styles.miniSwitchRow}>
                                 <span className={styles.miniFieldName}>{fieldMap[field] || field}</span>
                                 <input 
                                   type="checkbox" 
                                   checked={value as boolean}
                                   onChange={() => toggleNewUserPermission(category as keyof Permissions, field)}
                                 />
                               </label>
                            ))}
                          </div>
                        </div>
                      );
                   })}
                </div>
                
                <div className={styles.modalActions}>
                  <button type="button" className={styles.cancelBtn} onClick={() => setIsAddModalOpen(false)}>
                    Cancelar
                  </button>
                  <button type="submit" className={styles.submitBtn} disabled={loading}>
                    {loading ? 'Salvando...' : 'Criar Membro'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
