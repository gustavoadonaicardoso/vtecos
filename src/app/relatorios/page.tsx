"use client";

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowDownRight,
  ArrowUpRight,
  CircleDollarSign,
  Clock,
  Download,
  Filter,
  Flame,
  Lightbulb,
  Percent,
  Receipt,
  Timer,
  Trophy,
  UserPlus,
  Users,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import styles from './relatorios.module.css';
import { useLeads } from '@/context/LeadContext';
import { supabase } from '@/lib/supabase';
import {
  HOUR_SLOTS,
  WEEKDAYS,
  buildHighlights,
  buildReport,
  toCsv,
  type ReportPeriod,
} from './report-data';

const PERIODS: Array<{ value: ReportPeriod; label: string }> = [
  { value: 7, label: '7 dias' },
  { value: 30, label: '30 dias' },
  { value: 90, label: '90 dias' },
  { value: 0, label: 'Tudo' },
];

const currency = (value: number, compact = false) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: compact && value >= 10_000 ? 1 : 0,
    notation: compact && value >= 10_000 ? 'compact' : 'standard',
  }).format(value);

const number = (value: number) => new Intl.NumberFormat('pt-BR').format(Math.round(value));

const minutes = (value: number) => {
  if (!value) return '—';
  if (value < 60) return `${Math.round(value)} min`;
  const hours = Math.floor(value / 60);
  return `${hours}h${String(Math.round(value % 60)).padStart(2, '0')}`;
};

/** Transforma **trecho** em negrito nas frases de destaque. */
function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split(/\*\*(.+?)\*\*/g).map((part, index) => (index % 2 ? <strong key={index}>{part}</strong> : part))}
    </>
  );
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return null;
  const max = Math.max(1, ...values);
  const width = 120;
  const height = 36;
  const step = width / (values.length - 1);
  const points = values.map((value, index) => `${(index * step).toFixed(1)},${(height - (value / max) * (height - 4) - 2).toFixed(1)}`);
  const id = `spark-${color.replace('#', '')}`;
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

function DeltaChip({ value, suffix = '%', invert = false }: { value: number | null; suffix?: string; invert?: boolean }) {
  if (value === null || !Number.isFinite(value)) {
    return <span className={`${styles.delta} ${styles.deltaNeutral}`}>sem comparação</span>;
  }
  const positive = invert ? value < 0 : value >= 0;
  const Icon = value >= 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`${styles.delta} ${positive ? styles.deltaUp : styles.deltaDown}`}>
      <Icon size={13} /> {Math.abs(value).toFixed(suffix === ' p.p.' ? 1 : 0)}{suffix}
    </span>
  );
}

export default function RelatoriosPage() {
  const { leads, pipelineStages } = useLeads();
  const [period, setPeriod] = useState<ReportPeriod>(30);
  const [ownerNames, setOwnerNames] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase) return;
      const { data } = await supabase.from('profiles').select('id,name');
      if (!cancelled && data) setOwnerNames(Object.fromEntries(data.map((profile) => [profile.id, profile.name])));
    })();
    return () => { cancelled = true; };
  }, []);

  const ownerName = (id: string | null) => (id ? ownerNames[id] || 'Usuário' : 'Sem responsável');

  const report = useMemo(() => buildReport(leads, pipelineStages, period), [leads, pipelineStages, period]);
  const highlights = useMemo(() => buildHighlights(report), [report]);
  const { current, deltas, daily } = report;

  const exportCsv = () => {
    const blob = new Blob([toCsv(report.periodLeads, pipelineStages, ownerName)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `relatorio-leads-${period ? `${period}d` : 'completo'}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Sparklines acumuladas: mostram a tendência do período sem o serrilhado dos dias zerados.
  const cumulative = useMemo(() => {
    let leadsSum = 0;
    let wonSum = 0;
    let revenueSum = 0;
    return daily.map((point) => {
      leadsSum += point.novos;
      wonSum += point.ganhos;
      revenueSum += point.receita;
      return {
        leads: leadsSum,
        conversion: leadsSum ? (wonSum / leadsSum) * 100 : 0,
        revenue: revenueSum,
        ticket: wonSum ? revenueSum / wonSum : 0,
      };
    });
  }, [daily]);

  const kpis = [
    { label: 'Novos leads', value: number(current.total), icon: UserPlus, color: '#3b82f6', delta: <DeltaChip value={deltas.total} />, series: cumulative.map((point) => point.leads) },
    { label: 'Taxa de conversão', value: `${current.conversion.toFixed(1)}%`, icon: Percent, color: '#8b5cf6', delta: <DeltaChip value={deltas.conversion} suffix=" p.p." />, series: cumulative.map((point) => point.conversion) },
    { label: 'Receita ganha', value: currency(current.revenue, true), icon: CircleDollarSign, color: '#10b981', delta: <DeltaChip value={deltas.revenue} />, series: cumulative.map((point) => point.revenue) },
    { label: 'Ticket médio', value: currency(current.ticket, true), icon: Receipt, color: '#f59e0b', delta: <DeltaChip value={deltas.ticket} />, series: cumulative.map((point) => point.ticket) },
  ];

  const maxReached = Math.max(1, ...report.funnel.map((step) => step.reached));
  const hasData = leads.length > 0;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>Relatórios</h1>
          <p className={styles.subtitle}>Desempenho comercial a partir dos leads do CRM: entradas, conversão, receita, origem e equipe.</p>
        </div>
        <div className={styles.headerActions}>
          <div className={styles.segmented} role="group" aria-label="Período">
            {PERIODS.map((item) => (
              <button key={item.value} type="button" className={period === item.value ? styles.segmentActive : ''} onClick={() => setPeriod(item.value)}>
                {item.label}
              </button>
            ))}
          </div>
          <button type="button" className={styles.secondaryButton} onClick={exportCsv} disabled={report.periodLeads.length === 0}>
            <Download size={16} /> Exportar CSV
          </button>
        </div>
      </header>

      {!hasData ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}><Filter size={28} /></div>
          <h2>Ainda não há leads para analisar</h2>
          <p>Assim que os primeiros leads entrarem no CRM (manualmente, pelo WhatsApp ou por integração), os relatórios aparecem aqui com os números reais.</p>
          <Link href="/leads" className={styles.primaryButton}><UserPlus size={18} /> Ir para Leads</Link>
        </div>
      ) : (
        <>
          <section className={styles.kpiGrid} aria-label="Indicadores principais">
            {kpis.map((kpi) => (
              <div key={kpi.label} className={styles.kpiCard}>
                <div className={styles.kpiTop}>
                  <span className={styles.kpiIcon} style={{ '--kpi-color': kpi.color } as React.CSSProperties}><kpi.icon size={18} /></span>
                  {kpi.delta}
                </div>
                <span className={styles.kpiLabel}>{kpi.label}</span>
                <strong className={styles.kpiValue}>{kpi.value}</strong>
                <Sparkline values={kpi.series} color={kpi.color} />
              </div>
            ))}
          </section>
          <p className={styles.periodNote}>
            Considerando os {number(current.total)} leads que entraram {period ? `nos últimos ${period} dias` : 'desde o início'}
            {period ? ', comparados com os ' + period + ' dias anteriores' : ''}.
          </p>

          <div className={styles.rowWide}>
            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <h2>Entradas e ganhos</h2>
                <span>{report.range.days > 120 ? 'por semana' : 'por dia'}</span>
              </div>
              <div className={styles.chartBox}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={daily} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <defs>
                      <linearGradient id="repNovos" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="repGanhos" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.2)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="currentColor" opacity={0.55} minTickGap={16} />
                    <YAxis tick={{ fontSize: 12 }} stroke="currentColor" opacity={0.55} allowDecimals={false} />
                    <Tooltip contentStyle={{ borderRadius: 12, fontSize: 13 }} />
                    <Legend wrapperStyle={{ fontSize: 13 }} />
                    <Area type="monotone" name="Novos leads" dataKey="novos" stroke="#3b82f6" strokeWidth={2} fill="url(#repNovos)" />
                    <Area type="monotone" name="Ganhos" dataKey="ganhos" stroke="#10b981" strokeWidth={2} fill="url(#repGanhos)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className={`${styles.panel} ${styles.highlightPanel}`}>
              <div className={styles.panelHeader}>
                <h2><Lightbulb size={18} /> Destaques</h2>
              </div>
              {highlights.length === 0 ? (
                <p className={styles.mutedText}>Os destaques aparecem quando houver leads suficientes no período para comparar.</p>
              ) : (
                <ul className={styles.highlightList}>
                  {highlights.map((text) => <li key={text}><RichText text={text} /></li>)}
                </ul>
              )}
              <div className={styles.serviceStats}>
                <div>
                  <Timer size={18} />
                  <span>Tempo médio de atendimento</span>
                  <strong>{minutes(report.service.handling)}</strong>
                </div>
                <div>
                  <Clock size={18} />
                  <span>Tempo médio de espera</span>
                  <strong>{minutes(report.service.wait)}</strong>
                </div>
              </div>
            </section>
          </div>

          <div className={styles.rowHalf}>
            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <h2>Funil de conversão</h2>
                <span>quantos chegaram a cada etapa</span>
              </div>
              <div className={styles.funnel}>
                {report.funnel.map((step, index) => (
                  <div key={step.id} className={styles.funnelStep}>
                    {index > 0 && step.stepConversion !== null && (
                      <span className={styles.funnelConversion} data-low={step.stepConversion < 50 ? 'true' : undefined}>
                        ↓ {step.stepConversion.toFixed(0)}% avançam
                      </span>
                    )}
                    <div className={styles.funnelRow}>
                      <span className={styles.funnelName}>{step.name}</span>
                      <div className={styles.funnelBarArea}>
                        <div
                          className={styles.funnelBar}
                          style={{ width: `${Math.max(4, (step.reached / maxReached) * 100)}%`, background: step.color }}
                        >
                          <span>{number(step.reached)}</span>
                        </div>
                      </div>
                      <span className={styles.funnelShare}>{step.share.toFixed(0)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <h2>Origem dos leads</h2>
                <span>volume e conversão</span>
              </div>
              {report.sources.length === 0 ? (
                <p className={styles.mutedText}>Nenhum lead no período.</p>
              ) : (
                <div className={styles.sourceLayout}>
                  <div className={styles.donutBox}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={report.sources} dataKey="total" nameKey="name" innerRadius="62%" outerRadius="92%" paddingAngle={2} stroke="none">
                          {report.sources.map((source) => <Cell key={source.name} fill={source.color} />)}
                        </Pie>
                        <Tooltip formatter={(value, name) => [`${value} leads`, name]} contentStyle={{ borderRadius: 12, fontSize: 13 }} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className={styles.donutCenter}>
                      <strong>{report.sources.length}</strong>
                      <span>{report.sources.length === 1 ? 'origem' : 'origens'}</span>
                    </div>
                  </div>
                  <ul className={styles.sourceList}>
                    {report.sources.slice(0, 6).map((source) => (
                      <li key={source.name}>
                        <i style={{ background: source.color }} />
                        <span className={styles.sourceName}>{source.name}</span>
                        <span className={styles.sourceCount}>{source.total}</span>
                        <span className={styles.sourceConv} title="Conversão em ganho">{source.conversion.toFixed(0)}%</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          </div>

          <div className={styles.rowHalf}>
            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <h2><Flame size={18} /> Quando os leads chegam</h2>
                <span>{report.heatmap.hasHours ? 'dia da semana × horário' : 'por dia da semana'}</span>
              </div>
              <div className={styles.heatmap} style={{ '--slots': report.heatmap.hasHours ? 6 : 1 } as React.CSSProperties}>
                <span />
                {(report.heatmap.hasHours ? HOUR_SLOTS : ['Entradas']).map((slot) => <span key={slot} className={styles.heatLabel}>{slot}</span>)}
                {WEEKDAYS.map((day, dayIndex) => (
                  <React.Fragment key={day}>
                    <span className={styles.heatDay}>{day}</span>
                    {report.heatmap.grid[dayIndex].map((value, slotIndex) => (
                      <span
                        key={slotIndex}
                        className={styles.heatCell}
                        style={{ '--heat': report.heatmap.max ? value / report.heatmap.max : 0 } as React.CSSProperties}
                        title={`${day}${report.heatmap.hasHours ? ` ${HOUR_SLOTS[slotIndex]}` : ''}: ${value} leads`}
                      >
                        {value > 0 ? value : ''}
                      </span>
                    ))}
                  </React.Fragment>
                ))}
              </div>
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <h2><Trophy size={18} /> Desempenho da equipe</h2>
                <span>ordenado por receita</span>
              </div>
              {report.team.length === 0 ? (
                <p className={styles.mutedText}>Nenhum lead no período.</p>
              ) : (
                <div className={styles.teamList}>
                  {report.team.slice(0, 8).map((member, index) => {
                    const name = ownerName(member.id);
                    const topRevenue = Math.max(1, report.team[0].revenue);
                    return (
                      <div key={member.id || 'none'} className={styles.teamRow}>
                        <span className={styles.teamRank} data-top={index < 3 ? String(index + 1) : undefined}>{index + 1}</span>
                        <span className={styles.teamAvatar}>{member.id ? name.slice(0, 1).toUpperCase() : <Users size={14} />}</span>
                        <div className={styles.teamInfo}>
                          <div className={styles.teamLine}>
                            <strong>{name}</strong>
                            <span>{currency(member.revenue, true)}</span>
                          </div>
                          <div className={styles.teamBar}><i style={{ width: `${(member.revenue / topRevenue) * 100}%` }} /></div>
                          <div className={styles.teamMeta}>
                            <span>{member.total} {member.total === 1 ? 'lead' : 'leads'}</span>
                            <span>{member.won} {member.won === 1 ? 'ganho' : 'ganhos'}</span>
                            <span>{member.conversion.toFixed(0)}% conversão</span>
                            {member.handling > 0 && <span>TMA {minutes(member.handling)}</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
