"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { Calendar, RefreshCw, Loader2 } from 'lucide-react';
import type { UserProfile } from '@/types';
import styles from './WelcomeSection.module.css';

interface WelcomeSectionProps {
  user: UserProfile | null;
  currentFilter: string;
  onFilterChange: (filter: string) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'Bom dia';
  if (hour >= 12 && hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

function getRoleSubtitle(role?: string): string {
  switch (role) {
    case 'ADMIN':
      return 'Aqui está o panorama completo do sistema.';
    case 'MANAGER':
      return 'Sua equipe aguarda direcionamento.';
    case 'SELLER':
      return 'Continue onde parou. Seus leads te esperam.';
    default:
      return 'Bem-vindo ao VTEC OS.';
  }
}

function getRoleLabel(role?: string): string {
  switch (role) {
    case 'ADMIN': return 'Administrador';
    case 'MANAGER': return 'Gerente';
    case 'SELLER': return 'Vendedor';
    default: return '';
  }
}

function getRoleColor(role?: string): string {
  switch (role) {
    case 'ADMIN': return '#8b5cf6';
    case 'MANAGER': return '#3b82f6';
    case 'SELLER': return '#10b981';
    default: return '#6b7280';
  }
}

function getInitials(name?: string): string {
  if (!name) return 'U';
  return name
    .split(' ')
    .slice(0, 2)
    .map(n => n[0])
    .join('')
    .toUpperCase();
}

const FILTER_OPTIONS = [
  { value: 'today', label: 'Hoje' },
  { value: 'yesterday', label: 'Ontem' },
  { value: '7days', label: '7 dias' },
  { value: '30days', label: '30 dias' },
];

export default function WelcomeSection({
  user,
  currentFilter,
  onFilterChange,
  onRefresh,
  isRefreshing,
}: WelcomeSectionProps) {
  const [now, setNow] = React.useState(new Date());

  React.useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const firstName = user?.name?.split(' ')[0] ?? 'Usuário';
  const roleColor = getRoleColor(user?.role);
  const formattedDate = now.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <header className={styles.welcomeSection}>
      <div className={styles.left}>
        {/* Avatar */}
        <motion.div
          className={styles.avatar}
          style={{ background: `linear-gradient(135deg, ${roleColor}55, ${roleColor}aa)`, borderColor: `${roleColor}44` }}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 20 }}
        >
          <span className={styles.avatarInitials}>{getInitials(user?.name)}</span>
          <span className={styles.onlineDot} />
        </motion.div>

        {/* Greeting text */}
        <motion.div
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.45, delay: 0.1 }}
        >
          <div className={styles.greetingRow}>
            <h2 className={styles.greeting}>
              {getGreeting()}, <span className={styles.name}>{firstName}</span> 👋
            </h2>
            <span
              className={styles.roleBadge}
              style={{ background: `${roleColor}18`, color: roleColor, borderColor: `${roleColor}33` }}
            >
              {getRoleLabel(user?.role)}
            </span>
          </div>
          <p className={styles.subtitle}>{getRoleSubtitle(user?.role)}</p>
          <p className={styles.dateLabel}>{formattedDate}</p>
        </motion.div>
      </div>

      <motion.div
        className={styles.controls}
        initial={{ opacity: 0, x: 16 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.45, delay: 0.15 }}
      >
        {/* Date filter */}
        <div className={styles.datePicker}>
          <Calendar size={16} className={styles.calendarIcon} />
          <select
            className={styles.dateSelect}
            value={currentFilter}
            onChange={e => onFilterChange(e.target.value)}
            aria-label="Filtrar período"
          >
            {FILTER_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* Refresh button */}
        <button
          className={`${styles.refreshBtn} ${isRefreshing ? styles.refreshing : ''}`}
          onClick={onRefresh}
          disabled={isRefreshing}
          title="Atualizar dados agora"
          aria-label="Atualizar dados"
        >
          {isRefreshing
            ? <Loader2 size={16} className={styles.spin} />
            : <RefreshCw size={16} />
          }
          <span>{isRefreshing ? 'Sincronizando...' : 'Atualizar'}</span>
        </button>
      </motion.div>
    </header>
  );
}
