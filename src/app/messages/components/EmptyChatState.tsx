import { MessageSquare, Users, Zap } from 'lucide-react';
import styles from '../messages.module.css';
import SystemToolsBar from './SystemToolsBar';

interface EmptyChatStateProps {
  userName?: string;
  showNotifications: boolean;
  onToggleNotifications: () => void;
  onCloseNotifications: () => void;
  unreadCount: number;
}

export default function EmptyChatState({ userName, showNotifications, onToggleNotifications, onCloseNotifications, unreadCount }: EmptyChatStateProps) {
  return (
    <div className={styles.emptyState}>
      <div className={styles.emptyStateTools}>
        <SystemToolsBar
          userName={userName}
          showNotifications={showNotifications}
          onToggleNotifications={onToggleNotifications}
          onCloseNotifications={onCloseNotifications}
          unreadCount={unreadCount}
        />
      </div>
      <div className={styles.emptyStateContent}>
        <div className={styles.iconCircle}>
          <MessageSquare size={64} className={styles.primaryIcon} />
          <div className={styles.floatingBadges}>
            <div className={styles.badgeItem}><Zap size={16} /></div>
            <div className={styles.badgeItem}><Users size={16} /></div>
          </div>
        </div>
        <h2>Módulo de Conversas</h2>
        <p>Gerencie todos os seus canais em um único lugar. Selecione uma conversa ao lado para começar.</p>
        <div className={styles.quickTips}>
          <span>💡 Use as abas para filtrar por tipo de conversa</span>
        </div>
      </div>
    </div>
  );
}
