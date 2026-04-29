"use client";

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Users, 
  UserCheck, 
  UserMinus, 
  Search, 
  Plus, 
  MoreHorizontal, 
  MessageSquare, 
  Edit3, 
  Eye, 
  Trash2, 
  Ban,
  Filter,
  Globe,
  MoreVertical,
  X,
  Check,
  Tag as TagIcon,
  MessageCircle
} from 'lucide-react';

import styles from './leads.module.css';
import { useLeads } from '@/context/LeadContext';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import ThemeToggle from '@/components/ThemeToggle';
import NotificationDropdown from '@/components/NotificationDropdown';
import { Bell, HelpCircle } from 'lucide-react';
import Link from 'next/link';

const ChannelIcon = ({ type }: { type: string }) => {
  switch (type.toLowerCase()) {
    case 'whatsapp': return <MessageCircle size={16} style={{ color: '#25D366' }} />;
    case 'instagram': return <Globe size={16} style={{ color: '#E4405F' }} />;
    case 'facebook': return <Globe size={16} style={{ color: '#1877F2' }} />;
    case 'site': return <Globe size={16} style={{ color: '#3498db' }} />;
    default: return <Globe size={16} />;
  }
};

export default function LeadsPage() {
  const { leads, openModal, tags, addTag, deleteTag, updateLead, deleteLead } = useLeads();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<any>(null);
  const [isTagModalOpen, setIsTagModalOpen] = useState(false);
  const [newTag, setNewTag] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('Todos');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const { user } = useAuth();

  const filteredLeads = leads.filter(lead => {
    const matchesSearch = 
      lead.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.phone.includes(searchTerm) ||
      lead.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesStatus = filterStatus === 'Todos' || lead.status === filterStatus;

    return matchesSearch && matchesStatus;
  });

  const kpis = [
    { label: 'Total de Leads', value: leads.length.toString(), icon: Users, color: '#3b82f6' },
    { label: 'Leads Ativos', value: leads.filter(l => l.status === 'Ativo').length.toString(), icon: UserCheck, color: '#10b981' },
    { label: 'Leads Bloqueados', value: leads.filter(l => l.status === 'Bloqueado').length.toString(), icon: UserMinus, color: '#ef4444' },
  ];

  // Realtime System Notifications
  React.useEffect(() => {
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
      .channel('leads_system_notifications')
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

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1>Gestão de Leads</h1>
          <p>Visualize e gerencie todos os contatos da sua base em um só lugar.</p>
        </div>
        <div className={styles.headerActions}>

          <button className={styles.tagBtn} onClick={() => setIsTagModalOpen(true)}>
            <TagIcon size={18} /> Configurar Tags
          </button>
          <button className={styles.primaryBtn} onClick={openModal}>
            <Plus size={18} /> Novo Lead
          </button>
        </div>
      </header>

      <section className={styles.kpiGrid}>
        {kpis.map((kpi, i) => (
          <motion.div 
            key={kpi.label}
            className={styles.kpiCard}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
          >
            <div className={styles.kpiIcon} style={{ backgroundColor: `${kpi.color}15`, color: kpi.color }}>
              <kpi.icon size={24} />
            </div>
            <div className={styles.kpiInfo}>
              <span className={styles.kpiLabel}>{kpi.label}</span>
              <span className={styles.kpiValue}>{kpi.value}</span>
            </div>
          </motion.div>
        ))}
      </section>

      <div className={styles.listContainer}>
        <div className={styles.listHeader}>
          <div className={styles.searchBar}>
            <Search size={18} />
            <input 
              type="text" 
              placeholder="Buscar por nome, telefone ou tag..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className={styles.filterContainer}>
            <button className={`${styles.filterBtn} ${filterStatus !== 'Todos' ? styles.filterActive : ''}`} onClick={() => setIsFilterOpen(!isFilterOpen)}>
              <Filter size={18} /> {filterStatus === 'Todos' ? 'Filtrar' : filterStatus}
            </button>
            <AnimatePresence>
              {isFilterOpen && (
                <motion.div 
                  className={styles.filterDropdown}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                >
                  <div className={styles.filterOption} onClick={() => { setFilterStatus('Todos'); setIsFilterOpen(false); }}>Todos</div>
                  <div className={styles.filterOption} onClick={() => { setFilterStatus('Ativo'); setIsFilterOpen(false); }}>Ativos</div>
                  <div className={styles.filterOption} onClick={() => { setFilterStatus('Bloqueado'); setIsFilterOpen(false); }}>Bloqueados</div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Nome do Lead</th>
                <th>Telefone</th>
                <th>Tags</th>
                <th>Canais</th>
                <th>Entrada</th>
                <th>Última Msg</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredLeads.map((lead) => (
                <tr key={lead.id}>
                  <td>
                    <div className={styles.leadCell}>
                      <div className={styles.avatar} style={{ background: `linear-gradient(135deg, ${lead.color}, #000)` }}>
                        {lead.name[0]}
                      </div>
                      <span className={styles.leadName}>{lead.name}</span>
                    </div>
                  </td>
                  <td>{lead.phone}</td>
                  <td>
                    <div className={styles.tagList}>
                      {lead.tags.map(tag => (
                        <span key={tag} className={styles.tagBadge}>{tag}</span>
                      ))}
                    </div>
                  </td>
                  <td>
                    <div className={styles.channelList}>
                      {lead.channels.map(ch => (
                        <div key={ch} className={styles.channelIcon}>
                          <ChannelIcon type={ch} />
                        </div>
                      ))}
                    </div>
                  </td>
                  <td>{lead.entryDate}</td>
                  <td>{lead.lastMsg}</td>
                  <td>
                    <span className={`${styles.statusBadge} ${lead.status === 'Ativo' ? styles.statusActive : styles.statusBlocked}`}>
                      {lead.status}
                    </span>
                  </td>
                  <td>
                    <div className={styles.actions}>
                      <button className={styles.actionBtn} title="Mensagem" onClick={() => window.location.href = `/messages?chatId=${lead.id}`}><MessageSquare size={16} /></button>
                      <button className={styles.actionBtn} title="Ver Detalhes" onClick={() => setSelectedLead(lead)}><Eye size={16} /></button>
                      <button className={styles.actionBtn} title="Editar" onClick={() => { setSelectedLead(lead); setIsEditing(true); setEditForm({...lead}); }}><Edit3 size={16} /></button>
                      <button className={styles.actionBtn} title="Excluir" onClick={() => { if(window.confirm('Excluir este lead?')) deleteLead(lead.id); }}><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Detalhes Completo */}
      {selectedLead && (
        <div className={styles.modalOverlay} onClick={() => { setSelectedLead(null); setIsEditing(false); }}>
          <motion.div 
            className={styles.modal}
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <header className={styles.modalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div className={styles.tagIconWrapper}>
                  <Users size={20} color="#3b82f6" />
                </div>
                <div>
                  <h2 style={{ margin: 0 }}>{isEditing ? 'Editar Lead' : 'Detalhes do Lead'}</h2>
                  <p style={{ margin: 0, fontSize: '0.8rem', opacity: 0.5 }}>
                    {isEditing ? 'Atualize as informações do contato' : 'Visualize todas as informações do lead'}
                  </p>
                </div>
              </div>
              <button className={styles.closeBtn} onClick={() => { setSelectedLead(null); setIsEditing(false); }}><X size={20} /></button>
            </header>

            <div className={styles.modalContent}>
              <div className={styles.modalProfile}>
                <div className={styles.largeAvatar} style={{ background: `linear-gradient(135deg, ${selectedLead.color || '#3b82f6'}, #000)` }}>
                  {selectedLead.name[0]}
                </div>
                {!isEditing ? (
                  <>
                    <h3 style={{ margin: '0.5rem 0 0.2rem' }}>{selectedLead.name}</h3>
                    <p style={{ opacity: 0.6, fontSize: '0.9rem' }}>{selectedLead.phone}</p>
                  </>
                ) : (
                  <div style={{ marginTop: '1rem', width: '100%' }}>
                    <div className={styles.editInputGroup}>
                      <label>Nome Completo</label>
                      <input 
                        className={styles.editInput}
                        value={editForm?.name || ''} 
                        onChange={(e) => setEditForm({...editForm, name: e.target.value})}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className={styles.modalInfoGrid}>
                {isEditing ? (
                  <>
                    <div className={styles.editInputGroup}>
                      <label>E-mail</label>
                      <input 
                        className={styles.editInput}
                        value={editForm?.email || ''} 
                        onChange={(e) => setEditForm({...editForm, email: e.target.value})}
                      />
                    </div>
                    <div className={styles.editInputGroup}>
                      <label>Telefone</label>
                      <input 
                        className={styles.editInput}
                        value={editForm?.phone || ''} 
                        onChange={(e) => setEditForm({...editForm, phone: e.target.value})}
                      />
                    </div>
                    <div className={styles.editInputGroup}>
                      <label>CPF/CNPJ</label>
                      <input 
                        className={styles.editInput}
                        value={editForm?.cpf_cnpj || ''} 
                        onChange={(e) => setEditForm({...editForm, cpf_cnpj: e.target.value})}
                      />
                    </div>
                    <div className={styles.editInputGroup}>
                      <label>Valor (R$)</label>
                      <input 
                        className={styles.editInput}
                        type="number"
                        value={editForm?.value || 0} 
                        onChange={(e) => setEditForm({...editForm, value: parseFloat(e.target.value)})}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className={styles.infoItem}>
                      <label>E-mail</label>
                      <span>{selectedLead.email || 'Não informado'}</span>
                    </div>
                    <div className={styles.infoItem}>
                      <label>Telefone</label>
                      <span>{selectedLead.phone}</span>
                    </div>
                    <div className={styles.infoItem}>
                      <label>CPF/CNPJ</label>
                      <span>{selectedLead.cpf_cnpj || 'Não informado'}</span>
                    </div>
                    <div className={styles.infoItem}>
                      <label>Valor</label>
                      <span>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(selectedLead.value || 0)}</span>
                    </div>
                  </>
                )}
              </div>

              <div className={styles.tagSection} style={{ marginTop: '1.5rem' }}>
                <label style={{ fontSize: '0.75rem', opacity: 0.4, textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>Tags do Lead</label>
                <div className={styles.tagListFull}>
                  {(isEditing ? (editForm?.tags || []) : (selectedLead.tags || [])).map((tag: string) => (
                    <span key={tag} className={styles.tagBadgeLarge}>
                      {tag}
                      {isEditing && (
                        <button 
                          onClick={() => setEditForm({...editForm, tags: editForm.tags.filter((t: string) => t !== tag)})}
                          style={{ background: 'none', border: 'none', marginLeft: '6px', cursor: 'pointer', display: 'flex' }}
                        >
                          <X size={12} />
                        </button>
                      )}
                    </span>
                  ))}
                  {isEditing && (
                    <div className={styles.addTagSmall}>
                      <Plus size={14} />
                      <select 
                        onChange={(e) => {
                          if (e.target.value && !editForm.tags.includes(e.target.value)) {
                            setEditForm({...editForm, tags: [...editForm.tags, e.target.value]});
                          }
                          e.target.value = '';
                        }}
                        style={{ background: 'none', border: 'none', color: 'inherit', outline: 'none', cursor: 'pointer' }}
                      >
                        <option value="">Add Tag</option>
                        {tags.filter(t => !editForm.tags.includes(t)).map(t => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <footer className={styles.modalFooter}>
              {isEditing ? (
                <>
                  <button className={styles.cancelBtn} onClick={() => setIsEditing(false)}>Cancelar</button>
                  <button 
                    className={styles.saveBtn}
                    onClick={() => {
                      updateLead(selectedLead.id, editForm);
                      setSelectedLead({...editForm});
                      setIsEditing(false);
                    }}
                  >
                    Salvar Alterações <Check size={18} />
                  </button>
                </>
              ) : (
                <>
                  <button 
                    className={styles.editBtn} 
                    onClick={() => { 
                      setIsEditing(true); 
                      setEditForm({...selectedLead}); 
                    }}
                  >
                    <Edit3 size={18} /> Editar Lead
                  </button>
                  <button 
                    className={styles.primaryBtn}
                    onClick={() => window.location.href = `/messages?chatId=${selectedLead.id}`}
                  >
                    Abrir Conversa <MessageSquare size={18} />
                  </button>
                </>
              )}
            </footer>
          </motion.div>
        </div>
      )}

      {/* Modal de Gestão de Tags */}
      {isTagModalOpen && (
        <div className={styles.modalOverlayCentered} onClick={() => setIsTagModalOpen(false)}>
          <motion.div 
            className={styles.tagModal}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={(e) => e.stopPropagation()}
          >
            <header className={styles.modalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div className={styles.tagIconWrapper}>
                  <TagIcon size={20} color="#3b82f6" />
                </div>
                <div>
                  <h2 style={{ margin: 0 }}>Gerenciar Tags</h2>
                  <p style={{ margin: 0, fontSize: '0.8rem', opacity: 0.5 }}>Crie e organize as etiquetas dos seus leads</p>
                </div>
              </div>
              <button className={styles.closeBtn} onClick={() => setIsTagModalOpen(false)}><X size={20} /></button>
            </header>

            <div className={styles.tagModalContent}>
              <div className={styles.newTagArea}>
                <div className={styles.inputWrapper}>
                  <TagIcon size={16} className={styles.inputIcon} />
                  <input 
                    type="text" 
                    placeholder="Nome da nova tag..." 
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newTag.trim()) {
                        addTag(newTag.trim());
                        setNewTag('');
                      }
                    }}
                  />
                </div>
                <button 
                  className={styles.addTagFinalBtn} 
                  disabled={!newTag.trim()}
                  onClick={() => {
                    addTag(newTag.trim());
                    setNewTag('');
                  }}
                >
                  <Plus size={18} /> Criar
                </button>
              </div>

              <div className={styles.tagGrid}>
                {tags.map(tag => (
                  <div key={tag} className={styles.tagItem}>
                    <span>{tag}</span>
                    <button className={styles.deleteTagBtn} onClick={() => deleteTag(tag)}>
                      <X size={14} />
                    </button>
                  </div>
                ))}
                {tags.length === 0 && (
                  <div className={styles.emptyTags}>Nenhuma tag criada ainda.</div>
                )}
              </div>
            </div>

            <footer className={styles.tagModalFooter}>
              <button className={styles.finishBtn} onClick={() => setIsTagModalOpen(false)}>
                Concluir <Check size={18} />
              </button>
            </footer>
          </motion.div>
        </div>
      )}
    </div>
  );
}
