import { LogOut, Pin, PinOff, Search, Trash2, Users as UsersIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import styles from '../chat.module.css';
import { getInitials } from '../utils';
import type { Profile } from '../types';

interface ChatSidebarProps {
  filteredProfiles: Profile[];
  selectedProfileId: string | null;
  currentUserId: string | undefined;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  onSelectProfile: (profileId: string) => void;
  onNewGroup: () => void;
  pinnedChats: Set<string>;
  onTogglePin: (profileId: string) => void;
  onRequestDelete: (profileId: string) => void;
  hiddenOnMobile: boolean;
}

export default function ChatSidebar({ filteredProfiles, selectedProfileId, currentUserId, searchQuery, onSearchQueryChange, onSelectProfile, onNewGroup, pinnedChats, onTogglePin, onRequestDelete, hiddenOnMobile }: ChatSidebarProps) {
  return (
    <aside className={`${styles.sidebar} ${hiddenOnMobile ? styles.hiddenOnMobile : ''}`}>
      <div className={styles.sidebarHeader}>
        <h2>Chat Interno</h2>
        <button
          className={styles.actionBtn}
          onClick={onNewGroup}
          title="Novo Grupo"
        >
          <UsersIcon size={20} />
        </button>
      </div>
      <div className={styles.searchArea}>
        <div className={styles.searchBar}>
          <Search size={18} opacity={0.5} />
          <input
            type="text"
            placeholder="Pesquisar..."
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
          />
        </div>
      </div>

      <div className={styles.userList}>
        {filteredProfiles.length > 0 ? (
          filteredProfiles.map(profile => (
            <motion.div
              key={profile.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className={`${styles.userItem} ${selectedProfileId === profile.id ? styles.userItemActive : ''}`}
              onClick={() => onSelectProfile(profile.id)}
            >
              <div className={styles.userAvatar}>
                {profile.isGroup ? (
                  profile.avatar_url ? <img src={profile.avatar_url} alt="Group" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : <UsersIcon size={20} />
                ) : getInitials(profile.name)}
                {!profile.isGroup && <div className={styles.statusIndicator} />}
              </div>
              <div className={styles.userInfo}>
                <span className={styles.userName} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {profile.name}
                  {profile.id === currentUserId && <span style={{ opacity: 0.55, fontSize: '0.7rem' }}>(Você)</span>}
                  {pinnedChats.has(profile.id) && <Pin size={12} style={{ opacity: 0.6, transform: 'rotate(45deg)' }} />}
                </span>
                <span className={styles.userRole}>{profile.role}</span>
              </div>
              <div className={styles.userActions}>
                <button
                  className={styles.deleteBtn}
                  onClick={(e) => { e.stopPropagation(); onTogglePin(profile.id); }}
                  title={pinnedChats.has(profile.id) ? "Desfixar conversa" : "Fixar conversa"}
                >
                  {pinnedChats.has(profile.id) ? <PinOff size={15} /> : <Pin size={15} />}
                </button>
                {profile.id !== currentUserId && (
                  <button
                    className={styles.deleteBtn}
                    onClick={(e) => { e.stopPropagation(); onRequestDelete(profile.id); }}
                    title={profile.isGroup && profile.createdBy !== currentUserId ? "Sair do grupo" : "Apagar"}
                  >
                    {profile.isGroup && profile.createdBy !== currentUserId ? <LogOut size={15} /> : <Trash2 size={15} />}
                  </button>
                )}
              </div>
            </motion.div>
          ))
        ) : (
          <div className={styles.emptyState} style={{ opacity: 0.3, fontSize: '0.8rem' }}>
            Nenhum colega encontrado.
          </div>
        )}
      </div>
    </aside>
  );
}
