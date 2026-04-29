"use client";

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend
} from 'recharts';
import { 
  TrendingUp, 
  Users, 
  DollarSign, 
  Activity, 
  ArrowUpRight, 
  ArrowDownRight,
  Target,
  Zap,
  Briefcase
} from 'lucide-react';
import styles from './relatorios.module.css';

import { supabase } from '@/lib/supabase';
import { useLeads } from '@/context/LeadContext';

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#14b8a6', '#f59e0b', '#10b981'];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className={styles.customTooltip}>
        <p className={styles.customTooltipLabel}>{label}</p>
        {payload.map((entry: any, index: number) => (
          <p key={index} className={styles.customTooltipItem} style={{ color: entry.color || '#fff' }}>
            {entry.name === 'Receita' || entry.name === 'Receita Acumulada'
              ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(entry.value)
              : `${entry.name}: ${entry.value}`}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export default function ReportsPage() {
  const [period, setPeriod] = useState('Mensal');
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalRevenue: 0,
    newLeads: 0,
    conversionRate: 0,
    avgCycle: 0,
    revenueHistory: [] as any[],
    funnel: [] as any[],
    sources: [] as any[]
  });
  const { refreshDatabase } = useLeads();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchData = React.useCallback(async () => {
    if (!supabase) {
      console.warn('Supabase client not initialized. Check your environment variables.');
      setLoading(false);
      return;
    }
    
    // Only show the full loading screen on first load
    // For refreshes, we might just show a small indicator or nothing
    try {
      const { data: leads, error } = await supabase.from('leads').select('*');
      if (error) {
        console.error('Supabase error fetching leads:', error.message, error.details, error.hint);
        throw error;
      }

      const safeLeads = leads || [];

      // 1. Process Revenue History (by Month)
      const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
      const currentYear = new Date().getFullYear();
      
      const revMap = new Map();
      let totalRevenue = 0;
      let wonLeads = 0;

      safeLeads.forEach(l => {
        if (!l.created_at) return;
        const date = new Date(l.created_at);
        if (isNaN(date.getTime())) return;
        
        if (date.getFullYear() === currentYear) {
          const m = months[date.getMonth()];
          const val = parseFloat(String(l.value || 0).replace(/[^0-9,-]+/g,"").replace(",",".") || "0") || 0;
          if (l.stage_id === 'ganho') {
            revMap.set(m, (revMap.get(m) || 0) + val);
            totalRevenue += val;
            wonLeads++;
          }
        }
      });

      const revenueHistory = months.map(m => ({ name: m, value: revMap.get(m) || 0 }));

      // 2. Funnel Data
      const stageMap: Record<string, number> = {};
      safeLeads.forEach(l => {
        if (l.stage_id) {
          stageMap[l.stage_id] = (stageMap[l.stage_id] || 0) + 1;
        }
      });

      const funnel = [
        { name: 'Entrada', value: safeLeads.length },
        { name: 'Qualificados', value: (stageMap['contato'] || 0) + (stageMap['proposta'] || 0) + (stageMap['negociacao'] || 0) + (stageMap['ganho'] || 0) },
        { name: 'Em Negociação', value: (stageMap['negociacao'] || 0) + (stageMap['ganho'] || 0) },
        { name: 'Fechados/Ganhos', value: stageMap['ganho'] || 0 },
      ];

      // 3. Source Data
      const srcMap: Record<string, number> = {};
      safeLeads.forEach(l => {
        const s = l.source || 'Outros';
        srcMap[s] = (srcMap[s] || 0) + 1;
      });
      const sources = Object.entries(srcMap).map(([name, value]) => ({ name, value }));

      // 4. Summaries
      const conversionRate = safeLeads.length ? (wonLeads / safeLeads.length) * 100 : 0;
      
      setStats({
        totalRevenue,
        newLeads: safeLeads.length,
        conversionRate,
        avgCycle: 12.5, // Placeholder for actual calculation
        revenueHistory,
        funnel,
        sources
      });
    } catch (err: any) {
      console.error('Error fetching stats detailed:', err?.message || err || 'Unknown Error');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await fetchData();
  };

  React.useEffect(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  // Auto-refresh 30s
  React.useEffect(() => {
    const interval = setInterval(() => {
      fetchData();
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);


  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { 
      opacity: 1,
      transition: { 
        staggerChildren: 0.1 
      }
    }
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: { 
      y: 0, 
      opacity: 1,
      transition: { type: 'spring' as const, stiffness: 100 }
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.titleWrapper}>
          <h1 className={styles.title}>Relatórios Executivos</h1>
          <p className={styles.subtitle}>Visão analítica e métricas de alta performance</p>
        </div>
        
        <div className={styles.periodSelector}>
          <button 
            className={`${styles.refreshBtn} ${isRefreshing ? styles.refreshBtnActive : ''}`}
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            title="Sincronizar dados agora"
          >
            <Activity className={isRefreshing ? styles.spin : ''} size={16} />
            {isRefreshing ? 'Sincronizando...' : 'Sincronizar'}
          </button>

          {['Semanal', 'Mensal', 'Trimestral', 'Anual'].map((p) => (
            <button
              key={p}
              className={`${styles.periodBtn} ${period === p ? styles.periodBtnActive : ''}`}
              onClick={() => setPeriod(p)}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {loading && (
          <motion.div 
            className={styles.loadingOverlay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <Zap className={styles.spin} size={48} />
            <p>Sincronizando com Banco de Dados...</p>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div 
        className={styles.kpiGrid}
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <motion.div className={styles.kpiCard} variants={itemVariants}>
          <div className={styles.kpiHeader}>
            <p className={styles.kpiTitle}>Receita Total</p>
            <div className={styles.kpiIcon}><DollarSign size={20} /></div>
          </div>
          <div>
            <h3 className={styles.kpiValue}>
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stats.totalRevenue)}
            </h3>
            <div className={`${styles.kpiTrend} ${styles.trendPositive}`}>
              <ArrowUpRight size={14} /> Dados reais da base
            </div>
          </div>
        </motion.div>

        <motion.div className={styles.kpiCard} variants={itemVariants}>
          <div className={styles.kpiHeader}>
            <p className={styles.kpiTitle}>Leads Totais</p>
            <div className={styles.kpiIcon}><Users size={20} /></div>
          </div>
          <div>
            <h3 className={styles.kpiValue}>{stats.newLeads}</h3>
            <div className={`${styles.kpiTrend} ${styles.trendPositive}`}>
              <ArrowUpRight size={14} /> Captados no período
            </div>
          </div>
        </motion.div>

        <motion.div className={styles.kpiCard} variants={itemVariants}>
          <div className={styles.kpiHeader}>
            <p className={styles.kpiTitle}>Taxa de Conversão</p>
            <div className={styles.kpiIcon}><Target size={20} /></div>
          </div>
          <div>
            <h3 className={styles.kpiValue}>{stats.conversionRate.toFixed(1)}%</h3>
            <div className={`${styles.kpiTrend} ${styles.trendPositive}`}>
              <ArrowUpRight size={14} /> Leads que viraram Ganhos
            </div>
          </div>
        </motion.div>

        <motion.div className={styles.kpiCard} variants={itemVariants}>
          <div className={styles.kpiHeader}>
            <p className={styles.kpiTitle}>Vendas Confirmadas</p>
            <div className={styles.kpiIcon}><Briefcase size={20} /></div>
          </div>
          <div>
            <h3 className={styles.kpiValue}>{stats.funnel.find(f => f.name === 'Fechados/Ganhos')?.value || 0}</h3>
            <div className={`${styles.kpiTrend} ${styles.trendPositive}`}>
              <ArrowUpRight size={14} /> Negócios fechados
            </div>
          </div>
        </motion.div>
      </motion.div>

      <motion.div 
        className={styles.chartsGrid}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.4, duration: 0.5 }}
      >
        <div className={styles.chartCard} style={{ gridColumn: '1 / -1' }}>
          <div className={styles.chartHeader}>
            <h2 className={styles.chartTitle}>Evolução de Receita</h2>
            <p className={styles.chartSubtitle}>Crescimento financeiro real do ano de {new Date().getFullYear()}</p>
          </div>
          <div className={styles.chartBody}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats.revenueHistory} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="name" stroke="#64748b" tick={{ fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis stroke="#64748b" tick={{ fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={(value) => `R$${value/1000}k`} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="value" name="Receita" stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#colorRevenue)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </motion.div>

      <motion.div 
        className={styles.secondaryChartsGrid}
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6, duration: 0.5 }}
      >
        <div className={styles.chartCard}>
          <div className={styles.chartHeader}>
            <h2 className={styles.chartTitle}>Funil de Vendas (Real)</h2>
            <p className={styles.chartSubtitle}>Volume de leads por progressão de etapa</p>
          </div>
          <div className={styles.chartBody}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.funnel} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={true} vertical={false} />
                <XAxis type="number" stroke="#64748b" tick={{ fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis dataKey="name" type="category" stroke="#64748b" tick={{ fill: '#64748b' }} axisLine={false} tickLine={false} width={100} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="value" fill="#8b5cf6" radius={[0, 4, 4, 0]}>
                  {stats.funnel.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className={styles.chartCard}>
          <div className={styles.chartHeader}>
            <h2 className={styles.chartTitle}>Origem de Aquisição</h2>
            <p className={styles.chartSubtitle}>Distribuição real por canal de origem</p>
          </div>
          <div className={styles.chartBody}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={stats.sources.length > 0 ? stats.sources : [{ name: 'Sem Dados', value: 1 }]}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                  stroke="none"
                >
                  {stats.sources.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
