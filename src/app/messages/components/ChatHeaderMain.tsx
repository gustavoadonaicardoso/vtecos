import { ChevronLeft, Info } from 'lucide-react';
import styles from '../messages.module.css';
import type { ChatListItem } from '../types';
import SystemToolsBar from './SystemToolsBar';

interface ChatHeaderMainProps {
  selectedChat: ChatListItem;
  onBack: () => void;
  userName?: string;
  showNotifications: boolean;
  onToggleNotifications: () => void;
  onCloseNotifications: () => void;
  unreadCount: number;
  onToggleInfo: () => void;
}

export default function ChatHeaderMain({ selectedChat, onBack, userName, showNotifications, onToggleNotifications, onCloseNotifications, unreadCount, onToggleInfo }: ChatHeaderMainProps) {
  return (
    <div className={styles.chatHeaderMain}>
      <div className={styles.chatHeaderUser}>
        <button className="sm:hidden" style={{ background: 'none', border: 'none', color: 'var(--foreground)' }} onClick={onBack}><ChevronLeft size={24} /></button>
        <div className={styles.avatar} style={{ background: selectedChat.color, width: 40, height: 40, fontSize: '1rem' }}>{selectedChat.avatar}</div>
        <div><h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>{selectedChat.name}</h3><span style={{ fontSize: '0.8rem', opacity: 0.7 }}>Online agora</span></div>
      </div>
      <div className={styles.headerRightTools}>
        <SystemToolsBar
          userName={userName}
          showNotifications={showNotifications}
          onToggleNotifications={onToggleNotifications}
          onCloseNotifications={onCloseNotifications}
          unreadCount={unreadCount}
        />
        <button className={styles.actionBtn} onClick={onToggleInfo}><Info size={20} /></button>
      </div>
    </div>
  );
}
