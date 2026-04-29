"use client";

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { 
  TrendingUp, 
  Users, 
  DollarSign, 
  Clock, 
  CheckCircle2, 
  MessageCircle,
  AlertCircle,
  Calendar,
  Activity,
  UserCheck,
  X,
  Send,
  Loader2,
  Flame,
  Rocket,
  Star,
  Shield,
  Globe,
  Award,
  Sparkles,
  Zap as ZapIcon,
  Settings
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
import ThemeToggle from '@/components/ThemeToggle';
import NotificationDropdown from '@/components/NotificationDropdown';
import { Bell, HelpCircle } from 'lucide-react';
import Link from 'next/link';

const initialKpis = [
  { label: 'Receita Total', value: 'R$ 0,00', trend: '+0%', icon: DollarSign, color: '#3b82f6' },
  { label: 'Leads Ativos', value: '0', trend: '+0%', icon: Users, color: '#8b5cf6' },
  { label: 'Ticket Médio', value: 'R$ 0,00', trend: '-', icon: Award, color: '#10b981' },
  { label: 'Conversão', value: '0%', trend: '-', icon: Activity, color: '#f59e0b' },
];



const activities = [
  { user: 'João Silva', action: 'moveu o lead "Auto Peças LTDA" para', stage: 'Negociação', time: '2 min atrás', icon: TrendingUp },
  { user: 'Bia Santos', action: 'enviou uma mensagem de WhatsApp para', target: 'Mário Lima', time: '15 min atrás', icon: MessageCircle },
  { user: 'Sistema', action: 'atribuiu 5 novos leads do Site', time: '1 hora atrás', icon: Users },
  { user: 'Pedro Costa', action: 'fechou negócio com "Tech Solutions"', time: '3 horas atrás', icon: DollarSign },
];

const userData = [
  { name: 'João Silva', status: 'online', activeChats: 5, tma: '12m 30s', sales: 12, uptime: '4h 15m' },
  { name: 'Bia Santos', status: 'online', activeChats: 3, tma: '15m 10s', sales: 8, uptime: '6h 40m' },
  { name: 'Pedro Costa', status: 'offline', activeChats: 0, tma: '10m 45s', sales: 15, uptime: '0h 00m' },
  { name: 'Ana Oliveira', status: 'online', activeChats: 7, tma: '14m 20s', sales: 10, uptime: '2h 10m' },
  { name: 'Carlos Lima', status: 'offline', activeChats: 0, tma: '18m 00s', sales: 5, uptime: '0h 00m' },
];


interface Banner {
  title: string;
  description: string;
  date: string;
  type: string;
  color: string;
  icon: any;
  iconName?: string;
}

const eventsBanners: Banner[] = [];

const funnelData = [
  { label: 'Leads', value: 1280, icon: Users, color: '#3b82f6' },
  { label: 'Qualificados', value: 840, icon: UserCheck, color: '#8b5cf6' },
  { label: 'Proposta', value: 320, icon: MessageCircle, color: '#f59e0b' },
  { label: 'Fechados', value: 145, icon: DollarSign, color: '#10b981' },
];

const periodTeamData: Record<string, typeof userData> = {
  today: userData,
  yesterday: [
    { name: 'João Silva', status: 'online', activeChats: 4, tma: '14m 10s', sales: 10, uptime: '8h 00m' },
    { name: 'Bia Santos', status: 'online', activeChats: 2, tma: '16m 00s', sales: 6, uptime: '7h 30m' },
    { name: 'Pedro Costa', status: 'online', activeChats: 5, tma: '11m 30s', sales: 12, uptime: '8h 15m' },
    { name: 'Ana Oliveira', status: 'online', activeChats: 6, tma: '15m 45s', sales: 9, uptime: '6h 00m' },
    { name: 'Carlos Lima', status: 'online', activeChats: 3, tma: '19m 20s', sales: 4, uptime: '8h 00m' },
  ],
  '7days': [
    { name: 'João Silva', status: 'online', activeChats: 32, tma: '13m 20s', sales: 85, uptime: '54h 20m' },
    { name: 'Bia Santos', status: 'online', activeChats: 28, tma: '15m 50s', sales: 64, uptime: '48h 15m' },
    { name: 'Pedro Costa', status: 'offline', activeChats: 40, tma: '10m 55s', sales: 92, uptime: '50h 10m' },
    { name: 'Ana Oliveira', status: 'online', activeChats: 35, tma: '14m 40s', sales: 78, uptime: '45h 30m' },
    { name: 'Carlos Lima', status: 'offline', activeChats: 22, tma: '18m 15s', sales: 45, uptime: '42h 00m' },
  ],
  '30days': [
    { name: 'João Silva', status: 'online', activeChats: 145, tma: '12m 55s', sales: 342, uptime: '220h 10m' },
    { name: 'Bia Santos', status: 'online', activeChats: 128, tma: '15m 30s', sales: 285, uptime: '195h 45m' },
    { name: 'Pedro Costa', status: 'online', activeChats: 162, tma: '11m 10s', sales: 410, uptime: '215h 20m' },
    { name: 'Ana Oliveira', status: 'online', activeChats: 154, tma: '14m 15s', sales: 328, uptime: '202h 30m' },
    { name: 'Carlos Lima', status: 'online', activeChats: 98, tma: '18m 45s', sales: 185, uptime: '188h 00m' },
  ]
};
const periodFunnelData: Record<string, typeof funnelData> = {
  today: funnelData,
  yesterday: [
    { label: 'Leads', value: 980, icon: Users, color: '#3b82f6' },
    { label: 'Qualificados', value: 620, icon: UserCheck, color: '#8b5cf6' },
    { label: 'Proposta', value: 210, icon: MessageCircle, color: '#f59e0b' },
    { label: 'Fechados', value: 85, icon: DollarSign, color: '#10b981' },
  ],
  '7days': [
    { label: 'Leads', value: 8450, icon: Users, color: '#3b82f6' },
    { label: 'Qualificados', value: 5200, icon: UserCheck, color: '#8b5cf6' },
    { label: 'Proposta', value: 1840, icon: MessageCircle, color: '#f59e0b' },
    { label: 'Fechados', value: 720, icon: DollarSign, color: '#10b981' },
  ],
  '30days': [
    { label: 'Leads', value: 32100, icon: Users, color: '#3b82f6' },
    { label: 'Qualificados', value: 19800, icon: UserCheck, color: '#8b5cf6' },
    { label: 'Proposta', value: 6500, icon: MessageCircle, color: '#f59e0b' },
    { label: 'Fechados', value: 2840, icon: DollarSign, color: '#10b981' },
  ]
};

const periodActivities: Record<string, typeof activities> = {
  today: activities,
  yesterday: [
    { user: 'Bia Santos', action: 'concluiu o onboarding de', target: 'Agência X', time: 'Ontem', icon: UserCheck },
    { user: 'Pedro Costa', action: 'agendou demonstração para', target: 'Mário Silva', time: 'Ontem', icon: Clock },
  ],
  '7days': [
    { user: 'Equipe Vendas', action: 'bateu a meta semanal de', target: 'Novos Contratos', time: '2 dias atrás', icon: Award },
    { user: 'Sistema', action: 'processou 5.000 novos leads de', target: 'Facebook Ads', time: '4 dias atrás', icon: ZapIcon },
  ],
  '30days': [
    { user: 'Vórtice Admin', action: 'atualizou os workflows de', target: 'Automação Master', time: '15 dias atrás', icon: Settings },
    { user: 'Performance', action: 'atingiu ROI recorde no período de', target: 'Março 2026', time: '22 dias atrás', icon: TrendingUp },
  ]
};

export default function Dashboard() {
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [selectedEvent, setSelectedEvent] = React.useState<any>(null);
  const [banners, setBanners] = React.useState<any[]>([]);
  const [formSubmitted, setFormSubmitted] = React.useState(false);
  const [currentFilter, setCurrentFilter] = React.useState('today');
  const [kpis, setKpis] = React.useState(initialKpis);
  const [teamStats, setTeamStats] = React.useState<any[]>([]);
  const [funnel, setFunnel] = React.useState<any[]>([]);
  const [recentUpdates, setRecentUpdates] = React.useState<any[]>([]);
  const [isFiltering, setIsFiltering] = React.useState(false);
  const [showNotifications, setShowNotifications] = React.useState(false);
  const [unreadCount, setUnreadCount] = React.useState(0);
  
  // Real Analytics States
  const [realTma, setRealTma] = React.useState(0);
  const [realTme, setRealTme] = React.useState(0);
  const [realSources, setRealSources] = React.useState<any[]>([]);
  const [realStatusCounts, setRealStatusCounts] = React.useState({ open: 0, finished: 0, transferred: 0 });
  
  const { leads, dbStatus, refreshDatabase } = useLeads();
  const { user } = useAuth();
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);

  const router = useRouter();

  React.useEffect(() => {
    setMounted(true);
  }, []);

  // Inteligência de Redirecionamento: Abre no primeiro módulo disponível
  React.useEffect(() => {
    if (!mounted || !user) return;

    const navItems = [
      { path: '/', permission: 'dashboard.view' }, // Dashboard é o padrão, se tiver permissão
      { path: '/projetos', permission: 'admin.projects' },
      { path: '/messages', permission: 'messages.view' },
      { path: '/chat', permission: 'messages.send' },
      { path: '/pipeline', permission: 'pipeline.view' },
      { path: '/leads', permission: 'leads.view' },
    ];

    const hasPerm = (p?: string) => {
      if (!p) return true;
      if (user.role === 'ADMIN') return true;
      const [cat, field] = p.split('.');
      return (user.permissions as any)?.[cat]?.[field] === true;
    };

    // Se o usuário NÃO tem permissão para a dashboard (página atual), 
    // procure o primeiro módulo que ele PODE acessar e redirecione.
    if (!hasPerm('dashboard.view')) {
      const firstAvailable = navItems.find(item => item.path !== '/' && hasPerm(item.permission));
      if (firstAvailable) {
        router.push(firstAvailable.path);
      }
    }
  }, [mounted, user, router]);

  const firstName = (mounted && user?.name) ? user.name.split(' ')[0] : 'Admin';

  const handleRefresh = React.useCallback(async () => {
    setIsRefreshing(true);
    await refreshDatabase();
    setTimeout(() => setIsRefreshing(false), 500);
  }, [refreshDatabase]);

  // Auto-refresh 30s
  React.useEffect(() => {
    const interval = setInterval(() => {
      handleRefresh();
    }, 30000);
    return () => clearInterval(interval);
  }, [handleRefresh]);

  // Sync with localStorage + DB
  React.useEffect(() => {
    const fetchBanners = async () => {
      if (supabase) {
        const { data } = await supabase.from('platform_banners').select('*');
        if (data && data.length > 0) {
           setBanners(data);
           return;
        }
      }
      const savedBanners = localStorage.getItem('vortice_banners');
      if (savedBanners) setBanners(JSON.parse(savedBanners));
    };

    const fetchTeam = async () => {
      if (supabase) {
        const { data } = await supabase.from('profiles').select('*');
        if (data) setTeamStats(data);
      }
    };

    const fetchUpdates = async () => {
      if (supabase) {
        const { data } = await supabase.from('system_updates').select('*').order('created_at', { ascending: false }).limit(6);
        if (data && data.length > 0) setRecentUpdates(data);
        else setRecentUpdates([{ user_name: 'Sistema', action: 'Monitorando novas atualizações...', created_at: new Date().toISOString() }]);
      }
    };

    fetchBanners();
    fetchTeam();
    fetchUpdates();
  }, [dbStatus]);

  // Realtime System Notifications
  React.useEffect(() => {
    if (!user || !supabase) return;

    const fetchCount = async () => {
      const { count, error } = await supabase
        .from('system_notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_read', false);
      
      if (!error) setUnreadCount(count || 0);
    };

    fetchCount();

    const channel = supabase
      .channel('dashboard_system_notifications')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'system_notifications',
        filter: `user_id=eq.${user.id}`
      }, () => fetchCount())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Sync Dashboard Numbers with real Leads
  React.useEffect(() => {
    setIsFiltering(true);
    
    setTimeout(() => {
      // 1. Analytics Operacional (Dados Reais do Banco)
      const avgTma = leads.reduce((acc, l) => acc + (l.handlingTime || 0), 0) / (leads.length || 1);
      const avgTme = leads.reduce((acc, l) => acc + (l.waitTime || 0), 0) / (leads.length || 1);

      // 2. Status de Atendimentos (Agrupado por Stage/Status)
      const stageCounts: Record<string, number> = {};
      leads.forEach(l => { stageCounts[l.pipelineStage] = (stageCounts[l.pipelineStage] || 0) + 1; });
      
      const finishedCount = stageCounts['ganho'] || 0;
      const openCount = leads.length - finishedCount;
      const transferredCount = 0; // Futuro: Implementar campo 'transferred' no DB

      // 3. Fontes de Origem (Calculado em %)
      const sourceCounts: Record<string, number> = {};
      leads.forEach(l => { 
        const s = l.source || 'Tráfego Direto';
        sourceCounts[s] = (sourceCounts[s] || 0) + 1; 
      });
      const calculatedSources = Object.entries(sourceCounts).map(([name, count]) => ({
        name,
        value: Math.round((count / (leads.length || 1)) * 100),
        color: name === 'Google Ads' ? '#3b82f6' : name === 'Site' ? '#10b981' : '#f59e0b'
      })).sort((a, b) => b.value - a.value);

      // 4. KPIs Financeiros
      const wonLeads = leads.filter(l => l.pipelineStage === 'ganho');
      const totalRevenue = wonLeads.reduce((acc, l) => {
        const raw = String(l.value || '0');
        return acc + (parseFloat(raw.replace(/[^0-9,-]+/g,"").replace(",",".") || "0") || 0);
      }, 0);
      const ticketMedio = wonLeads.length > 0 ? totalRevenue / wonLeads.length : 0;
      const conversionValue = leads.length > 0 ? (wonLeads.length / leads.length) * 100 : 0;

      const newKpis = [
        { 
          label: 'Receita Total', 
          value: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalRevenue), 
          trend: '+Base Real', icon: DollarSign, color: '#3b82f6' 
        },
        { label: 'Leads Ativos', value: leads.length.toString(), trend: 'Ativos', icon: Users, color: '#8b5cf6' },
        { 
          label: 'Ticket Médio', 
          value: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(ticketMedio), 
          trend: 'Geral', icon: Award, color: '#10b981' 
        },
        { label: 'Conversão', value: `${conversionValue.toFixed(1)}%`, trend: 'Ganhos/Total', icon: Activity, color: '#f59e0b' },
      ];

      setKpis(newKpis);

      // Real Funnel State
      const newFunnel = [
        { label: 'Leads', value: leads.length, icon: Users, color: '#3b82f6' },
        { label: 'Qualificados', value: (stageCounts['contato'] || 0) + (stageCounts['proposta'] || 0) + (stageCounts['negociacao'] || 0) + (stageCounts['ganho'] || 0), icon: UserCheck, color: '#8b5cf6' },
        { label: 'Proposta', value: (stageCounts['proposta'] || 0) + (stageCounts['negociacao'] || 0) + (stageCounts['ganho'] || 0), icon: MessageCircle, color: '#f59e0b' },
        { label: 'Fechados', value: stageCounts['ganho'] || 0, icon: DollarSign, color: '#10b981' },
      ];
      setFunnel(newFunnel);

      // Update Local State for Metrics
      setRealTma(Math.floor(avgTma));
      setRealTme(Math.floor(avgTme));
      setRealSources(calculatedSources);
      setRealStatusCounts({ open: openCount, finished: finishedCount, transferred: transferredCount });

      setIsFiltering(false);
    }, 400);
  }, [leads, currentFilter]);

  const handleFilter = () => {
    setIsFiltering(true);
    setTimeout(() => setIsFiltering(false), 600);
  };


  const openModal = (event: typeof eventsBanners[0]) => {
    setSelectedEvent(event);
    setIsModalOpen(true);
    setFormSubmitted(false);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedEvent(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormSubmitted(true);
    setTimeout(() => {
      closeModal();
    }, 2000);
  };

  return (
    <div className={styles.dashboard}>
      <header className={styles.welcomeSection}>
        <div className={styles.headerContent}>
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
          >
            <h2>Bem-vindo de volta, {firstName} 👋</h2>
            <p>Aqui está o que está acontecendo no seu funil de vendas hoje.</p>
          </motion.div>

          <div className={styles.headerRight}>
            <div className={styles.filterGroup}>
              <div className={styles.datePicker}>
                <Calendar size={18} />
                <select 
                  className={styles.dateSelect} 
                  value={currentFilter}
                  onChange={(e) => setCurrentFilter(e.target.value)}
                >
                  <option value="today">Hoje</option>
                  <option value="yesterday">Ontem</option>
                  <option value="7days">Últimos 7 dias</option>
                  <option value="30days">Últimos 30 dias</option>
                </select>
              </div>
              
              <button 
                className={`${styles.refreshBtn} ${isRefreshing ? styles.refreshing : ''}`}
                onClick={handleRefresh}
                title="Atualizar dados agora"
                disabled={isRefreshing}
              >
                <Activity size={18} className={isRefreshing ? styles.spin : ''} />
                <span>{isRefreshing ? 'Sincronizando...' : 'Atualizar'}</span>
              </button>

              <button 
                className={styles.filterBtn}
                onClick={handleFilter}
                disabled={isFiltering}
              >
                {isFiltering ? (
                  <>
                    <Loader2 size={16} className={styles.spin} />
                    <span>Aplicando...</span>
                  </>
                ) : (
                  'Filtrar'
                )}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Banners de Eventos da Vórtice */}
      <section className={styles.bannersSection}>
        <div className={styles.bannersScroll}>
          {banners.map((banner, idx) => (
            <motion.div 
              key={idx} 
              className={styles.bannerCard}
              style={{ background: banner.color }}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 * idx }}
              onClick={() => openModal(banner)}
            >
              <div className={styles.bannerContent}>
                <span className={styles.bannerType}>{banner.type}</span>
                <h3 className={styles.bannerTitle}>{banner.title}</h3>
                <p className={styles.bannerDesc}>{banner.description}</p>
                <div className={styles.bannerFooter}>
                  <Calendar size={14} />
                  <span>{banner.date}</span>
                </div>
              </div>
              <div className={styles.bannerIconOverlay}>
                 {/* Safe icon rendering for serialized banners */}
                 {banner.iconName && PRESET_ICONS_MAP[banner.iconName] ? (
                   React.createElement(PRESET_ICONS_MAP[banner.iconName], { size: 110, strokeWidth: 1.5 })
                 ) : (
                    <span style={{ fontSize: '100px', opacity: 0.2 }}>✨</span>
                 )}
              </div>
              <button 
                className={styles.bannerAction}
                onClick={(e) => {
                  e.stopPropagation();
                  openModal(banner);
                }}
              >
                Saber mais
              </button>
            </motion.div>
          ))}
        </div>
      </section>

      <section className={styles.kpiGrid}>
        {kpis.map((kpi, index) => (
          <motion.div 
            key={kpi.label}
            className={styles.kpiCard}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <div className={styles.kpiCardHeader}>
              <div className={styles.iconWrapper} style={{ color: kpi.color, background: `${kpi.color}15` }}>
                <kpi.icon size={20} />
              </div>
              <span className={`${styles.trend} ${styles.trendUp}`}>{kpi.trend}</span>
            </div>
            <div className={styles.kpiValue}>{kpi.value}</div>
            <div className={styles.kpiLabel}>{kpi.label}</div>
          </motion.div>
        ))}

        <motion.div 
          className={`${styles.kpiCard} ${styles.usersOnlineCard}`}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <div className={styles.kpiCardHeader}>
            <div className={styles.iconWrapper} style={{ color: '#10b981', background: '#10b98115' }}>
              <UserCheck size={20} />
            </div>
            <span className={styles.onlineBadge}>Live</span>
          </div>
          <div className={styles.kpiValue}>
            {teamStats.filter(u => u.status === 'ACTIVE' || u.status === 'online').length} / {teamStats.length}
          </div>
          <div className={styles.kpiLabel}>Usuários Online</div>
          <div className={styles.progressBarContainer}>
            <div 
              className={styles.progressBarFiller} 
              style={{ width: `${teamStats.length > 0 ? (teamStats.filter(u => u.status === 'ACTIVE' || u.status === 'online').length / teamStats.length) * 100 : 0}%` }}
            ></div>
          </div>
          <div className={styles.progressInfo}>
            <span>{teamStats.length > 0 ? ((teamStats.filter(u => u.status === 'ACTIVE' || u.status === 'online').length / teamStats.length) * 100).toFixed(0) : 0}% da equipe ativa</span>
          </div>
        </motion.div>
      </section>

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
                <div className={styles.statusDivider}></div>
                <div className={styles.statusItem}>
                   <span className={styles.statusLabel}>Finalizados</span>
                   <span className={styles.statusValue} style={{ color: '#10b981' }}>{realStatusCounts.finished}</span>
                </div>
                <div className={styles.statusDivider}></div>
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
                       <div className={styles.sourceColor} style={{ background: source.color }}></div>
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


      <div className={styles.mainGrid}>
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
              const conversion = idx > 0 ? ((step.value / funnel[idx-1].value) * 100).toFixed(1) : null;
              const width = 100 - (idx * 15); // Narrows down the funnel

              return (
                <div key={idx} className={styles.funnelStep}>
                  {conversion && (
                    <div className={styles.conversionInfo}>
                      <div className={styles.conversionLine}></div>
                      <span className={styles.conversionValue}>{conversion}%</span>
                    </div>
                  )}
                  
                  <div className={styles.stepVisual}>
                    <div 
                      className={styles.stepBar} 
                      style={{ 
                        width: `${width}%`,
                        background: `linear-gradient(90deg, ${step.color}30, ${step.color})`,
                        boxShadow: `0 0 20px ${step.color}20`
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
              <span className={styles.summaryValue}>{(leads.filter(l => l.pipelineStage === 'ganho').length / (leads.length || 1) * 100).toFixed(1)}%</span>
            </div>
            <div className={styles.summaryDivider}></div>
            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>Ticket Médio</span>
              <span className={styles.summaryValue}>
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                  leads.filter(l => l.pipelineStage === 'ganho').reduce((acc, l) => {
                    const raw = String(l.value || '0');
                    return acc + (parseFloat(raw.replace(/[^0-9,-]+/g,"").replace(",",".") || "0") || 0);
                  }, 0) / (leads.filter(l => l.pipelineStage === 'ganho').length || 1)
                )}
              </span>
            </div>
          </div>
        </section>

        <section className={styles.chartContainer}>
          <h3 className={styles.sectionTitle}>Atualizações Recentes</h3>
          <div className={styles.activityList}>
            {recentUpdates.map((act, index) => (
              <div key={index} className={styles.activityItem}>
                <div className={styles.activityIcon}>
                  {act.icon_name && PRESET_ICONS_MAP[act.icon_name] ? (
                    React.createElement(PRESET_ICONS_MAP[act.icon_name], { size: 16 })
                  ) : <TrendingUp size={16} />}
                </div>
                <div>
                  <p>
                    <strong>{act.user_name}</strong> {act.action} {act.target || ''}
                  </p>
                  <span className={styles.activityTime}>
                    {new Date(act.created_at || Date.now()).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} • {new Date(act.created_at || Date.now()).toLocaleDateString('pt-BR')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

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
              {teamStats.map((user, index) => (
                <tr key={index}>
                  <td>
                    <div className={styles.userNameColumn}>
                      <div className={styles.userAvatar}>
                        {user.name.split(' ').map((n: string) => n[0]).join('')}
                      </div>
                      {user.name}
                    </div>
                  </td>
                  <td>
                    <span className={`${styles.statusBadge} ${user.status === 'online' ? styles.statusOnline : styles.statusOffline}`}>
                      {user.status === 'online' ? 'Online' : 'Offline'}
                    </span>
                  </td>
                  <td>{user.activeChats} atendimentos</td>
                  <td>{user.tma || 'N/A'}</td>
                  <td>
                    <span className={styles.salesCount}>{user.sales}</span>
                  </td>
                  <td>{user.uptime}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Modal de Inscrição */}
      <AnimatePresence>
        {isModalOpen && selectedEvent && (
          <div className={styles.modalOverlay} onClick={closeModal}>
            <motion.div 
              className={styles.modalContent}
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
            >
              <button className={styles.closeModal} onClick={closeModal}>
                <X size={24} />
              </button>

              {!formSubmitted ? (
                <>
                  <div className={styles.modalHeader}>
                    <div className={styles.modalIcon} style={{ background: selectedEvent.color }}>
                      {/* Safe icon mapping for serialized/custom banners */}
                      {selectedEvent.iconName && PRESET_ICONS_MAP[selectedEvent.iconName] ? (
                        React.createElement(PRESET_ICONS_MAP[selectedEvent.iconName], { size: 32, color: "white" })
                      ) : typeof selectedEvent.icon === 'function' ? (
                        <selectedEvent.icon size={32} color="white" />
                      ) : (
                        <Calendar size={32} color="white" />
                      )}
                    </div>
                    <div>
                      <span className={styles.modalBadge}>{selectedEvent.type}</span>
                      <h3 className={styles.modalTitle}>Inscrição: {selectedEvent.title}</h3>
                      <p className={styles.modalSubtitle}>Preencha os dados abaixo para garantir sua vaga.</p>
                    </div>
                  </div>

                  <form className={styles.registrationForm} onSubmit={handleSubmit}>
                    <div className={styles.formField}>
                      <label htmlFor="name">Nome Completo</label>
                      <input type="text" id="name" placeholder="Como deseja ser chamado?" required />
                    </div>
                    <div className={styles.formField}>
                      <label htmlFor="email">E-mail Corporativo</label>
                      <input type="email" id="email" placeholder="seu@email.com" required />
                    </div>
                    <div className={styles.formField}>
                      <label htmlFor="phone">WhatsApp / Telefone</label>
                      <input type="tel" id="phone" placeholder="(00) 00000-0000" required />
                    </div>
                    
                    <button type="submit" className={styles.submitBtn}>
                      <span>Confirmar minha vaga</span>
                      <Send size={18} />
                    </button>
                  </form>
                </>
              ) : (
                <div className={styles.successState}>
                  <div className={styles.successIcon}>
                    <CheckCircle2 size={64} color="#10b981" />
                  </div>
                  <h3>Inscrição Realizada!</h3>
                  <p>Enviamos os detalhes para o seu e-mail e em breve entraremos em contato via WhatsApp.</p>
                  <div className={styles.successEvent}>
                    <strong>{selectedEvent.title}</strong>
                    <span>{selectedEvent.date}</span>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>

  );
}
