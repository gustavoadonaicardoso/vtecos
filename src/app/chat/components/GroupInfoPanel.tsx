import React from 'react';
import { Camera, FileText, X } from 'lucide-react';
import { motion } from 'framer-motion';
import styles from '../chat.module.css';
import { FILE_MESSAGE_PATTERN, getInitials } from '../utils';
import type { GroupMember, InternalMessage, Profile } from '../types';

interface GroupInfoPanelProps {
  selectedProfile: Profile;
  groupMembers: GroupMember[];
  currentUserId: string | undefined;
  messages: InternalMessage[];
  groupAvatarInputRef: React.RefObject<HTMLInputElement | null>;
  onGroupAvatarUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onMakeAdmin: (userId: string) => void;
  onRevokeAdmin: (userId: string) => void;
  onClose: () => void;
}

export default function GroupInfoPanel({ selectedProfile, groupMembers, currentUserId, messages, groupAvatarInputRef, onGroupAvatarUpload, onMakeAdmin, onRevokeAdmin, onClose }: GroupInfoPanelProps) {
  const viewerIsAdmin = groupMembers.find(g => g.id === currentUserId)?.isAdmin;
  const fileMessages = messages.filter(m => m.text.match(FILE_MESSAGE_PATTERN));

  return (
    <motion.aside
      className={styles.infoSidebar}
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: 350, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
    >
      <div className={styles.infoHeader}>
        <button className={styles.actionBtn} onClick={onClose}>
          <X size={20} />
        </button>
        <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600 }}>Dados do grupo</h3>
      </div>

      <div className={styles.infoSection} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', borderBottom: '8px solid rgba(255,255,255,0.02)' }}>
        <div
          style={{ width: '150px', height: '150px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', overflow: 'hidden', position: 'relative', marginBottom: '16px' }}
          onClick={() => groupAvatarInputRef.current?.click()}
          title="Alterar foto do grupo"
        >
          {selectedProfile.avatar_url ? (
            <img src={selectedProfile.avatar_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Avatar" />
          ) : <Camera size={48} opacity={0.5} />}
          <div style={{ position: 'absolute', bottom: 0, background: 'rgba(0,0,0,0.5)', width: '100%', textAlign: 'center', fontSize: '12px', padding: '6px 0', fontWeight: 600, color: 'white' }}>
            ADICIONAR FOTO
          </div>
        </div>
        <input type="file" ref={groupAvatarInputRef} style={{ display: 'none' }} accept="image/*" onChange={onGroupAvatarUpload} />
        <h2 style={{ fontSize: '1.4rem', margin: '0 0 4px 0' }}>{selectedProfile.name}</h2>
        <span style={{ fontSize: '0.9rem', opacity: 0.6 }}>Grupo · {groupMembers.length} participantes</span>
      </div>

      <div className={styles.infoSection}>
        <h4>Membros do Grupo</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {groupMembers.map(m => (
            <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'var(--primary-color, #3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 600 }}>
                  {getInitials(m.name)}
                </div>
                <span style={{ fontSize: '0.95rem', fontWeight: 500 }}>
                  {m.name} {m.id === currentUserId && <span style={{ opacity: 0.6 }}>(Você)</span>}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {m.isAdmin ? (
                  <>
                    <span style={{ fontSize: '0.75rem', background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', border: '1px solid rgba(59, 130, 246, 0.3)', padding: '2px 8px', borderRadius: '12px', fontWeight: 600 }}>Admin</span>
                    {viewerIsAdmin && m.id !== selectedProfile?.createdBy && (
                      <button onClick={() => onRevokeAdmin(m.id)} style={{ fontSize: '0.7rem', background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', opacity: 0.7 }}>Remover</button>
                    )}
                  </>
                ) : (
                  viewerIsAdmin && (
                    <button onClick={() => onMakeAdmin(m.id)} style={{ fontSize: '0.75rem', background: 'transparent', border: '1px solid var(--border)', color: 'var(--foreground)', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', transition: 'all 0.2s' }}>Tornar Admin</button>
                  )
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.infoSection}>
        <h4>Arquivos e Mídia</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {fileMessages.map(m => {
            const fileMatch = m.text.match(FILE_MESSAGE_PATTERN);
            return fileMatch ? (
              <a key={m.id} href={fileMatch[1]} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.9rem', color: 'var(--foreground)', textDecoration: 'none', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', padding: '10px 12px', borderRadius: '8px', transition: 'all 0.2s' }}>
                <div style={{ background: 'rgba(255,255,255,0.1)', padding: '8px', borderRadius: '8px' }}>
                  <FileText size={18} />
                </div>
                <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', flex: 1 }}>{fileMatch[2]}</span>
              </a>
            ) : null;
          })}
          {fileMessages.length === 0 && (
            <span style={{ fontSize: '0.9rem', opacity: 0.5, fontStyle: 'italic' }}>Nenhum arquivo foi enviado ainda.</span>
          )}
        </div>
      </div>
    </motion.aside>
  );
}
