import { Bell, HelpCircle } from 'lucide-react';
import Link from 'next/link';
import ThemeToggle from '@/components/ThemeToggle';
import NotificationDropdown from '@/components/NotificationDropdown';
import styles from '../messages.module.css';

interface SystemToolsBarProps {
  userName?: string;
  showNotifications: boolean;
  onToggleNotifications: () => void;
  onCloseNotifications: () => void;
  unreadCount: number;
}

export default function SystemToolsBar({ userName, showNotifications, onToggleNotifications, onCloseNotifications, unreadCount }: SystemToolsBarProps) {
  return (
    <div className={styles.systemTools}>
      <ThemeToggle />
      <Link href="/help" className={styles.systemIcon}>
        <HelpCircle size={22} opacity={0.6} />
      </Link>
      <div className={styles.notificationWrapper}>
        <button
          className={styles.systemIcon}
          onClick={onToggleNotifications}
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
      </div>
      <div className={styles.userSection}>
        <span>{userName?.split(' ')[0]}</span>
        <div className={styles.miniAvatar}>
          {userName?.charAt(0)}
        </div>
      </div>
    </div>
  );
}
