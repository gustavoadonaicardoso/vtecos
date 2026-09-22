import { Search, UserPlus } from 'lucide-react';
import styles from '../messages.module.css';
import { CHAT_TABS } from '../constants';
import type { ChatListItem } from '../types';

interface ChatSidebarProps {
  hiddenOnMobile: boolean;
  canCreateContact: boolean;
  onNewContact: () => void;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  activeTab: string;
  onTabChange: (tab: string) => void;
  filteredChats: ChatListItem[];
  selectedChatId: string | null;
  onSelectChat: (chatId: string) => void;
}

export default function ChatSidebar({ hiddenOnMobile, canCreateContact, onNewContact, searchQuery, onSearchQueryChange, activeTab, onTabChange, filteredChats, selectedChatId, onSelectChat }: ChatSidebarProps) {
  return (
    <div className={`${styles.sidebar} ${hiddenOnMobile ? styles.hiddenOnMobile : ''}`}>
      <div className={styles.sidebarHeader}>
        <div className={styles.sidebarTitleRow}>
          <h1 className={styles.sidebarTitle}>Mensagens</h1>
          {canCreateContact && (
            <button
              className={styles.newContactBtn}
              onClick={onNewContact}
              title="Novo Contato"
            >
              <UserPlus size={16} />
              <span>Novo</span>
            </button>
          )}
        </div>
        <div className={styles.searchBar}>
          <Search size={18} style={{ opacity: 0.5 }} />
          <input type="text" placeholder="Filtrar..." value={searchQuery} onChange={(e) => onSearchQueryChange(e.target.value)} />
        </div>
      </div>
      <div className={styles.tabs}>
        {CHAT_TABS.map(tab => (
          <button key={tab} className={`${styles.tabBtn} ${activeTab === tab ? styles.active : ''}`} onClick={() => onTabChange(tab)}>{tab}</button>
        ))}
      </div>
      <div className={styles.chatList}>
        {filteredChats.map(chat => (
          <div key={chat.id} className={`${styles.chatItem} ${selectedChatId === chat.id ? styles.activeChat : ''}`} onClick={() => onSelectChat(chat.id)}>
            <div className={styles.avatar} style={{ background: chat.color }}>{chat.avatar}</div>
            <div className={styles.chatInfo}>
              <div className={styles.chatHeader}><span className={styles.chatName}>{chat.name}</span><span className={styles.chatTime}>{chat.time}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span className={styles.chatPreview}>{chat.text}</span></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
