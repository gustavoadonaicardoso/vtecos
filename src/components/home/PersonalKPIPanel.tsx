"use client";

import React from 'react';
import { motion } from 'framer-motion';
import {
  DollarSign,
  Users,
  Award,
  Activity,
  MessageCircle,
  Clock,
  UserCheck,
  TrendingUp,
} from 'lucide-react';
import type { UserProfile, Lead } from '@/types';
import styles from './PersonalKPIPanel.module.css';

interface KPIData {
  label: string;
  value: string;
  trend: string;
  trendPositive: boolean;
  icon: React.ComponentType<{ size?: number }>;
  color: string;
  description: string;
}

interface PersonalKPIPanelProps {
  user: UserProfile | null;
  leads: Lead[];
  teamStats: any[];
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

function parseLeadValue(raw?: string): number {
  if (!raw) return 0;
  return parseFloat(String(raw).replace(/[^0-9,-]+/g, '').replace(',', '.') || '0') || 0;
}

// ──────────────────────────────────────────────────────────────
// KPI builders por role
// ──────────────────────────────────────────────────────────────

function buildSellerKPIs(user: UserProfile, leads: Lead[]): KPIData[] {
  // Filtra leads do próprio vendedor
  const myLeads = leads.filter(
    l => (l as any).assigned_to === user.id || (l as any).seller_id === user.id
  );
  // Fallback: se nenhum lead tem assigned_to, mostra todos (para não quebrar em ambientes sem campo)
  const targetLeads = myLeads.length > 0 ? myLeads : leads;

  const wonLeads = targetLeads.filter(l => l.pipelineStage === 'ganho');
  const conversionRate = targetLeads.length > 0
    ? (wonLeads.length / targetLeads.length) * 100
    : 0;
  const avgTma = targetLeads.reduce((a, l) => a + (l.handlingTime || 0), 0) / (targetLeads.length || 1);

  // Atendimentos hoje (por data de entrada)
  const today = new Date().toLocaleDateString('pt-BR');
  const todayLeads = targetLeads.filter(l => {
    const d = new Date(l.entryDate || '').toLocaleDateString('pt-BR');
    return d === today;
  });

  return [
    {
      label: 'Meus Leads Ativos',
      value: targetLeads.length.toString(),
      trend: `${wonLeads.length} ganhos`,
      trendPositive: wonLeads.length > 0,
      icon: Users,
      color: '#8b5cf6',
      description: 'Total de leads na sua carteira',
    },
    {
      label: 'Atendimentos Hoje',
      value: todayLeads.length.toString(),
      trend: today,
      trendPositive: todayLeads.length > 0,
      icon: MessageCircle,
      color: '#3b82f6',
      description: 'Leads registrados hoje',
    },
    {
      label: 'Meu TMA',
      value: `${Math.floor(avgTma)}m`,
      trend: 'Tempo médio',
      trendPositive: avgTma < 15,
      icon: Clock,
      color: '#f59e0b',
      description: 'Tempo médio de atendimento',
    },
    {
      label: 'Minha Conversão',
      value: `${conversionRate.toFixed(1)}%`,
      trend: `${wonLeads.length} fechados`,
      trendPositive: conversionRate > 10,
      icon: TrendingUp,
      color: '#10b981',
      description: 'Taxa de conversão pessoal',
    },
  ];
}

function buildManagerKPIs(leads: Lead[], teamStats: any[]): KPIData[] {
  const wonLeads = leads.filter(l => l.pipelineStage === 'ganho');
  const totalRevenue = wonLeads.reduce((a, l) => a + parseLeadValue(l.value), 0);
  const onlineCount = teamStats.filter(u => u.status === 'ACTIVE' || u.status === 'online').length;
  const avgTma = leads.reduce((a, l) => a + (l.handlingTime || 0), 0) / (leads.length || 1);

  return [
    {
      label: 'Leads da Equipe',
      value: leads.length.toString(),
      trend: `${wonLeads.length} ganhos`,
      trendPositive: wonLeads.length > 0,
      icon: Users,
      color: '#8b5cf6',
      description: 'Total de leads do time',
    },
    {
      label: 'Usuários Online',
      value: `${onlineCount} / ${teamStats.length}`,
      trend: `${teamStats.length > 0 ? ((onlineCount / teamStats.length) * 100).toFixed(0) : 0}% ativos`,
      trendPositive: onlineCount > 0,
      icon: UserCheck,
      color: '#10b981',
      description: 'Membros ativos agora',
    },
    {
      label: 'TMA da Equipe',
      value: `${Math.floor(avgTma)}m`,
      trend: 'Média geral',
      trendPositive: avgTma < 15,
      icon: Clock,
      color: '#f59e0b',
      description: 'Tempo médio de atendimento',
    },
    {
      label: 'Receita do Período',
      value: formatCurrency(totalRevenue),
      trend: `${wonLeads.length} contratos`,
      trendPositive: totalRevenue > 0,
      icon: DollarSign,
      color: '#3b82f6',
      description: 'Receita acumulada do time',
    },
  ];
}

function buildAdminKPIs(leads: Lead[], teamStats: any[]): KPIData[] {
  const wonLeads = leads.filter(l => l.pipelineStage === 'ganho');
  const totalRevenue = wonLeads.reduce((a, l) => a + parseLeadValue(l.value), 0);
  const ticketMedio = wonLeads.length > 0 ? totalRevenue / wonLeads.length : 0;
  const conversionRate = leads.length > 0 ? (wonLeads.length / leads.length) * 100 : 0;

  return [
    {
      label: 'Receita Total',
      value: formatCurrency(totalRevenue),
      trend: '+Base Real',
      trendPositive: true,
      icon: DollarSign,
      color: '#3b82f6',
      description: 'Receita acumulada de contratos fechados',
    },
    {
      label: 'Leads Totais',
      value: leads.length.toString(),
      trend: 'Ativos no sistema',
      trendPositive: true,
      icon: Users,
      color: '#8b5cf6',
      description: 'Total de leads na plataforma',
    },
    {
      label: 'Ticket Médio',
      value: formatCurrency(ticketMedio),
      trend: `${wonLeads.length} contratos`,
      trendPositive: ticketMedio > 0,
      icon: Award,
      color: '#10b981',
      description: 'Valor médio por contrato fechado',
    },
    {
      label: 'Conversão Global',
      value: `${conversionRate.toFixed(1)}%`,
      trend: 'Ganhos / Total',
      trendPositive: conversionRate > 5,
      icon: Activity,
      color: '#f59e0b',
      description: 'Taxa de conversão geral da plataforma',
    },
  ];
}

// ──────────────────────────────────────────────────────────────

function KPICard({ kpi, index }: { kpi: KPIData; index: number }) {
  return (
    <motion.div
      className={styles.card}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08 }}
      title={kpi.description}
    >
      <div className={styles.cardHeader}>
        <div
          className={styles.iconWrapper}
          style={{ color: kpi.color, background: `${kpi.color}18` }}
        >
          <kpi.icon size={20} />
        </div>
        <span
          className={`${styles.trend} ${kpi.trendPositive ? styles.trendPositive : styles.trendNeutral}`}
        >
          {kpi.trend}
        </span>
      </div>
      <div className={styles.value}>{kpi.value}</div>
      <div className={styles.label}>{kpi.label}</div>
    </motion.div>
  );
}

export default function PersonalKPIPanel({ user, leads, teamStats }: PersonalKPIPanelProps) {
  const kpis = React.useMemo(() => {
    if (!user) return [];
    switch (user.role) {
      case 'SELLER':  return buildSellerKPIs(user, leads);
      case 'MANAGER': return buildManagerKPIs(leads, teamStats);
      case 'ADMIN':   return buildAdminKPIs(leads, teamStats);
      default:        return buildAdminKPIs(leads, teamStats);
    }
  }, [user, leads, teamStats]);

  const panelLabel = {
    SELLER: 'Seus Indicadores',
    MANAGER: 'Indicadores da Equipe',
    ADMIN: 'Indicadores Globais',
  }[user?.role ?? 'ADMIN'] ?? 'Indicadores';

  return (
    <section className={styles.section} aria-label={panelLabel}>
      <div className={styles.sectionHeader}>
        <h3 className={styles.sectionTitle}>{panelLabel}</h3>
        <span className={styles.rolePill}>
          {user?.role === 'SELLER' ? 'Visão Individual' :
           user?.role === 'MANAGER' ? 'Visão da Equipe' : 'Visão Global'}
        </span>
      </div>
      <div className={styles.grid}>
        {kpis.map((kpi, idx) => (
          <KPICard key={kpi.label} kpi={kpi} index={idx} />
        ))}
      </div>
    </section>
  );
}
