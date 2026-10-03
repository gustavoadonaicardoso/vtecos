"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Plus, 
  MoreVertical, 
  MessageCircle, 
  Mail, 
  CircleDot,
  Clock,
  Grab,
  Filter,
  Edit2,
  Palette,
  BarChart2,
  User,
  Phone,
  Hash,
  ShoppingBag,
  History,
  X,
  Trash2,
  Kanban,
  Save,
  ChevronRight,
  Globe
} from 'lucide-react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import styles from './pipeline.module.css';
import { useLeads } from '@/context/LeadContext';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { fetchUnreadNotificationsCount } from '@/services/notifications.service';
import ThemeToggle from '@/components/ThemeToggle';
import NotificationDropdown from '@/components/NotificationDropdown';
import { ArrowLeft, ArrowRight, Bell, ChevronDown, ChevronUp, GripVertical, HelpCircle } from 'lucide-react';
import Link from 'next/link';

const PRESET_COLORS = [
  '#3b82f6', '#8b5cf6', '#ec4899', '#ef4444', 
  '#f97316', '#f59e0b', '#84cc16', '#10b981', 
  '#14b8a6', '#06b6d4', '#0ea5e9', '#6366f1'
];

const CustomColorPicker = ({ color, onChange }: { color: string, onChange: (c: string) => void }) => {
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <div style={{ position: 'relative' }}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          backgroundColor: color,
          border: 'none',
          cursor: 'pointer',
          boxShadow: `0 0 12px ${color}88`,
          transition: 'transform 0.2s'
        }}
        title="Mudar Cor da Etapa"
      />
      
      {isOpen && (
        <>
          <div 
            style={{ position: 'fixed', inset: 0, zIndex: 10 }} 
            onClick={() => setIsOpen(false)} 
          />
          <div 
            style={{
              position: 'absolute',
              top: '120%',
              left: 0,
              zIndex: 20,
              background: 'var(--panel-bg)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: 12,
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 8,
              boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
              width: 170
            }}
          >
            {PRESET_COLORS.map(c => (
              <button
                key={c}
                onClick={() => {
                  onChange(c);
                  setIsOpen(false);
                }}
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 6,
                  backgroundColor: c,
                  border: c === color ? '2px solid var(--foreground)' : 'none',
                  cursor: 'pointer',
                  transform: c === color ? 'scale(1.15)' : 'scale(1)',
                  transition: 'transform 0.2s',
                  boxShadow: c === color ? `0 0 10px ${c}` : 'none'
                }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default function Pipeline() {
  const router = useRouter();
  const { pipelineStages, updatePipelineStages, savePipelineStructure, leads, openModal, updateLead, deleteLead } = useLeads();
  const [isReady, setIsReady] = useState(false);
  const [viewMode, setViewMode] = useState<'kanban' | 'funnel'>('kanban');
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [selectedLead, setSelectedLead] = useState<any | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<any>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [filterMine, setFilterMine] = useState(false);
  const [profiles, setProfiles] = useState<{ id: string; name: string }[]>([]);
  const { user } = useAuth();
  // Etapas são compartilhadas pela equipe: só admin e gerente mudam a estrutura.
  const canEditStages = user?.role === 'ADMIN' || user?.role === 'MANAGER';

  const toggleMenu = (stageId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveMenu(activeMenu === stageId ? null : stageId);
  };

  useEffect(() => {
    const handleClickOutside = () => setActiveMenu(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  useEffect(() => {
    const fetchProfiles = async () => {
      if (!supabase) return;
      const { data } = await supabase.from('profiles').select('id, name').eq('status', 'ACTIVE').neq('account_type', 'CLIENT').order('name');
      if (data) setProfiles(data);
    };
    fetchProfiles();
  }, []);

  useEffect(() => {
    setIsReady(true);
  }, []);

  // Notificações não lidas -- a leitura passa pela API autenticada
  // (/api/notifications), então atualiza por polling.
  useEffect(() => {
    if (!user) return;

    const fetchCount = () => fetchUnreadNotificationsCount(user.id).then((c) => setUnreadCount(c ?? 0));

    fetchCount();
    const interval = setInterval(fetchCount, 20_000);

    return () => clearInterval(interval);
  }, [user]);

  const onDragEnd = (result: DropResult) => {
    const { source, destination } = result;

    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    // Arrastou uma coluna inteira: muda a ordem das etapas.
    if (result.type === 'COLUMN') {
      const reordered = [...pipelineStages];
      const [moved] = reordered.splice(source.index, 1);
      reordered.splice(destination.index, 0, moved);
      savePipelineStructure(reordered);
      return;
    }

    const sourceStageIdx = pipelineStages.findIndex(s => s.id === source.droppableId);
    const destStageIdx = pipelineStages.findIndex(s => s.id === destination.droppableId);
    
    const newStages = [...pipelineStages];
    
    // Copy arrays to avoid mutating the context directly before setting
    const sourceLeads = [...newStages[sourceStageIdx].leads];
    const [movedLeadId] = sourceLeads.splice(source.index, 1);

    if (source.droppableId === destination.droppableId) {
      sourceLeads.splice(destination.index, 0, movedLeadId);
      newStages[sourceStageIdx] = { ...newStages[sourceStageIdx], leads: sourceLeads };
    } else {
      const destLeads = [...newStages[destStageIdx].leads];
      destLeads.splice(destination.index, 0, movedLeadId);
      newStages[sourceStageIdx] = { ...newStages[sourceStageIdx], leads: sourceLeads };
      newStages[destStageIdx] = { ...newStages[destStageIdx], leads: destLeads };
    }

    updatePipelineStages(newStages);
  };

  const updateStageConfig = (stageId: string, updates: { name?: string; color?: string }) => {
    const newStages = pipelineStages.map(s => s.id === stageId ? { ...s, ...updates } : s);
    // Digitando o nome: espera uma pausa antes de salvar.
    savePipelineStructure(newStages, { debounce: updates.name !== undefined });
  };

  const moveStage = (stageId: string, direction: -1 | 1) => {
    const index = pipelineStages.findIndex(s => s.id === stageId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= pipelineStages.length) return;
    const reordered = [...pipelineStages];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    savePipelineStructure(reordered);
  };

  const deleteStage = (stageId: string) => {
    if (stageId === 'ganho') {
      alert('A etapa de ganhos não pode ser excluída: metas, relatórios e o dashboard dependem dela. Você pode renomear ou mudar a cor.');
      return;
    }
    if (pipelineStages.length <= 1) return;
    const stage = pipelineStages.find(s => s.id === stageId);
    const remaining = pipelineStages.filter(s => s.id !== stageId);
    const leadCount = stage?.leads.length ?? 0;
    const message = leadCount > 0
      ? `Excluir a etapa "${stage?.name}"? Os ${leadCount} lead(s) dela vão para "${remaining[0].name}".`
      : `Excluir a etapa "${stage?.name}"?`;
    if (confirm(message)) savePipelineStructure(remaining);
  };

  const addStage = () => {
    const newStage = {
      id: `etapa-${Date.now()}`,
      name: 'Nova Etapa',
      color: '#06b6d4',
      leads: []
    };
    // Entra antes de "Ganhos", que costuma ser a última etapa do funil.
    const wonIndex = pipelineStages.findIndex(s => s.id === 'ganho');
    const next = [...pipelineStages];
    next.splice(wonIndex >= 0 ? wonIndex : next.length, 0, newStage);
    savePipelineStructure(next);
  };

  if (!isReady) return null;

  // Helper to map global leads to the pipeline payload
  const getLeadData = (leadId: string) => {
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return undefined;

    const isSeller = user?.role === 'SELLER';
    if ((isSeller || filterMine) && lead.assignedTo !== user?.id) {
      return undefined;
    }
    return lead;
  };

  return (
    <div>
      <header className={styles.headerRow}>
        <div className={styles.welcomeText}>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 700 }}>
            {user?.role === 'SELLER' ? 'Meu Funil' : 'Funil de Vendas'}
          </h2>
          <p style={{ color: 'var(--foreground)', opacity: 0.5 }}>
            {user?.role === 'SELLER' 
              ? 'Arraste os cartões para atualizar o status de seus leads.'
              : (viewMode === 'kanban' ? 'Arraste os cartões ou use a barra abaixo para navegar.' : 'Configure suas etapas e analise as conversões.')}
          </p>
        </div>

        <div className={styles.headerActions}>
          {(user?.role === 'ADMIN' || user?.role === 'MANAGER') && (
            <button
              className="glass"
              style={{ 
                color: filterMine ? '#3b82f6' : 'var(--foreground)', 
                borderColor: filterMine ? '#3b82f6' : 'var(--border)',
                padding: '10px 20px', 
                borderRadius: '12px', 
                fontSize: '0.9rem', 
                fontWeight: 600, 
                display: 'flex', 
                gap: '8px', 
                alignItems: 'center', 
                cursor: 'pointer',
                backgroundColor: filterMine ? 'rgba(59, 130, 246, 0.1)' : 'transparent'
              }}
              onClick={() => setFilterMine(!filterMine)}
            >
              <User size={18} />
              {filterMine ? 'Ver Todos os Leads' : 'Ver Apenas Meus'}
            </button>
          )}

          <button 
            className="glass" 
            style={{ color: 'var(--foreground)', padding: '10px 20px', borderRadius: '12px', fontSize: '0.9rem', fontWeight: 600, display: 'flex', gap: '8px', alignItems: 'center', cursor: 'pointer' }}
            onClick={() => setViewMode(v => v === 'kanban' ? 'funnel' : 'kanban')}
          >
            {viewMode === 'kanban' ? <BarChart2 size={18} /> : <Kanban size={18} />}
            {viewMode === 'kanban' ? 'Visual de Funil' : 'Visual Kanban'}
          </button>
          
          {viewMode === 'kanban' && canEditStages && (
            <button 
              style={{ background: '#3b82f6', color: 'white', padding: '10px 20px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, cursor: 'pointer' }}
              onClick={addStage}
            >
              <Plus size={18} /> Nova Etapa
            </button>
          )}
        </div>
      </header>

      {viewMode === 'funnel' ? (
        <div className={styles.funnelContainer}>
          {/* Configuração do Funil */}
          <div className={styles.funnelConfig}>
            <h3>Configuração Estratégica das Etapas</h3>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {pipelineStages.map((stage, i) => (
                <div key={stage.id} className={styles.stageConfigRow}>
                  <div style={{ fontWeight: 'bold', color: 'var(--foreground)', opacity: 0.5, width: 24, textAlign: 'center' }}>{i + 1}</div>
                  {canEditStages && (
                    <div className={styles.reorderButtons}>
                      <button type="button" onClick={() => moveStage(stage.id, -1)} disabled={i === 0} title="Subir etapa" aria-label="Subir etapa">
                        <ChevronUp size={14} />
                      </button>
                      <button type="button" onClick={() => moveStage(stage.id, 1)} disabled={i === pipelineStages.length - 1} title="Descer etapa" aria-label="Descer etapa">
                        <ChevronDown size={14} />
                      </button>
                    </div>
                  )}
                  <CustomColorPicker 
                    color={stage.color} 
                    onChange={(color) => updateStageConfig(stage.id, { color })} 
                  />
                  <input 
                    type="text" 
                    value={stage.name || ''} 
                    onChange={(e) => updateStageConfig(stage.id, { name: e.target.value })}
                    disabled={!canEditStages}
                    className={styles.stageInput}
                    placeholder="Nome da Etapa"
                  />
                  {canEditStages && stage.id !== 'ganho' && (
                    <button className={styles.deleteStageBtn} onClick={() => deleteStage(stage.id)} title="Excluir Etapa">
                      <Trash2 size={18} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {canEditStages && (
              <button className={styles.addStageBtn} onClick={addStage}>
                <Plus size={18} /> Adicionar Nova Etapa
              </button>
            )}
          </div>

          {/* Relatório Visual do Funil */}
          <div className={styles.funnelGraph}>
            <h3>Relatório Visual de Posicionamento</h3>
            <div className={styles.techFunnelWrapper}>
              {pipelineStages.map((stage, i) => {
                const widthPercentage = 100 - (i * (60 / Math.max(pipelineStages.length - 1, 1)));
                
                // Calculate total financial value in this stage
                const totalValue = stage.leads.reduce((acc, leadId) => {
                  const l = getLeadData(leadId);
                  if(!l || !l.value) return acc;
                  const val = parseFloat(l.value.replace(/[^0-9,-]+/g,"").replace(",",".") || "0");
                  return acc + (isNaN(val) ? 0 : val);
                }, 0);

                return (
                  <div key={stage.id} className={styles.techFunnelRow}>
                    
                    <div className={styles.techFunnelCol}>
                      <div 
                         className={styles.techFunnelSlice} 
                         style={{ 
                           width: `${widthPercentage}%`,
                           background: `linear-gradient(90deg, transparent, ${stage.color}44)`,
                           borderTop: `1px solid ${stage.color}88`,
                           borderLeft: `2px solid ${stage.color}`,
                           borderBottom: `1px solid ${stage.color}44`,
                           borderRight: `4px solid ${stage.color}`,
                           clipPath: `polygon(15% 0, 100% 0, 100% 100%, 0% 100%)`
                         }}
                      >
                         <div className={styles.sliceGlow} style={{ boxShadow: `inset -15px 0 30px ${stage.color}88` }} />
                      </div>
                    </div>
                    
                    <div className={styles.techConnectionCol}>
                       <div className={styles.techLine} style={{ backgroundColor: stage.color }} />
                       <div className={styles.techDot} style={{ backgroundColor: stage.color, boxShadow: `0 0 10px ${stage.color}` }} />
                    </div>

                    <div className={styles.techLabelCol}>
                      <div className={styles.techLabelCard} style={{ borderLeftColor: stage.color }}>
                         <h4 style={{ color: stage.color }}>{stage.name}</h4>
                         <div className={styles.techStats}>
                           <span className={styles.techLeadCount}>
                             {stage.leads.filter(id => !!getLeadData(id)).length} Leads
                           </span>
                           <span className={styles.techDivider}>/</span>
                           <span className={styles.techValue}>
                              R$ {totalValue > 0 ? totalValue.toLocaleString('pt-BR') : '0,00'}
                           </span>
                         </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ textAlign: 'center', opacity: 0.5, fontSize: '0.8rem', marginTop: '1rem' }}>
              Baseado nos dados atuais do pipeline.
            </div>
          </div>
        </div>
      ) : (
        <div className={styles.scrollOuter}>
          <DragDropContext onDragEnd={onDragEnd}>
            <Droppable droppableId="pipeline-board" type="COLUMN" direction="horizontal">
            {(boardProvided) => (
            <div className={styles.pipelineWrapper} ref={boardProvided.innerRef} {...boardProvided.droppableProps}>
              {pipelineStages.map((stage, stageIndex) => (
                <Draggable key={stage.id} draggableId={`column-${stage.id}`} index={stageIndex} isDragDisabled={!canEditStages}>
                {(columnProvided, columnSnapshot) => (
                <div
                  ref={columnProvided.innerRef}
                  {...columnProvided.draggableProps}
                  className={`${styles.stage} ${columnSnapshot.isDragging ? styles.stageDragging : ''}`}
                >
                  <div className={styles.stageHeader} {...columnProvided.dragHandleProps} title={canEditStages ? 'Arraste para mudar a ordem da etapa' : undefined}>
                    <div className={styles.stageTitle}>
                      {canEditStages && <GripVertical size={14} className={styles.columnGrip} />}
                      <CircleDot size={16} style={{ color: stage.color }} />
                      <span>{stage.name}</span>
                      <span className={styles.leadCount}>
                        {stage.leads.filter(id => !!getLeadData(id)).length}
                      </span>
                    </div>
                    
                    {canEditStages && (
                    <div style={{ position: 'relative' }}>
                      <MoreVertical 
                        size={16} 
                        style={{ color: 'var(--foreground)', opacity: 0.3, cursor: 'pointer' }} 
                        onClick={(e) => toggleMenu(stage.id, e)}
                      />
                      
                      <AnimatePresence>
                        {activeMenu === stage.id && (
                          <motion.div 
                            className={styles.stageMenu}
                            initial={{ opacity: 0, scale: 0.95, y: -10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: -10 }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className={styles.menuHeader}>Ações da Etapa</div>
                            
                            <button className={styles.menuItem} onClick={() => {
                              const newName = prompt('Novo nome da etapa:', stage.name);
                              if (newName) updateStageConfig(stage.id, { name: newName });
                              setActiveMenu(null);
                            }}>
                              <Edit2 size={14} />
                              <span>Renomear Etapa</span>
                            </button>
                            
                            <div className={styles.menuItem}>
                              <Palette size={14} />
                              <span>Mudar Cor</span>
                              <div style={{ marginLeft: 'auto' }}>
                                <CustomColorPicker 
                                  color={stage.color} 
                                  onChange={(color) => updateStageConfig(stage.id, { color })} 
                                />
                              </div>
                            </div>

                            <button
                              className={styles.menuItem}
                              disabled={stageIndex === 0}
                              onClick={() => { moveStage(stage.id, -1); setActiveMenu(null); }}
                            >
                              <ArrowLeft size={14} />
                              <span>Mover para a esquerda</span>
                            </button>
                            <button
                              className={styles.menuItem}
                              disabled={stageIndex === pipelineStages.length - 1}
                              onClick={() => { moveStage(stage.id, 1); setActiveMenu(null); }}
                            >
                              <ArrowRight size={14} />
                              <span>Mover para a direita</span>
                            </button>

                            {stage.id !== 'ganho' && (
                              <>
                                <div className={styles.menuDivider} />
                                <button className={`${styles.menuItem} ${styles.deleteItem}`} onClick={() => {
                                  deleteStage(stage.id);
                                  setActiveMenu(null);
                                }}>
                                  <Trash2 size={14} />
                                  <span>Excluir Etapa</span>
                                </button>
                              </>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                    )}
                  </div>

                  <Droppable droppableId={stage.id} type="LEAD">
                    {(provided, snapshot) => (
                      <div 
                        className={`${styles.leadList} ${snapshot.isDraggingOver ? styles.draggingOver : ''}`}
                        {...provided.droppableProps}
                        ref={provided.innerRef}
                      >
                        <AnimatePresence>
                          {stage.leads.map((leadId, index) => {
                            const lead = getLeadData(leadId);
                            if (!lead) return null; // If lead is broken/missing

                            return (
                              <Draggable key={lead.id} draggableId={lead.id} index={index}>
                                {(provided, snapshot) => (
                                  <div
                                    ref={provided.innerRef}
                                    {...provided.draggableProps}
                                    {...provided.dragHandleProps}
                                    className={`${styles.leadCard} ${snapshot.isDragging ? styles.dragging : ''}`}
                                    style={{ ...provided.draggableProps.style }}
                                    onClick={() => setSelectedLead(lead)}
                                  >
                                    <div className={styles.cardHeader}>
                                      <span className={styles.companyName}>{lead.name}</span>
                                      <Grab size={14} className={styles.dragHandleIcon} />
                                    </div>
                                    <div className={styles.contactInfo} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                      <span style={{ fontSize: '0.8rem', color: 'var(--foreground)', opacity: 0.6 }}>{lead.cpfCnpj || lead.email}</span>
                                      {lead.assignedTo && (
                                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', width: 'fit-content', padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 500 }}>
                                          <User size={10} />
                                          {profiles.find(p => p.id === lead.assignedTo)?.name || 'Carregando...'}
                                        </div>
                                      )}
                                    </div>
                                    <div className={styles.leadValue}>{lead.value || 'R$ 0'}</div>
                                                                        <div className={styles.leadMeta}>
                                      <div style={{ display: 'flex', gap: '8px' }}>
                                        {lead.channels?.map((type: string) => {
                                          switch (type.toLowerCase()) {
                                            case 'whatsapp': return <MessageCircle key={type} size={14} style={{ color: '#25D366' }} />;
                                            case 'instagram': return <Globe key={type} size={14} style={{ color: '#E4405F' }} />;
                                            case 'facebook': return <Globe key={type} size={14} style={{ color: '#1877F2' }} />;
                                            case 'site': return <Globe key={type} size={14} style={{ color: '#3498db' }} />;
                                            default: return <Globe key={type} size={14} />;
                                          }
                                        })}
                                        {lead.email && <Mail size={14} style={{ color: '#3b82f6' }} />}
                                      </div>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <Clock size={12} />
                                        <span>{lead.days || 0}d</span>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </Draggable>
                            );
                          })}
                        </AnimatePresence>
                        {provided.placeholder}
                        
                        <button className={styles.addLeadBtn} onClick={openModal}>
                          <Plus size={16} /> Adicionar Lead
                        </button>
                      </div>
                    )}
                  </Droppable>
                </div>
                )}
                </Draggable>
              ))}
              {boardProvided.placeholder}
            </div>
            )}
            </Droppable>
          </DragDropContext>
        </div>
      )}

      {/* Modal de Detalhes do Lead */}
      <AnimatePresence>
        {selectedLead && (
          <div className={styles.modalOverlayCentered} onClick={() => {
            setSelectedLead(null);
            setIsEditing(false);
          }}>
            <motion.div 
              className={`${styles.detailsModalCentered} ${isEditing ? styles.editingMode : ''}`}
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={styles.detailsHeader}>
                <div className={styles.userIconLarge} style={{ background: selectedLead.color }}>
                   <User size={32} color="white" />
                </div>
                <div className={styles.headerInfo}>
                   {isEditing ? (
                     <input 
                       className={styles.editTitleInput}
                       value={editForm?.name || ''} 
                       onChange={e => setEditForm({...editForm, name: e.target.value})}
                     />
                   ) : (
                     <h3 onClick={() => {
                        setEditForm(selectedLead);
                        setIsEditing(true);
                     }} style={{ cursor: 'pointer' }}>{selectedLead.name}</h3>
                   )}
                   <span className={styles.entryDate}>Registrado em {selectedLead.entryDate || 'N/A'}</span>
                </div>
                <div className={styles.modalActions}>
                  {!isEditing && (
                    <button className={styles.deleteLeadBtn} onClick={() => {
                      if (confirm(`Tem certeza que deseja excluir o lead ${selectedLead.name}?`)) {
                        deleteLead(selectedLead.id);
                        setSelectedLead(null);
                      }
                    }}>
                      <Trash2 size={18} />
                    </button>
                  )}
                  <button className={styles.closeDetails} onClick={() => {
                    setSelectedLead(null);
                    setIsEditing(false);
                  }}>
                    <X size={20} />
                  </button>
                </div>
              </div>

              <div className={styles.detailsBody}>
                <div className={styles.infoGrid}>
                  <div className={styles.infoCard}>
                    <div className={styles.infoIcon}><Mail size={16} /></div>
                    <div className={styles.infoContent}>
                      <label>E-mail</label>
                      {isEditing ? (
                        <input className={styles.editInput} value={editForm?.email || ''} onChange={e => setEditForm({...editForm, email: e.target.value})} />
                      ) : (
                        <span>{selectedLead.email || 'Não informado'}</span>
                      )}
                    </div>
                  </div>
                  
                  <div className={styles.infoCard}>
                    <div className={styles.infoIcon}><Phone size={16} /></div>
                    <div className={styles.infoContent}>
                      <label>Telefone</label>
                      {isEditing ? (
                        <input className={styles.editInput} value={editForm?.phone || ''} onChange={e => setEditForm({...editForm, phone: e.target.value})} />
                      ) : (
                        <span>{selectedLead.phone || 'Não informado'}</span>
                      )}
                    </div>
                  </div>

                  <div className={styles.infoCard}>
                    <div className={styles.infoIcon}><Hash size={16} /></div>
                    <div className={styles.infoContent}>
                      <label>CPF / CNPJ</label>
                      {isEditing ? (
                        <input className={styles.editInput} value={editForm?.cpfCnpj || ''} onChange={e => setEditForm({...editForm, cpfCnpj: e.target.value})} />
                      ) : (
                        <span>{selectedLead.cpfCnpj || 'Não informado'}</span>
                      )}
                    </div>
                  </div>

                  <div className={styles.infoCard}>
                    <div className={styles.infoIcon}><ShoppingBag size={16} /></div>
                    <div className={styles.infoContent}>
                      <label>Valor Estimado</label>
                      {isEditing ? (
                        <input className={styles.editInput} value={editForm?.value || ''} onChange={e => setEditForm({...editForm, value: e.target.value})} />
                      ) : (
                        <span className={styles.importantValue}>{selectedLead.value || 'R$ 0,00'}</span>
                      )}
                    </div>
                  </div>

                  <div className={styles.infoCard}>
                    <div className={styles.infoIcon}><User size={16} /></div>
                    <div className={styles.infoContent}>
                      <label>Responsável</label>
                      {isEditing ? (
                        (user?.role === 'ADMIN' || user?.role === 'MANAGER') ? (
                          <select 
                            className={styles.editInput} 
                            value={editForm?.assignedTo || ''} 
                            onChange={e => setEditForm({...editForm, assignedTo: e.target.value || null})}
                            style={{ width: '100%', background: 'transparent', border: 'none', color: 'var(--foreground)', outline: 'none' }}
                          >
                            <option value="">Sem responsável</option>
                            {profiles.map(p => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span>
                            {editForm?.assignedTo 
                              ? (profiles.find(p => p.id === editForm.assignedTo)?.name || 'Carregando...') 
                              : 'Sem responsável'}
                          </span>
                        )
                      ) : (
                        <span>
                          {selectedLead.assignedTo 
                            ? (profiles.find(p => p.id === selectedLead.assignedTo)?.name || 'Carregando...') 
                            : 'Sem responsável'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className={styles.detailsSection}>
                  <label><History size={14} /> Histórico e Notas</label>
                  <div className={styles.notesArea}>
                     <div className={styles.noteItem}>
                        <div className={styles.noteDot} style={{ background: selectedLead.color }} />
                        <div className={styles.noteContent}>
                           <p>Lead adicionado à etapa <strong>{pipelineStages.find(s => s.id === selectedLead.pipelineStage)?.name}</strong></p>
                           <span>Há {selectedLead.days || 0} dias</span>
                        </div>
                     </div>
                  </div>
                </div>

                <div className={styles.tagSection}>
                   <label>Tags</label>
                   <div className={styles.detailsTags}>
                      {selectedLead.tags?.map((tag: string) => (
                        <span key={tag} className={styles.detailsTag}>{tag}</span>
                      ))}
                      {(!selectedLead.tags || selectedLead.tags.length === 0) && <span style={{ opacity: 0.3 }}>Nenhuma tag aplicada</span>}
                   </div>
                </div>
              </div>

              <div className={styles.detailsFooter}>
                 {isEditing ? (
                   <>
                    <button className={styles.cancelEditBtn} onClick={() => setIsEditing(false)}>
                      Cancelar
                    </button>
                    <button className={styles.saveBtn} onClick={() => {
                        updateLead(selectedLead.id, editForm);
                        setSelectedLead({...selectedLead, ...editForm});
                        setIsEditing(false);
                    }}>
                      <Save size={18} />
                      Salvar Alterações
                    </button>
                   </>
                 ) : (
                   <>
                    <button className={styles.whatsappBtn} onClick={() => router.push(`/messages?chatId=${selectedLead.id}`)}>
                        <MessageCircle size={18} />
                        Conversar via WhatsApp
                    </button>
                    <button className={styles.editBtn} onClick={() => {
                        setEditForm(selectedLead);
                        setIsEditing(true);
                    }}>
                        <Edit2 size={16} />
                    </button>
                   </>
                 )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
