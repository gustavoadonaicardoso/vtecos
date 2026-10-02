"use client";

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Briefcase,
  Calendar,
  CircleDollarSign,
  Kanban,
  Megaphone,
  MessageCircle,
  Percent,
  Phone,
  RefreshCw,
  Share2,
  Target,
  Ticket,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
  Workflow,
} from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import styles from './page.module.css';
import { useLeads } from '@/context/LeadContext';
import { useAuth } from '@/context/AuthContext';
import { usePresence } from '@/context/PresenceContext';
import { usePermissions } from '@/lib/permissions';
import { useUnreadCount } from '@/hooks/useUnreadCount';
import { supabase } from '@/lib/supabase';
import { BannerCarousel, PersonalActivityFeed } from '@/components/home';
import { buildReport, isWon, leadValue } from './relatorios/report-data';
import { canViewGoal, getGoalPace, getGoalProgress, type GoalPlan } from '@/lib/goals';
import { fetchGoalsFromServer, migrateLocalGoalsIfAny } from '@/lib/goals-client';
import type { DashboardSummary } from '@/services/dashboard.service';
import type { PlatformBanner } from '@/types';

const PERIODS = [
  { value: 1, label: 'Hoje' },
  { value: 7, label: '7 dias' },
  { value: 30, label: '30 dias' },
];

const currency = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: value >= 10_000 ? 1 : 0,
    notation: value >= 10_000 ? 'compact' : 'standard',
  }).format(value);

const number = (value: number) => new Intl.NumberFormat('pt-BR').format(Math.round(value));

const minutes = (value: number) => (value ? (value < 60 ? `${Math.round(value)} min` : `${Math.floor(value / 60)}h${String(Math.round(value % 60)).padStart(2, '0')}`) : '—');

function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return null;
  const max = Math.max(1, ...values);
  const width = 120;
  const height = 36;
  const step = width / (values.length - 1);
  const points = values.map((value, index) => `${(index * step).toFixed(1)},${(height - (value / max) * (height - 4) - 2).toFixed(1)}`);
  const id = `dash-spark-${color.replace('#', '')}`;
  return (
    <svg className={styles.sparkline} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon points={`0,${height} ${points.join(' ')} ${width},${height}`} fill={`url(#${id})`} />
      <polyline points={points.join(' ')} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Delta({ value, suffix = '%' }: { value: number | null; suffix?: string }) {
  if (value === null || !Number.isFinite(value)) return <span className={`${styles.delta} ${styles.deltaNeutral}`}>—</span>;
  const Icon = value >= 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`${styles.delta} ${value >= 0 ? styles.deltaUp : styles.deltaDown}`}>
      <Icon size={13} /> {Math.abs(value).toFixed(suffix === ' p.p.' ? 1 : 0)}{suffix}
    </span>
  );
}

function MiniRing({ value, color }: { value: number; color: string }) {
  const size = 46;
  const stroke = 5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <svg width={size} height={size} className={styles.miniRing} aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--track)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - Math.min(100, value) / 100)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

interface ModuleTile {
  key: string;
  title: string;
  href: string;
  icon: React.ComponentType<{ size?: number }>;
  color: string;
  value: string;
  caption: string;
  stats: Array<{ label: string; value: string; tone?: 'warn' | 'good' | 'bad' }>;
  visual?: React.ReactNode;
}

export default function HomePage() {
  const { leads, pipelineStages, dbStatus, refreshDatabase } = useLeads();
  const { user } = useAuth();
  const { hasPermission } = usePermissions();
  const presence = usePresence();
  const unreadChat = useUnreadCount();

  const [mounted, setMounted] = useState(false);
  const [period, setPeriod] = useState(7);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [goals, setGoals] = useState<GoalPlan[]>([]);
  const [banners, setBanners] = useState<PlatformBanner[]>([]);
  const [updates, setUpdates] = useState<Array<{ user_name: string; action: string; target?: string; created_at: string }>>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const canManage = user?.role === 'ADMIN' || user?.role === 'MANAGER';

  useEffect(() => { setMounted(true); }, []);

  const loadSummary = useCallback(async () => {
    try {
      const response = await fetch('/api/dashboard/summary', { cache: 'no-store' });
      const result = await response.json().catch(() => ({}));
      if (response.ok) setSummary(result.data);
    } catch {
      // Dashboard segue com o que já tem.
    }
    setUpdatedAt(new Date());
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    loadSummary();
    let cancelled = false;
    migrateLocalGoalsIfAny(user.id)
      .then(() => fetchGoalsFromServer(user.id))
      .then((data) => { if (!cancelled) setGoals(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [user?.id, loadSummary]);

  useEffect(() => {
    if (!supabase) return;
    supabase.from('platform_banners').select('*').then(({ data }) => {
      if (data && data.length > 0) setBanners(data);
      else {
        try {
          const saved = localStorage.getItem('vortice_banners');
          if (saved) setBanners(JSON.parse(saved));
        } catch {}
      }
    });
    supabase
      .from('system_updates')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(6)
      .then(({ data }) => setUpdates(data || []));
  }, [dbStatus]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refreshDatabase(), loadSummary()]);
    setRefreshing(false);
  }, [loadSummary, refreshDatabase]);

  // Atualiza sozinho a cada 60s (leads + módulos).
  useEffect(() => {
    const timer = setInterval(refresh, 60_000);
    return () => clearInterval(timer);
  }, [refresh]);

  const report = useMemo(() => buildReport(leads, pipelineStages, period), [leads, pipelineStages, period]);
  const trend = useMemo(() => buildReport(leads, pipelineStages, 14), [leads, pipelineStages]);
  const chart = useMemo(() => buildReport(leads, pipelineStages, Math.max(period, 14)), [leads, pipelineStages, period]);

  const openLeads = leads.filter((lead) => !isWon(lead));
  const pipelineValue = openLeads.reduce((sum, lead) => sum + leadValue(lead), 0);

  const goalViews = useMemo(
    () =>
      goals
        .filter((goal) => canViewGoal(goal, user?.id, user?.role === 'ADMIN'))
        .map((goal) => {
          const progress = getGoalProgress(goal, leads);
          return { goal, progress, pace: getGoalPace(goal, progress) };
        }),
    [goals, leads, user?.id, user?.role]
  );

  const teamMembers = summary?.team || [];
  const teamSorted = [...teamMembers].sort((a, b) => {
    const onlineA = presence.isOnline(a.id, a.last_seen_at) ? 1 : 0;
    const onlineB = presence.isOnline(b.id, b.last_seen_at) ? 1 : 0;
    if (onlineA !== onlineB) return onlineB - onlineA;
    return (presence.lastSeen(b.id, b.last_seen_at) || '').localeCompare(presence.lastSeen(a.id, a.last_seen_at) || '');
  });
  const onlineCount = teamMembers.filter((member) => presence.isOnline(member.id, member.last_seen_at)).length;
  const nameById = (id: string | null) => (id ? teamMembers.find((member) => member.id === id)?.name || 'Usuário' : 'Sem responsável');

  if (!mounted) return null;

  const periodLabel = period === 1 ? 'hoje' : `nos últimos ${period} dias`;
  const compareLabel = period === 1 ? 'vs. ontem' : `vs. ${period} dias anteriores`;

  const kpis = [
    { label: 'Novos leads', value: number(report.current.total), icon: UserPlus, color: '#3b82f6', delta: <Delta value={report.deltas.total} />, series: trend.daily.map((point) => point.novos) },
    { label: 'Taxa de conversão', value: `${report.current.conversion.toFixed(1)}%`, icon: Percent, color: '#8b5cf6', delta: <Delta value={report.deltas.conversion} suffix=" p.p." />, series: trend.daily.map((point) => point.ganhos) },
    { label: 'Receita ganha', value: currency(report.current.revenue), icon: CircleDollarSign, color: '#10b981', delta: <Delta value={report.deltas.revenue} />, series: trend.daily.map((point) => point.receita) },
    { label: 'Pipeline em aberto', value: currency(pipelineValue), icon: Wallet, color: '#f59e0b', delta: <span className={`${styles.delta} ${styles.deltaNeutral}`}>{number(openLeads.length)} leads</span>, series: [] as number[] },
  ];

  // ── Pulso dos módulos ──
  const stageCounts = pipelineStages.map((stage) => ({ ...stage, count: leads.filter((lead) => lead.pipelineStage === stage.id).length }));
  const avgGoal = goalViews.length ? Math.round(goalViews.reduce((sum, view) => sum + view.progress, 0) / goalViews.length) : 0;

  const tiles: ModuleTile[] = [];
  if (hasPermission('pipeline.view')) {
    tiles.push({
      key: 'pipeline', title: 'Pipeline', href: '/pipeline', icon: Kanban, color: '#3b82f6',
      value: number(openLeads.length), caption: 'leads em aberto',
      stats: [{ label: 'Ganhos (total)', value: number(leads.length - openLeads.length), tone: 'good' }, { label: 'Etapas', value: String(pipelineStages.length) }],
      visual: (
        <div className={styles.stageBar}>
          {stageCounts.filter((stage) => stage.count > 0).map((stage) => (
            <span key={stage.id} style={{ flex: stage.count, background: stage.color }} title={`${stage.name}: ${stage.count}`} />
          ))}
          {leads.length === 0 && <span style={{ flex: 1, background: 'var(--track)' }} />}
        </div>
      ),
    });
  }
  if (hasPermission('dashboard.view')) {
    tiles.push({
      key: 'metas', title: 'Metas', href: '/metas', icon: Target, color: '#8b5cf6',
      value: `${avgGoal}%`, caption: `progresso médio de ${goalViews.length} ${goalViews.length === 1 ? 'meta' : 'metas'}`,
      stats: [
        { label: 'No ritmo', value: String(goalViews.filter((v) => v.pace.status === 'on_track' || v.pace.status === 'done').length), tone: 'good' },
        { label: 'Em risco', value: String(goalViews.filter((v) => v.pace.status === 'at_risk').length), tone: 'warn' },
        { label: 'Atrasadas', value: String(goalViews.filter((v) => v.pace.status === 'behind' || v.pace.status === 'overdue').length), tone: 'bad' },
      ],
      visual: <MiniRing value={avgGoal} color="#8b5cf6" />,
    });
  }
  if (summary?.social) {
    const social = summary.social;
    tiles.push({
      key: 'social', title: 'Redes Sociais', href: social.pendingApproval > 0 && canManage ? '/social?tab=posts&status=pending_approval' : '/social', icon: Share2, color: '#ec4899',
      value: number(social.scheduledNext7), caption: 'posts agendados (7 dias)',
      stats: [
        { label: 'Aguardando aprovação', value: String(social.pendingApproval), tone: social.pendingApproval ? 'warn' : undefined },
        { label: 'Publicados (30d)', value: String(social.publishedLast30), tone: 'good' },
        { label: 'Com falha', value: String(social.failed), tone: social.failed ? 'bad' : undefined },
      ],
    });
  }
  if (summary?.agenda) {
    const agenda = summary.agenda;
    tiles.push({
      key: 'agenda', title: 'Agendamento', href: '/scheduling', icon: Calendar, color: '#06b6d4',
      value: number(agenda.tasksToday), caption: 'compromissos hoje',
      stats: [
        { label: 'Tarefas em aberto', value: String(agenda.openTasks), tone: agenda.openTasks ? 'warn' : undefined },
        { label: 'Mensagens hoje', value: String(agenda.messagesToday) },
        { label: 'Mensagens pendentes', value: String(agenda.messagesPending) },
      ],
    });
  }
  if (summary?.queue) {
    const queue = summary.queue;
    tiles.push({
      key: 'queue', title: 'Senhas', href: '/queue', icon: Ticket, color: '#f59e0b',
      value: number(queue.waiting), caption: 'aguardando agora',
      stats: [
        { label: 'Em chamada', value: String(queue.calling) },
        { label: 'Atendidas hoje', value: String(queue.completedToday), tone: 'good' },
      ],
    });
  }
  if (summary?.blasts) {
    const blasts = summary.blasts;
    const total = blasts.sentLast30 + blasts.failedLast30;
    tiles.push({
      key: 'blasts', title: 'Disparos', href: '/disparos', icon: Megaphone, color: '#f97316',
      value: number(blasts.sentLast30), caption: 'mensagens enviadas (30d)',
      stats: [
        { label: 'Enviando agora', value: String(blasts.sending), tone: blasts.sending ? 'warn' : undefined },
        { label: 'Campanhas', value: String(blasts.campaigns) },
        { label: 'Taxa de falha', value: total ? `${((blasts.failedLast30 / total) * 100).toFixed(0)}%` : '—', tone: total && blasts.failedLast30 / total > 0.1 ? 'bad' : undefined },
      ],
    });
  }
  if (summary?.calls) {
    const calls = summary.calls;
    tiles.push({
      key: 'calls', title: 'Discador', href: '/discador', icon: Phone, color: '#14b8a6',
      value: number(calls.today), caption: 'ligações hoje',
      stats: [
        { label: 'Últimos 7 dias', value: String(calls.last7) },
        { label: 'Duração média', value: calls.avgDurationSec ? `${Math.floor(calls.avgDurationSec / 60)}m${String(calls.avgDurationSec % 60).padStart(2, '0')}s` : '—' },
      ],
    });
  }
  if (summary?.projects) {
    const projects = summary.projects;
    tiles.push({
      key: 'projects', title: 'Projetos', href: '/projetos', icon: Briefcase, color: '#6366f1',
      value: number(projects.total), caption: 'projetos cadastrados',
      stats: projects.byStatus.slice(0, 3).map((item) => ({ label: item.status, value: String(item.count) })),
    });
  }
  if (summary?.planning) {
    tiles.push({
      key: 'planning', title: 'Planejamentos', href: '/planejamentos', icon: Workflow, color: '#0ea5e9',
      value: number(summary.planning.boards), caption: 'funis desenhados',
      stats: [{ label: 'Editados (7d)', value: String(summary.planning.updatedLast7) }],
    });
  }
  if (hasPermission('messages.send')) {
    tiles.push({
      key: 'chat', title: 'Chat Interno', href: '/chat', icon: MessageCircle, color: '#22c55e',
      value: number(unreadChat), caption: unreadChat === 1 ? 'mensagem não lida' : 'mensagens não lidas',
      stats: [{ label: 'Equipe online', value: `${onlineCount}/${teamMembers.length || '—'}`, tone: 'good' }],
    });
  }
  if (summary?.notifications) {
    tiles.push({
      key: 'notifications', title: 'Notificações', href: '/notificacoes', icon: Bell, color: '#64748b',
      value: number(summary.notifications.unread), caption: 'não lidas',
      stats: [],
    });
  }

  const maxStage = Math.max(1, ...report.funnel.map((step) => step.reached));

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>{greeting()}, {user?.name?.split(' ')[0] || 'bem-vindo'}</h1>
          <p className={styles.subtitle}>
            {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
            {' · '}
            <span className={styles.liveDot} /> {presence.realtime ? 'ao vivo' : 'atualização automática'}
            {updatedAt && ` · atualizado às ${updatedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`}
          </p>
        </div>
        <div className={styles.headerActions}>
          <div className={styles.segmented} role="group" aria-label="Período">
            {PERIODS.map((item) => (
              <button key={item.value} type="button" className={period === item.value ? styles.segmentActive : ''} onClick={() => setPeriod(item.value)}>
                {item.label}
              </button>
            ))}
          </div>
          <button type="button" className={styles.iconButton} onClick={refresh} disabled={refreshing} title="Atualizar agora" aria-label="Atualizar agora">
            <RefreshCw size={16} className={refreshing ? styles.spin : ''} />
          </button>
        </div>
      </header>

      <BannerCarousel banners={banners} user={user} />

      <section className={styles.kpiGrid} aria-label="Indicadores principais">
        {kpis.map((kpi) => (
          <div key={kpi.label} className={styles.kpiCard}>
            <div className={styles.kpiTop}>
              <span className={styles.kpiIcon} style={{ '--kpi-color': kpi.color } as React.CSSProperties}><kpi.icon size={18} /></span>
              {kpi.delta}
            </div>
            <span className={styles.kpiLabel}>{kpi.label}</span>
            <strong className={styles.kpiValue}>{kpi.value}</strong>
            {kpi.series.length > 1 ? <Sparkline values={kpi.series} color={kpi.color} /> : <div className={styles.sparkSpacer} />}
          </div>
        ))}
      </section>
      <p className={styles.periodNote}>Leads que entraram {periodLabel}, {compareLabel}. Linhas: tendência dos últimos 14 dias.</p>

      <div className={styles.rowWide}>
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2><TrendingUp size={18} /> Entradas e ganhos</h2>
            <Link href="/relatorios" className={styles.panelLink}>Relatórios <ArrowRight size={14} /></Link>
          </div>
          <div className={styles.chartBox}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chart.daily} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="dashNovos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="dashGanhos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.2)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="currentColor" opacity={0.55} minTickGap={16} />
                <YAxis tick={{ fontSize: 12 }} stroke="currentColor" opacity={0.55} allowDecimals={false} />
                <Tooltip contentStyle={{ borderRadius: 12, fontSize: 13 }} />
                <Area type="monotone" name="Novos leads" dataKey="novos" stroke="#3b82f6" strokeWidth={2} fill="url(#dashNovos)" />
                <Area type="monotone" name="Ganhos" dataKey="ganhos" stroke="#10b981" strokeWidth={2} fill="url(#dashGanhos)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2><Users size={18} /> Equipe agora</h2>
            <span className={styles.onlineSummary}><i /> {onlineCount} de {teamMembers.length} online</span>
          </div>
          <div className={styles.presenceList}>
            {teamSorted.length === 0 && <p className={styles.mutedText}>Carregando equipe…</p>}
            {teamSorted.slice(0, 9).map((member) => {
              const online = presence.isOnline(member.id, member.last_seen_at);
              return (
                <div key={member.id} className={styles.presenceRow}>
                  <span className={styles.presenceAvatar}>
                    {member.avatar_url
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={member.avatar_url} alt="" />
                      : member.name.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase()}
                    <i className={online ? styles.dotOnline : styles.dotOffline} />
                  </span>
                  <div className={styles.presenceInfo}>
                    <strong>{member.name}{member.id === user?.id && <small> (você)</small>}</strong>
                    <span className={online ? styles.textOnline : ''}>{presence.statusLabel(member.id, member.last_seen_at)}</span>
                  </div>
                  <span className={styles.roleTag}>{member.role === 'ADMIN' ? 'Admin' : member.role === 'MANAGER' ? 'Gerente' : 'Vendedor'}</span>
                </div>
              );
            })}
            {teamSorted.length > 9 && (
              <Link href="/users" className={styles.panelLink}>Ver toda a equipe ({teamSorted.length}) <ArrowRight size={14} /></Link>
            )}
          </div>
        </section>
      </div>

      <section>
        <div className={styles.sectionHeader}>
          <h2>Pulso dos módulos</h2>
          <span>o que está acontecendo em cada área agora</span>
        </div>
        <div className={styles.moduleGrid}>
          {tiles.map((tile) => (
            <Link key={tile.key} href={tile.href} className={styles.moduleTile} style={{ '--tile-color': tile.color } as React.CSSProperties}>
              <div className={styles.tileTop}>
                <span className={styles.tileIcon}><tile.icon size={18} /></span>
                <span className={styles.tileTitle}>{tile.title}</span>
                <ArrowRight size={15} className={styles.tileArrow} />
              </div>
              <div className={styles.tileMain}>
                <div>
                  <strong className={styles.tileValue}>{tile.value}</strong>
                  <span className={styles.tileCaption}>{tile.caption}</span>
                </div>
                {tile.visual}
              </div>
              {tile.stats.length > 0 && (
                <div className={styles.tileStats}>
                  {tile.stats.map((stat) => (
                    <span key={stat.label} data-tone={stat.tone}>
                      <b>{stat.value}</b> {stat.label}
                    </span>
                  ))}
                </div>
              )}
            </Link>
          ))}
          {!summary && <div className={`${styles.moduleTile} ${styles.tileLoading}`}>Carregando módulos…</div>}
        </div>
      </section>

      <div className={styles.rowHalf}>
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2><Kanban size={18} /> Funil {periodLabel}</h2>
            <span className={styles.mutedText}>{number(report.current.total)} leads</span>
          </div>
          <div className={styles.funnel}>
            {report.funnel.map((step, index) => (
              <div key={step.id} className={styles.funnelRow}>
                <span className={styles.funnelName}>{step.name}</span>
                <div className={styles.funnelTrack}>
                  <span style={{ width: `${Math.max(3, (step.reached / maxStage) * 100)}%`, background: step.color }} />
                </div>
                <span className={styles.funnelValue}>
                  {number(step.reached)}
                  {index > 0 && step.stepConversion !== null && <small>{step.stepConversion.toFixed(0)}%</small>}
                </span>
              </div>
            ))}
          </div>
          <div className={styles.serviceRow}>
            <span>TMA <b>{minutes(report.service.handling)}</b></span>
            <span>TME <b>{minutes(report.service.wait)}</b></span>
            <span>Ticket médio <b>{report.current.ticket ? currency(report.current.ticket) : '—'}</b></span>
          </div>
        </section>

        {canManage ? (
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <h2>Atualizações recentes</h2>
            </div>
            {updates.length === 0 ? (
              <p className={styles.mutedText}>Nenhuma atualização registrada ainda.</p>
            ) : (
              <ul className={styles.updateList}>
                {updates.map((update, index) => (
                  <li key={index}>
                    <span className={styles.updateDot} />
                    <div>
                      <p><strong>{update.user_name}</strong> {update.action} {update.target || ''}</p>
                      <small>
                        {new Date(update.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </small>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : (
          user && <PersonalActivityFeed userId={user.id} userName={user.name} />
        )}
      </div>

      {canManage && report.team.length > 0 && (
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2>Desempenho da equipe {periodLabel}</h2>
            <Link href="/relatorios" className={styles.panelLink}>Ver relatório completo <ArrowRight size={14} /></Link>
          </div>
          <div className={styles.tableWrapper}>
            <table className={styles.teamTable}>
              <thead>
                <tr>
                  <th>Usuário</th>
                  <th>Status</th>
                  <th>Leads</th>
                  <th>Ganhos</th>
                  <th>Conversão</th>
                  <th>Receita</th>
                  <th>TMA</th>
                </tr>
              </thead>
              <tbody>
                {report.team.map((member) => {
                  const profile = teamMembers.find((item) => item.id === member.id);
                  const online = member.id ? presence.isOnline(member.id, profile?.last_seen_at) : false;
                  return (
                    <tr key={member.id || 'none'}>
                      <td><strong>{nameById(member.id)}</strong></td>
                      <td>
                        {member.id ? (
                          <span className={`${styles.statusPill} ${online ? styles.statusOnline : styles.statusOffline}`}>
                            <i /> {presence.statusLabel(member.id, profile?.last_seen_at)}
                          </span>
                        ) : '—'}
                      </td>
                      <td>{member.total}</td>
                      <td>{member.won}</td>
                      <td>{member.conversion.toFixed(0)}%</td>
                      <td><strong>{currency(member.revenue)}</strong></td>
                      <td>{minutes(member.handling)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
