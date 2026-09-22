import { Bell, ChevronLeft, HelpCircle, MoreVertical, Users as UsersIcon } from 'lucide-react';
import Link from 'next/link';
import ThemeToggle from '@/components/ThemeToggle';
import NotificationDropdown from '@/components/NotificationDropdown';
import styles from '../chat.module.css';
import { getInitials } from '../utils';
import type { Profile } from '../types';

interface ChatHeaderProps {
  selectedProfileId: string | null;
  selectedProfile: Profile | undefined;
  onBack: () => void;
  showNotifications: boolean;
  onToggleNotifications: () => void;
  onCloseNotifications: () => void;
  unreadCount: number;
  onOpenGroupInfo: () => void;
}

export default function ChatHeader({ selectedProfileId, selectedProfile, onBack, showNotifications, onToggleNotifications, onCloseNotifications, unreadCount, onOpenGroupInfo }: ChatHeaderProps) {
  return (
    <header className={styles.chatHeader}>
      <div className={styles.headerInfo}>
        {selectedProfileId && (
          <button
            className={`${styles.actionBtn} ${styles.hideOnDesktop}`}
            onClick={onBack}
            aria-label="Voltar para a lista de conversas"
          >
            <ChevronLeft size={24} />
          </button>
        )}
        {selectedProfile ? (
          <>
            <div className={styles.userAvatar} style={{ width: 40, height: 40 }}>
              {selectedProfile.isGroup ? (
                selectedProfile.avatar_url ? <img src={selectedProfile.avatar_url} alt="Group" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : <UsersIcon size={20} />
              ) : getInitials(selectedProfile.name)}
              {!selectedProfile.isGroup && <div className={styles.statusIndicator} />}
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem' }}>{selectedProfile.name}</h3>
              <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>Online</span>
            </div>
          </>
        ) : (
          <h3 style={{ margin: 0, fontSize: '1.2rem', opacity: 0.8 }}>Mensagens do Sistema</h3>
        )}
      </div>

      <div className={styles.systemTools}>
        <ThemeToggle />
        <Link href="/help" className={styles.systemIcon} aria-label="Central de ajuda">
          <HelpCircle size={22} opacity={0.6} />
        </Link>
        <div className={styles.notificationWrapper}>
          <button
            className={styles.systemIcon}
            onClick={onToggleNotifications}
            aria-label="Notificações"
          >
            <Bell size={20} opacity={unreadCount > 0 ? 1 : 0.6} />
            {unreadCount > 0 && (
              <span className={styles.systemBadge}>{unreadCount}</span>
            )}
          </button>
          <NotificationDropdown
            isOpen={showNotifications}
            onClose={onCloseNotifications}
          />
          {selectedProfile?.isGroup && (
            <button
              className={styles.actionBtn}
              onClick={onOpenGroupInfo}
              title="Informações do Grupo"
              aria-label="Informações do grupo"
            >
              <MoreVertical size={20} />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
