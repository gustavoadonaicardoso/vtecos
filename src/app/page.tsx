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
  Hourglass,
  Kanban,
  Megaphone,
  MessageCircle,
  MessageSquare,
  Phone,
  RefreshCw,
  Share2,
  Target,
  Ticket,
  TrendingUp,
  UserPlus,
  Users,
  Workflow,
} from 'lucide-react';
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import styles from './page.module.css';
import { useLeads } from '@/context/LeadContext';
import { useAuth } from '@/context/AuthContext';
import { usePresence } from '@/context/PresenceContext';
import { usePermissions } from '@/lib/permissions';
import { useUnreadCount } from '@/hooks/useUnreadCount';
import { supabase } from '@/lib/supabase';
import { BannerCarousel, PersonalActivityFeed } from '@/components/home';
import { isWon } from './relatorios/report-data';
import { useReport } from './relatorios/useReport';
import { useTheme } from '@/components/ThemeProvider';
import { change, formatMinutes, seriesColor, type PeriodKey } from '@/lib/reports';
import { canViewGoal, getGoalPace, getGoalProgress, type GoalPlan } from '@/lib/goals';
import { fetchGoalsFromServer, migrateLocalGoalsIfAny } from '@/lib/goals-client';
import type { DashboardSummary } from '@/services/dashboard.service';
import type { HomeBanner } from '@/lib/banners';

const PERIODS: { value: PeriodKey; label: string }[] = [
  { value: 'today', label: 'Hoje' },
  { value: '7', label: '7 dias' },
  { value: '30', label: '30 dias' },
];

const currency = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: value >= 10_000 ? 1 : 0,
    notation: value >= 10_000 ? 'compact' : 'standard',
  }).format(value);

const number = (value: number) => new Intl.NumberFormat('pt-BR').format(Math.round(value));


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
  const [period, setPeriod] = useState<PeriodKey>('7');
  const { theme } = useTheme();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [goals, setGoals] = useState<GoalPlan[]>([]);
  const [banners, setBanners] = useState<HomeBanner[]>([]);
  const [updates, setUpdates] = useState<Array<{ user_name: string; action: string; target?: string; created_at: string }>>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const canManage = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  // Números do servidor (leads, vendas, conversas, tempo de resposta). O gráfico usa sempre 30 dias.
  const hasCrm = !user?.workspace?.modules || user.workspace.modules.includes('crm');
  const main = useReport(period, '', '', Boolean(user?.id) && hasCrm);
  const monthly = useReport('30', '', '', Boolean(user?.id) && hasCrm && period !== '30');
  const report = main.data;
  const chartReport = period === '30' ? main.data : monthly.data;
  const reloadReport = main.reload;

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
    // Banners: o servidor já devolve só os desta empresa, plano, cargo e período.
    fetch('/api/banners', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : { data: [] }))
      .then((json) => setBanners(Array.isArray(json.data) ? json.data : []))
      .catch(() => setBanners([]));
    supabase
      .from('system_updates')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(6)
      .then(({ data }) => setUpdates(data || []));
  }, [dbStatus]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refreshDatabase(), loadSummary(), reloadReport()]);
    setRefreshing(false);
  }, [loadSummary, refreshDatabase, reloadReport]);

  // Atualiza sozinho a cada 60s (leads + módulos).
  useEffect(() => {
    const timer = setInterval(refresh, 60_000);
    return () => clearInterval(timer);
  }, [refresh]);

  const chart = useMemo(
    () => (chartReport?.daily || []).map((day) => ({ ...day, label: day.date.split('-').reverse().slice(0, 2).join('/') })),
    [chartReport]
  );
  const openLeads = leads.filter((lead) => !isWon(lead));

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

  if (!mounted) return null;

  const periodLabel = period === 'today' ? 'hoje' : `nos últimos ${period} dias`;
  const compareLabel = period === 'today' ? 'comparado com ontem até esta hora' : `comparado com os ${period} dias anteriores`;
  const trend = (chartReport?.daily || []).slice(-14);
  const blue = seriesColor(0, theme);
  const orange = seriesColor(1, theme);
  const aqua = seriesColor(2, theme);

  const kpis = report
    ? [
        { label: 'Novos leads', value: number(report.leads.new), icon: UserPlus, color: blue, delta: <Delta value={change(report.leads.new, report.leads.newPrev)} />, series: trend.map((day) => day.newLeads), href: '/leads' },
        { label: `Receita · ${report.sales.won} ${report.sales.won === 1 ? 'venda' : 'vendas'}`, value: currency(report.sales.revenue), icon: CircleDollarSign, color: '#10b981', delta: <Delta value={change(report.sales.revenue, report.sales.revenuePrev)} />, series: trend.map((day) => day.revenue), href: '/pipeline' },
        { label: `Conversas · 1ª resposta ${formatMinutes(report.responses.medianAny)}`, value: number(report.messages.conversations), icon: MessageSquare, color: orange, delta: <Delta value={change(report.messages.conversations, report.messages.conversationsPrev)} />, series: trend.map((day) => day.received), href: '/messages' },
        {
          label: report.waiting.over1h ? `Esperando resposta · ${report.waiting.over1h} há mais de 1h` : 'Esperando resposta agora',
          value: number(report.waiting.count),
          icon: Hourglass,
          color: report.waiting.over1h ? '#ef4444' : aqua,
          delta: <span className={`${styles.delta} ${styles.deltaNeutral}`}>agora</span>,
          series: [] as number[],
          href: '/messages',
        },
      ]
    : [];

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
        { label: 'Tarefas atrasadas', value: String(agenda.openTasks), tone: agenda.openTasks ? 'warn' : undefined },
        { label: 'Envios hoje', value: String(agenda.messagesToday) },
        { label: 'Envios agendados', value: String(agenda.messagesPending) },
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

  const maxStage = Math.max(1, ...(report?.funnel || []).map((step) => step.count));

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

      <BannerCarousel banners={banners} />

      {hasCrm && (
        <>
          <section className={`${styles.kpiGrid} ${main.loading && report ? styles.reloading : ''}`} aria-label="Indicadores principais">
            {kpis.map((kpi) => (
              <Link key={kpi.label} href={kpi.href} className={styles.kpiCard}>
                <div className={styles.kpiTop}>
                  <span className={styles.kpiIcon} style={{ '--kpi-color': kpi.color } as React.CSSProperties}><kpi.icon size={18} /></span>
                  {kpi.delta}
                </div>
                <span className={styles.kpiLabel}>{kpi.label}</span>
                <strong className={styles.kpiValue}>{kpi.value}</strong>
                {kpi.series.length > 1 ? <Sparkline values={kpi.series} color={kpi.color} /> : <div className={styles.sparkSpacer} />}
              </Link>
            ))}
            {!report && <div className={`${styles.kpiCard} ${styles.kpiLoading}`}>{main.error || 'Calculando os números…'}</div>}
          </section>
          <p className={styles.periodNote}>
            {report?.scope === 'mine' ? 'Seus leads e conversas' : 'Números da empresa'} {periodLabel}, {compareLabel}. Linhas: últimos 14 dias.{' '}
            <Link href="/relatorios">Ver relatórios completos</Link>
          </p>
        </>
      )}

      <div className={styles.rowWide}>
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2><TrendingUp size={18} /> Últimos 30 dias</h2>
            <Link href="/relatorios" className={styles.panelLink}>Relatórios <ArrowRight size={14} /></Link>
          </div>
          <div className={styles.chartBox}>
            {chart.length === 0 ? (
              <p className={styles.mutedText}>{hasCrm ? 'Calculando…' : 'Disponível com o módulo CRM e Atendimento.'}</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chart} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.2)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="currentColor" opacity={0.55} minTickGap={16} />
                  <YAxis tick={{ fontSize: 12 }} stroke="currentColor" opacity={0.55} allowDecimals={false} />
                  <Tooltip contentStyle={{ borderRadius: 12, fontSize: 13, background: 'var(--tooltip-bg)', border: '1px solid var(--glass-border)', color: 'var(--foreground)' }} />
                  <Legend wrapperStyle={{ fontSize: 13 }} />
                  <Area type="monotone" name="Mensagens recebidas" dataKey="received" stroke={orange} strokeWidth={2} fill={orange} fillOpacity={0.1} />
                  <Area type="monotone" name="Novos leads" dataKey="newLeads" stroke={blue} strokeWidth={2} fill={blue} fillOpacity={0.12} />
                  <Area type="monotone" name="Vendas" dataKey="won" stroke={aqua} strokeWidth={2} fill={aqua} fillOpacity={0.14} />
                </AreaChart>
              </ResponsiveContainer>
            )}
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

      {report && (
        <div className={styles.rowHalf}>
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <h2><Kanban size={18} /> Funil agora</h2>
              <span className={styles.mutedText}>{number(report.leads.open)} em aberto</span>
            </div>
            <div className={styles.funnel}>
              {report.funnel.map((step) => (
                <div key={step.id} className={styles.funnelRow}>
                  <span className={styles.funnelName}>{step.name}</span>
                  <div className={styles.funnelTrack}>
                    <span style={{ width: `${Math.max(3, (step.count / maxStage) * 100)}%`, background: step.color }} />
                  </div>
                  <span className={styles.funnelValue}>
                    {number(step.count)}
                    {step.value > 0 && <small>{currency(step.value)}</small>}
                  </span>
                </div>
              ))}
            </div>
            <div className={styles.serviceRow}>
              <span>1ª resposta <b>{formatMinutes(report.responses.medianAny)}</b></span>
              <span>Respondidas <b>{report.responses.turns ? `${Math.round((report.responses.answered / report.responses.turns) * 100)}%` : '—'}</b></span>
              <span>Ticket médio <b>{report.sales.won ? currency(report.sales.revenue / report.sales.won) : '—'}</b></span>
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <h2><Hourglass size={18} /> Clientes esperando resposta</h2>
              <Link href="/messages" className={styles.panelLink}>Mensagens <ArrowRight size={14} /></Link>
            </div>
            {report.waiting.oldest.length === 0 ? (
              <p className={styles.mutedText}>Nenhum cliente esperando resposta agora. 🎉</p>
            ) : (
              <ul className={styles.waitList}>
                {report.waiting.oldest.slice(0, 6).map((item) => (
                  <li key={item.id}>
                    <Link href={`/messages?chatId=${item.id}`}>
                      <strong>{item.name}</strong>
                      <span>{item.assignedName ? `com ${item.assignedName}` : 'sem responsável'}</span>
                      <em data-late={item.waitMinutes > 60 ? 'true' : undefined}>há {formatMinutes(item.waitMinutes)}</em>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {canManage && report?.team && report.team.length > 0 && (
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
                  <th>Conversas</th>
                  <th>1ª resposta</th>
                  <th>Novos leads</th>
                  <th>Vendas</th>
                  <th>Receita</th>
                </tr>
              </thead>
              <tbody>
                {report.team.map((member) => {
                  const profile = teamMembers.find((item) => item.id === member.id);
                  const online = presence.isOnline(member.id, profile?.last_seen_at);
                  return (
                    <tr key={member.id}>
                      <td><strong>{member.name}</strong></td>
                      <td>
                        <span className={`${styles.statusPill} ${online ? styles.statusOnline : styles.statusOffline}`}>
                          <i /> {presence.statusLabel(member.id, profile?.last_seen_at)}
                        </span>
                      </td>
                      <td>{number(member.conversations)}</td>
                      <td>{formatMinutes(member.medianResponse)}</td>
                      <td>{number(member.newLeads)}</td>
                      <td>{number(member.won)}</td>
                      <td><strong>{currency(member.revenue)}</strong></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

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
  );
}
