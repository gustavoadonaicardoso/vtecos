"use client";

/**
 * ============================================================
 * VÓRTICE CRM — Navbar
 * ============================================================
 * Header da aplicação. Contagem de notificações via service.
 * ============================================================
 */

import React from 'react';
import { Bell, HelpCircle, Menu, X, Phone } from 'lucide-react';
import styles from './Navbar.module.css';
import ThemeToggle from './ThemeToggle';
import { useSidebar } from '@/components/SidebarProvider';
import Link from 'next/link';
import NotificationDropdown from './NotificationDropdown';
import { useLeads } from '@/context/LeadContext';
import { useAuth } from '@/context/AuthContext';
import { fetchUnreadNotificationsCount } from '@/services/notifications.service';
import { useTwilio } from '@/context/TwilioContext';

const NOTIFICATIONS_POLL_MS = 20_000;

const Navbar = () => {
  const { isMobileOpen, toggleMobileMenu } = useSidebar();
  const { openModal } = useLeads();
  const { user } = useAuth();
  const { toggleDialer } = useTwilio();
  const [showNotifications, setShowNotifications] = React.useState(false);
  const [unreadCount, setUnreadCount] = React.useState(0);

  const toggleNotifications = () => setShowNotifications(!showNotifications);
  const closeNotifications = () => setShowNotifications(false);

  React.useEffect(() => {
    if (!user) return;

    const refreshCount = () => fetchUnreadNotificationsCount(user.id).then((c) => setUnreadCount(c ?? 0));

    refreshCount();
    // A leitura passa por uma API autenticada (não dá pra assinar
    // Realtime nela), então o badge atualiza por polling.
    const interval = setInterval(refreshCount, NOTIFICATIONS_POLL_MS);

    return () => clearInterval(interval);
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

        {(!user?.workspace || user.workspace.modules.includes('crm')) && (
          <button
            className={styles.actionButton}
            onClick={toggleDialer}
            title="Abrir Discador"
          >
            <Phone size={20} />
          </button>
        )}

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
