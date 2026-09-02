"use client";

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  TrendingUp,
  Users,
  DollarSign,
  Clock,
  MessageCircle,
  AlertCircle,
  UserCheck,
  Globe,
  Award,
  Activity,
  Sparkles,
  Zap as ZapIcon,
  Flame,
  Rocket,
  Star,
  Shield,
  Settings,
  Target,
} from 'lucide-react';

const PRESET_ICONS_MAP: Record<string, any> = {
  zap: ZapIcon,
  flame: Flame,
  rocket: Rocket,
  star: Star,
  shield: Shield,
  globe: Globe,
  award: Award,
  sparkles: Sparkles,
};

import styles from './page.module.css';
import { useLeads } from '@/context/LeadContext';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import type { PlatformBanner, PipelineStage } from '@/types';
import {
  canViewGoal,
  formatGoalValue,
  getGoalCurrentValue,
  getGoalProgress,
  getGoalProgressLabel,
  readGoals,
  type GoalPlan,
} from '@/lib/goals';

// ── Novos componentes modulares ──
import {
  WelcomeSection,
  BannerCarousel,
  PersonalKPIPanel,
  PersonalActivityFeed,
} from '@/components/home';

// ──────────────────────────────────────────────────────────────
// Funnel / Metrics: visíveis apenas para MANAGER e ADMIN
// ──────────────────────────────────────────────────────────────

function MetricsSection({
  realTma,
  realTme,
  realStatusCounts,
  realSources,
}: {
  realTma: number;
  realTme: number;
  realStatusCounts: { open: number; finished: number; transferred: number };
  realSources: { name: string; value: number; color: string }[];
}) {
  return (
    <section className={styles.metricsSection}>
      <div className={styles.sectionHeader}>
        <h3 className={styles.sectionTitle}>Métricas de Atendimento</h3>
      </div>
      <div className={styles.metricsGrid}>
        <div className={styles.metricCard}>
          <div className={styles.metricIcon} style={{ background: '#3b82f615', color: '#3b82f6' }}>
            <Clock size={20} />
          </div>
          <div className={styles.metricInfo}>
            <span className={styles.metricLabel}>TMA Médio</span>
            <div className={styles.metricValue}>{realTma}m</div>
            <p className={styles.metricSub}>Tempo de conversa médio</p>
          </div>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.metricIcon} style={{ background: '#ef444415', color: '#ef4444' }}>
            <AlertCircle size={20} />
          </div>
          <div className={styles.metricInfo}>
            <span className={styles.metricLabel}>TME Médio</span>
            <div className={styles.metricValue}>{realTme}m</div>
            <p className={styles.metricSub}>Tempo de espera médio</p>
          </div>
        </div>

        <div className={styles.chatsStatusCard}>
          <div className={styles.chatsStatusHeader}>
            <MessageCircle size={18} />
            <span>Status de Atendimentos</span>
          </div>
          <div className={styles.chatsStatusGrid}>
            <div className={styles.statusItem}>
              <span className={styles.statusLabel}>Abertos</span>
              <span className={styles.statusValue} style={{ color: '#f59e0b' }}>{realStatusCounts.open}</span>
            </div>
            <div className={styles.statusDivider} />
            <div className={styles.statusItem}>
              <span className={styles.statusLabel}>Finalizados</span>
              <span className={styles.statusValue} style={{ color: '#10b981' }}>{realStatusCounts.finished}</span>
            </div>
            <div className={styles.statusDivider} />
            <div className={styles.statusItem}>
              <span className={styles.statusLabel}>Transferidos</span>
              <span className={styles.statusValue} style={{ color: '#3b82f6' }}>{realStatusCounts.transferred}</span>
            </div>
          </div>
        </div>

        <div className={styles.sourcesCard}>
          <div className={styles.sourcesHeader}>
            <Globe size={18} />
            <span>Fontes de Origem (Real)</span>
          </div>
          <div className={styles.sourcesList}>
            {realSources.length > 0 ? realSources.map((source, idx) => (
              <div key={idx} className={styles.sourceRow}>
                <div className={styles.sourceInfo}>
                  <div className={styles.sourceColor} style={{ background: source.color }} />
                  <span>{source.name}</span>
                </div>
                <span className={styles.sourcePercent}>{source.value}%</span>
              </div>
            )) : (
              <div className={styles.noData}>Aguardando dados...</div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function FunnelAndUpdates({
  funnel,
  recentUpdates,
  currentFilter,
  leads,
}: {
  funnel: any[];
  recentUpdates: any[];
  currentFilter: string;
  leads: any[];
}) {
  return (
    <div className={styles.mainGrid}>
      {/* Funil de Conversão */}
      <section className={styles.chartContainer}>
        <div className={styles.sectionHeader}>
          <h3 className={styles.sectionTitle}>Conversão do Funil</h3>
          <div className={styles.periodBadge}>
            {currentFilter === 'today' ? 'Hoje' :
             currentFilter === 'yesterday' ? 'Ontem' :
             currentFilter === '7days' ? '7 Dias' : '30 Dias'}
          </div>
        </div>

        <div className={styles.funnelWrapper}>
          {funnel.map((step, idx) => {
            const conversion = idx > 0
              ? ((step.value / funnel[idx - 1].value) * 100).toFixed(1)
              : null;
            const width = 100 - idx * 15;
            return (
              <div key={idx} className={styles.funnelStep}>
                {conversion && (
                  <div className={styles.conversionInfo}>
                    <div className={styles.conversionLine} />
                    <span className={styles.conversionValue}>{conversion}%</span>
                  </div>
                )}
                <div className={styles.stepVisual}>
                  <div
                    className={styles.stepBar}
                    style={{
                      width: `${width}%`,
                      background: `linear-gradient(90deg, ${step.color}30, ${step.color})`,
                      boxShadow: `0 0 20px ${step.color}20`,
                    }}
                  >
                    <div className={styles.stepInfoLeft}>
                      <div className={styles.stepIcon} style={{ background: step.color }}>
                        <step.icon size={14} color="white" />
                      </div>
                      <span className={styles.stepLabel}>{step.label}</span>
                    </div>
                    <div className={styles.stepValue}>{step.value}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className={styles.funnelSummary}>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Conversão Total</span>
            <span className={styles.summaryValue}>
              {(leads.filter(l => l.pipelineStage === 'ganho').length / (leads.length || 1) * 100).toFixed(1)}%
            </span>
          </div>
          <div className={styles.summaryDivider} />
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Ticket Médio</span>
            <span className={styles.summaryValue}>
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                leads.filter(l => l.pipelineStage === 'ganho').reduce((acc: number, l: any) => {
                  const raw = String(l.value || '0');
                  return acc + (parseFloat(raw.replace(/[^0-9,-]+/g, '').replace(',', '.') || '0') || 0);
                }, 0) / (leads.filter(l => l.pipelineStage === 'ganho').length || 1)
              )}
            </span>
          </div>
        </div>
      </section>

      {/* Atualizações Recentes */}
      <section className={styles.chartContainer}>
        <h3 className={styles.sectionTitle}>Atualizações Recentes</h3>
        <div className={styles.activityList}>
          {recentUpdates.map((act, index) => (
            <div key={index} className={styles.activityItem}>
              <div className={styles.activityIcon}>
                {act.icon_name && PRESET_ICONS_MAP[act.icon_name]
                  ? React.createElement(PRESET_ICONS_MAP[act.icon_name], { size: 16 })
                  : <TrendingUp size={16} />
                }
              </div>
              <div>
                <p>
                  <strong>{act.user_name}</strong> {act.action} {act.target || ''}
                </p>
                <span className={styles.activityTime}>
                  {new Date(act.created_at || Date.now()).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  {' • '}
                  {new Date(act.created_at || Date.now()).toLocaleDateString('pt-BR')}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function TeamPerformanceSection({ teamStats }: { teamStats: any[] }) {
  return (
    <section className={styles.performanceSection}>
      <h3 className={styles.sectionTitle}>Performance da Equipe</h3>
      <div className={styles.tableWrapper}>
        <table className={styles.performanceTable}>
          <thead>
            <tr>
              <th>Usuário</th>
              <th>Status</th>
              <th>Atendimentos</th>
              <th>TMA</th>
              <th>Vendas</th>
              <th>Tempo Ativo</th>
            </tr>
          </thead>
          <tbody>
            {teamStats.map((u, index) => (
              <tr key={index}>
                <td>
                  <div className={styles.userNameColumn}>
                    <div className={styles.userAvatar}>
                      {u.name?.split(' ').map((n: string) => n[0]).join('') ?? 'U'}
                    </div>
                    {u.name}
                  </div>
                </td>
                <td>
                  <span className={`${styles.statusBadge} ${(u.status === 'online' || u.status === 'ACTIVE') ? styles.statusOnline : styles.statusOffline}`}>
                    {(u.status === 'online' || u.status === 'ACTIVE') ? 'Online' : 'Offline'}
                  </span>
                </td>
                <td>{u.activeChats ?? 0} atendimentos</td>
                <td>{u.tma || 'N/A'}</td>
                <td><span className={styles.salesCount}>{u.sales ?? 0}</span></td>
                <td>{u.uptime ?? 'N/A'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function GoalsProgressSection({
  leads,
  pipelineStages,
  user,
}: {
  leads: any[];
  pipelineStages: PipelineStage[];
  user: any;
}) {
  const [goals, setGoals] = React.useState<GoalPlan[]>([]);

  React.useEffect(() => {
    const refreshGoals = () => setGoals(readGoals());
    refreshGoals();
    window.addEventListener('storage', refreshGoals);
    window.addEventListener('vortice-goals-updated', refreshGoals);
    return () => {
      window.removeEventListener('storage', refreshGoals);
      window.removeEventListener('vortice-goals-updated', refreshGoals);
    };
  }, []);

  const visibleGoals = goals
    .filter(goal => canViewGoal(goal, user?.id, user?.role === 'ADMIN'))
    .sort((a, b) => getGoalProgress(b, leads) - getGoalProgress(a, leads))
    .slice(0, 4);

  const getProgressClass = (progress: number) => progress >= 100
    ? styles.goalProgressComplete
    : progress >= 75
      ? styles.goalProgressNear
      : progress >= 40
        ? styles.goalProgressOnTrack
        : styles.goalProgressAttention;

  return (
    <section className={styles.goalsSection} aria-labelledby="goals-progress-title">
      <div className={styles.sectionHeader}>
        <div className={styles.goalsSectionTitle}><div className={styles.goalsSectionIcon}><Target size={18} /></div><div><h3 id="goals-progress-title" className={styles.sectionTitle}>Acompanhamento de metas</h3><p>O progresso é calculado com os dados atuais do funil.</p></div></div>
        <Link href="/metas" className={styles.goalsManageLink}>Gerenciar metas <ChevronRightIcon /></Link>
      </div>

      {visibleGoals.length === 0 ? (
        <div className={styles.goalsEmpty}><Target size={19} /><span>Nenhuma meta visível para você ainda.</span><Link href="/metas">Criar planejamento</Link></div>
      ) : (
        <div className={styles.goalsDashboardGrid}>
          {visibleGoals.map(goal => {
            const progress = getGoalProgress(goal, leads);
            const currentValue = getGoalCurrentValue(goal, leads);
            const stageNames = goal.stageIds.map(stageId => pipelineStages.find(stage => stage.id === stageId)?.name).filter(Boolean);
            return (
              <Link href="/metas" className={styles.goalDashboardCard} key={goal.id}>
                <div className={styles.goalDashboardHeader}><span>{goal.title}</span><strong className={getProgressClass(progress)}>{progress}%</strong></div>
                <div className={styles.goalDashboardTrack}><span className={getProgressClass(progress)} style={{ width: `${progress}%` }} /></div>
                <div className={styles.goalDashboardMeta}><span>{formatGoalValue(currentValue, goal.metric)} / {formatGoalValue(goal.targetValue, goal.metric)}</span><span>{getGoalProgressLabel(progress)}</span></div>
                <div className={styles.goalDashboardRelation}><Target size={12} /> {stageNames.length ? stageNames.slice(0, 2).join(' · ') : 'Funil completo'}</div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}

function ChevronRightIcon() {
  return <span aria-hidden="true">→</span>;
}

// ──────────────────────────────────────────────────────────────
// ORCHESTRATOR PRINCIPAL
// ──────────────────────────────────────────────────────────────

export default function HomePage() {
  const { leads, pipelineStages, dbStatus, refreshDatabase } = useLeads();
  const { user } = useAuth();

  const [mounted, setMounted] = React.useState(false);
  const [currentFilter, setCurrentFilter] = React.useState('today');
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  // Dados para MANAGER / ADMIN
  const [banners, setBanners] = React.useState<PlatformBanner[]>([]);
  const [teamStats, setTeamStats] = React.useState<any[]>([]);
  const [recentUpdates, setRecentUpdates] = React.useState<any[]>([]);
  const [funnel, setFunnel] = React.useState<any[]>([]);
  const [realTma, setRealTma] = React.useState(0);
  const [realTme, setRealTme] = React.useState(0);
  const [realSources, setRealSources] = React.useState<any[]>([]);
  const [realStatusCounts, setRealStatusCounts] = React.useState({ open: 0, finished: 0, transferred: 0 });

  React.useEffect(() => { setMounted(true); }, []);

  // ── Fetch banners, equipe e atualizações ──
  React.useEffect(() => {
    const fetchBanners = async () => {
      if (supabase) {
        const { data } = await supabase.from('platform_banners').select('*');
        if (data && data.length > 0) { setBanners(data); return; }
      }
      try {
        const saved = localStorage.getItem('vortice_banners');
        if (saved) setBanners(JSON.parse(saved));
      } catch {}
    };

    const fetchTeam = async () => {
      if (supabase) {
        const { data } = await supabase.from('profiles').select('*');
        if (data) setTeamStats(data);
      }
    };

    const fetchUpdates = async () => {
      if (supabase) {
        const { data } = await supabase
          .from('system_updates')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(6);
        if (data && data.length > 0) setRecentUpdates(data);
        else setRecentUpdates([{
          user_name: 'Sistema',
          action: 'Monitorando novas atualizações...',
          created_at: new Date().toISOString(),
        }]);
      }
    };

    fetchBanners();
    fetchTeam();
    fetchUpdates();
  }, [dbStatus]);

  // ── Computar métricas dos leads ──
  React.useEffect(() => {
    const avgTma = leads.reduce((a, l) => a + (l.handlingTime || 0), 0) / (leads.length || 1);
    const avgTme = leads.reduce((a, l) => a + (l.waitTime || 0), 0) / (leads.length || 1);

    const stageCounts: Record<string, number> = {};
    leads.forEach(l => { stageCounts[l.pipelineStage] = (stageCounts[l.pipelineStage] || 0) + 1; });

    const wonLeads = leads.filter(l => l.pipelineStage === 'ganho');

    const sourceCounts: Record<string, number> = {};
    leads.forEach(l => {
      const s = l.source || 'Tráfego Direto';
      sourceCounts[s] = (sourceCounts[s] || 0) + 1;
    });
    const sources = Object.entries(sourceCounts).map(([name, count]) => ({
      name,
      value: Math.round((count / (leads.length || 1)) * 100),
      color: name === 'Google Ads' ? '#3b82f6' : name === 'Site' ? '#10b981' : '#f59e0b',
    })).sort((a, b) => b.value - a.value);

    setRealTma(Math.floor(avgTma));
    setRealTme(Math.floor(avgTme));
    setRealSources(sources);
    setRealStatusCounts({
      open: leads.length - wonLeads.length,
      finished: wonLeads.length,
      transferred: 0,
    });

    setFunnel([
      { label: 'Leads', value: leads.length, icon: Users, color: '#3b82f6' },
      { label: 'Qualificados', value: (stageCounts['contato'] || 0) + (stageCounts['proposta'] || 0) + (stageCounts['negociacao'] || 0) + (stageCounts['ganho'] || 0), icon: UserCheck, color: '#8b5cf6' },
      { label: 'Proposta', value: (stageCounts['proposta'] || 0) + (stageCounts['negociacao'] || 0) + (stageCounts['ganho'] || 0), icon: MessageCircle, color: '#f59e0b' },
      { label: 'Fechados', value: stageCounts['ganho'] || 0, icon: DollarSign, color: '#10b981' },
    ]);
  }, [leads]);

  // ── Auto-refresh 30s ──
  const handleRefresh = React.useCallback(async () => {
    setIsRefreshing(true);
    await refreshDatabase();
    setTimeout(() => setIsRefreshing(false), 500);
  }, [refreshDatabase]);

  React.useEffect(() => {
    const interval = setInterval(handleRefresh, 30_000);
    return () => clearInterval(interval);
  }, [handleRefresh]);

  // ── Guards ──
  if (!mounted) return null;

  const canSeeTeamData = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const isSeller = user?.role === 'SELLER';

  return (

  <div className={styles.dashboard}>

    {/* 1. Seção de Boas-Vindas — Universal */}
    <WelcomeSection
      user={user}
      currentFilter={currentFilter}
      onFilterChange={setCurrentFilter}
      onRefresh={handleRefresh}
      isRefreshing={isRefreshing}
    />

    {/* 2. Banners — Universal, filtrado por role */}
    <BannerCarousel banners={banners} user={user} />

    {/* 3. KPI Panel — Universal, dados distintos por role */}
    <PersonalKPIPanel
      user={user}
      leads={leads}
      teamStats={teamStats}
    />

    <GoalsProgressSection
      user={user}
      leads={leads}
      pipelineStages={pipelineStages}
    />

    {/* 4a. Visão estendida — MANAGER e ADMIN */}
    {canSeeTeamData && (
      <>
        <MetricsSection
          realTma={realTma}
          realTme={realTme}
          realStatusCounts={realStatusCounts}
          realSources={realSources}
        />

        <FunnelAndUpdates
          funnel={funnel}
          recentUpdates={recentUpdates}
          currentFilter={currentFilter}
          leads={leads}
        />

        <TeamPerformanceSection teamStats={teamStats} />
      </>
    )}

    {/* 4b. Feed pessoal — SELLER */}
    {isSeller && user && (
      <PersonalActivityFeed
        userId={user.id}
        userName={user.name}
      />
    )}

  </div>
);
}
