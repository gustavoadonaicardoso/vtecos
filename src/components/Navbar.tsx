"use client";

/**
 * ============================================================
 * VÓRTICE CRM — Navbar
 * ============================================================
 * Header da aplicação. Contagem de notificações via service.
 * ============================================================
 */

import React from 'react';
import { Bell, HelpCircle, Menu, X } from 'lucide-react';
import styles from './Navbar.module.css';
import ThemeToggle from './ThemeToggle';
import { useSidebar } from '@/components/SidebarProvider';
import Link from 'next/link';
import NotificationDropdown from './NotificationDropdown';
import { useLeads } from '@/context/LeadContext';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { fetchUnreadNotificationsCount } from '@/services/notifications.service';

const Navbar = () => {
  const { isMobileOpen, toggleMobileMenu } = useSidebar();
  const { openModal } = useLeads();
  const { user } = useAuth();
  const [showNotifications, setShowNotifications] = React.useState(false);
  const [unreadCount, setUnreadCount] = React.useState(0);

  const toggleNotifications = () => setShowNotifications(!showNotifications);
  const closeNotifications = () => setShowNotifications(false);

  React.useEffect(() => {
    if (!user) return;

    // Busca inicial via service
    fetchUnreadNotificationsCount(user.id).then(setUnreadCount);

    // Realtime para atualizar badge em tempo real
    const channel = supabase
      .channel(`navbar_notifications_${user.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'system_notifications',
        filter: `user_id=eq.${user.id}`,
      }, () => fetchUnreadNotificationsCount(user.id).then(setUnreadCount))
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  return (
    <header className={styles.header}>
      <div className={styles.leftSection}>
        <button className={styles.hamburger} onClick={toggleMobileMenu}>
          {isMobileOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      <div className={styles.actionArea}>
        <ThemeToggle />
        <Link href="/help" className={styles.actionButton}>
          <HelpCircle size={22} />
        </Link>

        <button
          className={`${styles.actionButton} ${styles.notificationBtn}`}
          onClick={toggleNotifications}
        >
          <Bell size={20} />
          {unreadCount > 0 && (
            <span className={styles.badge}>{unreadCount}</span>
          )}
        </button>

        <NotificationDropdown
          isOpen={showNotifications}
          onClose={closeNotifications}
        />
      </div>
    </header>
  );
};

export default Navbar;
