import { Camera, Hash, Mail, MessageCircle, MessageSquare, Pencil, Share2, X } from 'lucide-react';
import { motion } from 'framer-motion';
import styles from '../messages.module.css';
import { CHANNEL_OPTIONS } from '../constants';
import type { ChatListItem, LeadEditForm } from '../types';

interface PipelineStage {
  id: string;
  name: string;
}

interface LeadInfoDrawerProps {
  selectedChat: ChatListItem;
  isEditing: boolean;
  onStartEdit: () => void;
  onClose: () => void;
  editForm: LeadEditForm;
  onEditFormChange: (form: LeadEditForm) => void;
  currentStageName: string;
  pipelineStages: PipelineStage[];
  selectedChannel: string;
  onSelectChannel: (channel: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onTransfer: () => void;
}

export default function LeadInfoDrawer({ selectedChat, isEditing, onStartEdit, onClose, editForm, onEditFormChange, currentStageName, pipelineStages, selectedChannel, onSelectChannel, onSaveEdit, onCancelEdit, onTransfer }: LeadInfoDrawerProps) {
  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className={styles.drawerOverlay}
        onClick={onClose}
      />
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className={styles.infoDrawer}
      >
        <div className={styles.drawerHeader}>
          <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{isEditing ? 'Editar Lead' : 'Dados do Lead'}</h3>
          <div style={{ display: 'flex', gap: '8px' }}>
            {!isEditing && (
              <button className={styles.actionBtn} onClick={onStartEdit} title="Editar dados"><Pencil size={18} /></button>
            )}
            <button className={styles.actionBtn} onClick={onClose}><X size={20} /></button>
          </div>
        </div>

        <div className={styles.drawerContent}>
          <div className={styles.profileSection}>
            <div className={styles.avatar} style={{ background: selectedChat.color, width: 80, height: 80, fontSize: '2rem' }}>
              {selectedChat.avatar}
            </div>
            {isEditing ? (
              <div style={{ width: '100%', marginTop: '12px' }}>
                <input
                  className={styles.infoInput}
                  value={editForm.name}
                  onChange={(e) => onEditFormChange({ ...editForm, name: e.target.value })}
                  placeholder="Nome do Lead"
                />
              </div>
            ) : (
              <>
                <h2 style={{ margin: '8px 0 4px 0', fontSize: '1.4rem' }}>{selectedChat.name}</h2>
                <span style={{ fontSize: '0.9rem', color: '#3b82f6', fontWeight: 500 }}>Status: Ativo</span>
              </>
            )}

            {!isEditing && (
              <div className={styles.profileStats}>
                <div className={styles.statItem}>
                  <span className={styles.statLabel}>Mensagens</span>
                  <span className={styles.statValue}>142</span>
                </div>
                <div className={styles.statItem}>
                  <span className={styles.statLabel}>Desde</span>
                  <span className={styles.statValue}>12/03</span>
                </div>
              </div>
            )}
          </div>

          <div className={styles.section}>
            <h4>Contato Principal</h4>
            <div className={styles.fieldGroup}>
              <span className={styles.fieldLabel}><Mail size={12} style={{ marginRight: 4 }} /> E-mail</span>
              {isEditing ? (
                <input
                  className={styles.infoInput}
                  value={editForm.email}
                  onChange={(e) => onEditFormChange({ ...editForm, email: e.target.value })}
                  placeholder="email@exemplo.com"
                />
              ) : (
                <span className={styles.fieldValue}>{editForm.email}</span>
              )}
            </div>
            <div className={styles.fieldGroup}>
              <span className={styles.fieldLabel}><MessageCircle size={12} style={{ marginRight: 4 }} /> Telefone / WhatsApp</span>
              {isEditing ? (
                <input
                  className={styles.infoInput}
                  value={editForm.phone}
                  onChange={(e) => onEditFormChange({ ...editForm, phone: e.target.value })}
                  placeholder="(00) 00000-0000"
                />
              ) : (
                <span className={styles.fieldValue}>{editForm.phone}</span>
              )}
            </div>
          </div>

          <div className={styles.section}>
            <h4>Dados Comerciais</h4>
            <div className={styles.fieldGroup}>
              <span className={styles.fieldLabel}><Hash size={12} style={{ marginRight: 4 }} /> Valor do Lead</span>
              {isEditing ? (
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.9rem', opacity: 0.6 }}>R$</span>
                  <input
                    className={styles.infoInput}
                    style={{ paddingLeft: '32px' }}
                    value={editForm.value}
                    onChange={(e) => onEditFormChange({ ...editForm, value: e.target.value })}
                    placeholder="0,00"
                  />
                </div>
              ) : (
                <span className={styles.fieldValue} style={{ color: '#059669', fontWeight: 600 }}>R$ {editForm.value}</span>
              )}
            </div>
            <div className={styles.fieldGroup}>
              <span className={styles.fieldLabel}><Share2 size={12} style={{ marginRight: 4 }} /> Estágio Kanban</span>
              {isEditing ? (
                <select
                  className={styles.infoInput}
                  value={editForm.stage}
                  onChange={(e) => onEditFormChange({ ...editForm, stage: e.target.value })}
                >
                  {pipelineStages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              ) : (
                <span className={styles.fieldValue}>{currentStageName}</span>
              )}
            </div>
          </div>

          {!isEditing && (
            <div className={styles.section}>
              <h4>Canal de Atendimento</h4>
              <div className={styles.channelSelector}>
                {CHANNEL_OPTIONS.map(channel => (
                  <button
                    key={channel}
                    className={`${styles.channelBtn} ${selectedChannel === channel ? styles.active : ''}`}
                    onClick={() => onSelectChannel(channel)}
                  >
                    {channel === 'WhatsApp' && <MessageCircle size={18} />}
                    {channel === 'Instagram' && <Camera size={18} />}
                    {channel === 'Messenger' && <MessageSquare size={18} />}
                    {channel === 'E-mail' && <Mail size={18} />}
                    <span>{channel}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className={styles.actionPanel}>
          {isEditing ? (
            <>
              <button className={styles.transferBtn} onClick={onSaveEdit}>
                Salvar Alterações
              </button>
              <button className={styles.secondaryBtn} onClick={onCancelEdit}>
                Cancelar
              </button>
            </>
          ) : (
            <button className={styles.transferBtn} onClick={onTransfer}>
              <Share2 size={18} />
              Transferir Atendimento
            </button>
          )}
        </div>
      </motion.div>
    </>
  );
}
