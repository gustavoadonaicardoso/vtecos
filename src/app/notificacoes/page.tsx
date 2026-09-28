"use client";

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, MessageSquare, Zap, UserPlus, CheckCircle2, Check, CheckCheck } from 'lucide-react';
import styles from './notificacoes.module.css';
import { useAuth } from '@/context/AuthContext';
import { useRelativeTime } from '@/hooks/useRelativeTime';
import {
  fetchUserNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from '@/services/notifications.service';
import type { SystemNotification } from '@/types';

const TYPE_CONFIG: Record<string, { icon: any; color: string; label: string }> = {
  chat: { icon: MessageSquare, color: '#3b82f6', label: 'Chat' },
  automation: { icon: Zap, color: '#f59e0b', label: 'Automação' },
  lead: { icon: UserPlus, color: '#10b981', label: 'Lead' },
  task: { icon: CheckCircle2, color: '#8b5cf6', label: 'Tarefa' },
  system: { icon: Bell, color: '#6b7280', label: 'Sistema' },
};

export default function NotificacoesPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { format: formatRelative } = useRelativeTime();
  const [notifications, setNotifications] = useState<SystemNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const data = await fetchUserNotifications(user.id, 200);
    setLoadError(data === null);
    setNotifications(data || []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleMarkAsRead = async (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    await markNotificationAsRead(id);
  };

  const handleMarkAllAsRead = async () => {
    if (!user) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    await markAllNotificationsAsRead(user.id);
  };

  const handleOpenLink = (notif: SystemNotification) => {
    if (!notif.is_read) handleMarkAsRead(notif.id);
    if (notif.link) router.push(notif.link);
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.titleArea}>
          <h1>Histórico de Notificações</h1>
          <p>Registro técnico completo de todas as notificações recebidas por este usuário (até 200 mais recentes).</p>
        </div>
        <button
          className={styles.markAllBtn}
          onClick={handleMarkAllAsRead}
          disabled={unreadCount === 0}
        >
          <CheckCheck size={16} /> Marcar todas como lidas
        </button>
      </header>

      <div className={styles.summary}>
        <span>{notifications.length} notificações</span>
        <span className={styles.dot} />
        <span>{unreadCount} não lidas</span>
      </div>

      {loading ? (
        <div className={styles.emptyState}>
          <p>Carregando...</p>
        </div>
      ) : loadError ? (
        <div className={styles.errorBanner}>
          <p>Não foi possível carregar o histórico de notificações. Veja o console do navegador (F12) para detalhes do erro.</p>
        </div>
      ) : notifications.length === 0 ? (
        <div className={styles.emptyState}>
          <Bell size={48} opacity={0.15} />
          <p>Nenhuma notificação registrada ainda.</p>
        </div>
      ) : (
        <div className={styles.table}>
          <div className={styles.tableHeadRow}>
            <span>Tipo</span>
            <span>Notificação</span>
            <span>Recebida em</span>
            <span>Status</span>
            <span>ID</span>
            <span></span>
          </div>
          {notifications.map((notif) => {
            const config = TYPE_CONFIG[notif.type] || TYPE_CONFIG.system;
            return (
              <div key={notif.id} className={`${styles.row} ${!notif.is_read ? styles.unreadRow : ''}`}>
                <span className={styles.typeCell}>
                  <span className={styles.typeBadge} style={{ backgroundColor: `${config.color}15`, color: config.color }}>
                    <config.icon size={13} /> {config.label}
                  </span>
                </span>
                <span
                  className={`${styles.contentCell} ${notif.link ? styles.clickable : ''}`}
                  onClick={() => notif.link && handleOpenLink(notif)}
                >
                  <strong>{notif.title}</strong>
                  <p>{notif.content}</p>
                </span>
                <span className={styles.dateCell}>
                  <span>{new Date(notif.created_at).toLocaleString('pt-BR')}</span>
                  <span className={styles.relativeTime}>{formatRelative(notif.created_at)}</span>
                </span>
                <span className={styles.statusCell}>
                  <span className={`${styles.statusBadge} ${notif.is_read ? styles.statusRead : styles.statusUnread}`}>
                    {notif.is_read ? 'Lida' : 'Não lida'}
                  </span>
                </span>
                <span className={styles.idCell} title={notif.id}>{notif.id.slice(0, 8)}…</span>
                <span className={styles.actionsCell}>
                  {!notif.is_read && (
                    <button
                      className={styles.markReadBtn}
                      onClick={() => handleMarkAsRead(notif.id)}
                      title="Marcar como lida"
                    >
                      <Check size={14} />
                    </button>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
