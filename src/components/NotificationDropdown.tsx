"use client";

/**
 * ============================================================
 * VÓRTICE CRM — NotificationDropdown
 * ============================================================
 * Lógica de dados extraída para @/hooks/useNotifications.
 * Este componente lida apenas com renderização.
 * ============================================================
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, MessageSquare, Zap, UserPlus, CheckCircle2, Trash2 } from 'lucide-react';
import styles from './NotificationDropdown.module.css';
import { useNotifications } from '@/hooks/useNotifications';
import { useRelativeTime } from '@/hooks/useRelativeTime';
import { useRouter } from 'next/navigation';
import type { SystemNotification } from '@/types';

// Configuração visual por tipo de notificação
const TYPE_CONFIG: Record<string, { icon: any; color: string }> = {
  chat: { icon: MessageSquare, color: '#3b82f6' },
  automation: { icon: Zap, color: '#f59e0b' },
  lead: { icon: UserPlus, color: '#10b981' },
  task: { icon: CheckCircle2, color: '#8b5cf6' },
  system: { icon: Bell, color: '#6b7280' },
};

interface NotificationDropdownProps {
  isOpen: boolean;
  onClose: () => void;
}

const NotificationDropdown: React.FC<NotificationDropdownProps> = ({ isOpen, onClose }) => {
  const router = useRouter();
  const { format: formatTime } = useRelativeTime();
  // Toda a lógica de dados vem do hook — componente fica "burro"
  const { notifications, loading, unreadCount, markAsRead, clearAll } = useNotifications(isOpen);

  const handleNotificationClick = async (notif: SystemNotification) => {
    await markAsRead(notif.id);
    if (notif.link) {
      router.push(notif.link);
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <div className={styles.overlay} onClick={onClose} />
          <motion.div
            className={styles.dropdown}
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
          >
            <div className={styles.header}>
              <h3>Notificações</h3>
              {unreadCount > 0 && (
                <span className={styles.unreadCount}>{unreadCount} novas</span>
              )}
              <button
                className={styles.clearBtn}
                onClick={clearAll}
                title="Limpar todas"
              >
                <Trash2 size={14} />
              </button>
            </div>

            <div className={styles.list}>
              {loading ? (
                <div className={styles.emptyState}>
                  <p>Carregando...</p>
                </div>
              ) : notifications.length > 0 ? (
                notifications.map((notif) => {
                  const config = TYPE_CONFIG[notif.type] || TYPE_CONFIG.system;
                  return (
                    <div
                      key={notif.id}
                      className={`${styles.item} ${!notif.is_read ? styles.unread : ''}`}
                      onClick={() => handleNotificationClick(notif)}
                    >
                      <div
                        className={styles.iconWrapper}
                        style={{ backgroundColor: `${config.color}15`, color: config.color }}
                      >
                        <config.icon size={18} />
                      </div>
                      <div className={styles.content}>
                        <div className={styles.itemHeader}>
                          <span className={styles.title}>{notif.title}</span>
                          <span className={styles.time}>{formatTime(notif.created_at)}</span>
                        </div>
                        <p className={styles.text}>{notif.content}</p>
                      </div>
                      {!notif.is_read && <div className={styles.unreadDot} />}
                    </div>
                  );
                })
              ) : (
                <div className={styles.emptyState}>
                  <Bell size={48} opacity={0.1} />
                  <p>Nenhuma notificação por aqui.</p>
                </div>
              )}
            </div>

            <div className={styles.footer}>
              <button className={styles.seeAll}>Ver todas as notificações</button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default NotificationDropdown;
