"use client";

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Bot,
  CircleDollarSign,
  Clock,
  Download,
  Flame,
  Hourglass,
  Megaphone,
  MessageSquare,
  Phone,
  RefreshCw,
  Trophy,
  UserPlus,
  Users,
  Workflow,
} from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import styles from './relatorios.module.css';
import { useLeads } from '@/context/LeadContext';
import { useTheme } from '@/components/ThemeProvider';
import { change, formatMinutes, KIND_LABEL, KIND_ORDER, kindColor, PERIOD_OPTIONS, seriesColor, type PeriodKey, type ReportData } from '@/lib/reports';
import { toCsv } from './report-data';
import { useReport } from './useReport';

const currency = (value: number, compact = false) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: compact && value >= 10_000 ? 1 : 0,
    notation: compact && value >= 10_000 ? 'compact' : 'standard',
  }).format(value);

const number = (value: number) => new Intl.NumberFormat('pt-BR').format(Math.round(value));
const percent = (part: number, total: number) => (total ? `${Math.round((part / total) * 100)}%` : '—');
const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const STATUS_LABEL: Record<string, string> = { completed: 'Concluídas', waiting: 'Em andamento', running: 'Rodando agora', failed: 'Com erro', expired: 'Sem resposta', cancelled: 'Canceladas' };
const dayLabel = (date: string) => date.split('-').reverse().slice(0, 2).join('/');
const todayKey = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

function Delta({ value, invert = false }: { value: number | null; invert?: boolean }) {
  if (value === null || !Number.isFinite(value)) return <span className={`${styles.delta} ${styles.deltaNeutral}`} title="Sem números do período anterior para comparar">—</span>;
  const good = invert ? value <= 0 : value >= 0;
  const Icon = value >= 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`${styles.delta} ${good ? styles.deltaUp : styles.deltaDown}`} title="Comparado com o período anterior do mesmo tamanho">
      <Icon size={13} /> {Math.abs(value).toFixed(0)}%
    </span>
  );
}

function Kpi({ icon: Icon, color, label, value, hint, delta }: { icon: React.ComponentType<{ size?: number }>; color: string; label: string; value: string; hint?: string; delta?: React.ReactNode }) {
  return (
    <div className={styles.kpiCard}>
      <div className={styles.kpiTop}>
        <span className={styles.kpiIcon} style={{ '--kpi-color': color } as React.CSSProperties}><Icon size={18} /></span>
        {delta}
      </div>
      <span className={styles.kpiLabel}>{label}</span>
      <strong className={styles.kpiValue}>{value}</strong>
      {hint && <span className={styles.kpiHint}>{hint}</span>}
    </div>
  );
}

/** Agrupa a série por semana quando o período é longo (gráfico legível). */
function bucketDaily(daily: ReportData['daily']) {
  if (daily.length <= 62) return daily.map((day) => ({ ...day, label: dayLabel(day.date) }));
  const weeks: (ReportData['daily'][number] & { label: string })[] = [];
  daily.forEach((day, index) => {
    if (index % 7 === 0) weeks.push({ ...day, label: `sem. ${dayLabel(day.date)}` });
    else {
      const week = weeks[weeks.length - 1];
      week.newLeads += day.newLeads;
      week.won += day.won;
      week.revenue += day.revenue;
      week.received += day.received;
      week.sent += day.sent;
    }
  });
  return weeks;
}

export default function RelatoriosPage() {
  const { leads, pipelineStages } = useLeads();
  const { theme } = useTheme();
  const [period, setPeriod] = useState<PeriodKey>('30');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState(todayKey);
  const { data, error, loading, reload } = useReport(period, from, to);

  const chartDaily = useMemo(() => (data ? bucketDaily(data.daily) : []), [data]);
  const heat = useMemo(() => {
    if (!data) return { grid: [] as number[][], max: 0 };
    const grid = data.heatmap.map((row) => Array.from({ length: 12 }, (_, slot) => row[slot * 2] + row[slot * 2 + 1]));
    return { grid, max: Math.max(0, ...grid.flat()) };
  }, [data]);

  const exportCsv = () => {
    if (!data) return;
    const start = new Date(data.range.from).getTime();
    const end = new Date(data.range.to).getTime();
    const inRange = leads.filter((lead) => {
      const created = lead.createdAt ? new Date(lead.createdAt).getTime() : NaN;
      return created >= start && created < end;
    });
    const names = new Map((data.team || []).map((member) => [member.id, member.name]));
    const blob = new Blob([toCsv(inRange, pipelineStages, (id) => (id ? names.get(id) || 'Usuário' : 'Sem responsável'))], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `leads-${data.range.from.slice(0, 10)}-a-${data.range.to.slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const sentByKind = data ? KIND_ORDER.map((kind) => ({ kind, count: data.messages.byKind[kind] || 0 })).filter((item) => item.count > 0) : [];
  const maxKind = Math.max(1, ...sentByKind.map((item) => item.count));
  const maxFunnel = data ? Math.max(1, ...data.funnel.map((stage) => stage.count)) : 1;
  const maxSource = data ? Math.max(1, ...data.sources.map((source) => source.total)) : 1;
  const conversion = data && data.leads.new ? (data.sales.cohortWon / data.leads.new) * 100 : null;
  const automations = data?.automations;
  const campaigns = data?.campaigns;
  const blue = seriesColor(0, theme);
  const orange = seriesColor(1, theme);
  const aqua = seriesColor(2, theme);
  const axis = { fontSize: 12, fill: 'var(--muted)' };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>Relatórios</h1>
          <p className={styles.subtitle}>Vendas, atendimento, equipe, automações e disparos, com os números do período escolhido.</p>
        </div>
        <div className={styles.headerActions}>
          <button type="button" className={styles.secondaryButton} onClick={() => void reload()} disabled={loading} aria-label="Atualizar">
            <RefreshCw size={16} className={loading ? styles.spin : ''} /> Atualizar
          </button>
          <button type="button" className={styles.secondaryButton} onClick={exportCsv} disabled={!data}>
            <Download size={16} /> Exportar leads (CSV)
          </button>
        </div>
      </header>

      <div className={styles.filterRow}>
        <div className={styles.segmented} role="group" aria-label="Período">
          {PERIOD_OPTIONS.map((item) => (
            <button key={item.key} type="button" className={period === item.key ? styles.segmentActive : ''} onClick={() => setPeriod(item.key)}>
              {item.label}
            </button>
          ))}
        </div>
        {period === 'custom' && (
          <div className={styles.dateRange}>
            <label>De <input type="date" value={from} max={to || todayKey()} onChange={(event) => setFrom(event.target.value)} /></label>
            <label>até <input type="date" value={to} min={from} max={todayKey()} onChange={(event) => setTo(event.target.value)} /></label>
          </div>
        )}
        {data && <span className={styles.rangeLabel}>{data.range.label} · comparado com o período anterior</span>}
      </div>

      {data?.scope === 'mine' && <p className={styles.scopeNote}><Users size={15} /> Você está vendo os números dos <strong>seus</strong> leads e conversas.</p>}
      {error && <div className={styles.errorBox}><AlertTriangle size={16} /> {error}</div>}
      {!data && !error && <div className={styles.loadingBox}>{period === 'custom' && !from ? 'Escolha a data inicial.' : 'Calculando os números…'}</div>}

      {data && (
        <div className={`${styles.content} ${loading ? styles.reloading : ''}`}>
          <section className={styles.kpiGrid} aria-label="Indicadores principais">
            <Kpi icon={UserPlus} color={blue} label="Novos leads" value={number(data.leads.new)} delta={<Delta value={change(data.leads.new, data.leads.newPrev)} />} hint={conversion !== null ? `${conversion.toFixed(0)}% já viraram venda` : undefined} />
            <Kpi icon={Trophy} color="#10b981" label="Vendas fechadas" value={number(data.sales.won)} delta={<Delta value={change(data.sales.won, data.sales.wonPrev)} />} hint={data.sales.won ? `ticket médio ${currency(data.sales.revenue / data.sales.won, true)}` : 'leads que foram para Ganhos'} />
            <Kpi icon={CircleDollarSign} color="#10b981" label="Receita" value={currency(data.sales.revenue, true)} delta={<Delta value={change(data.sales.revenue, data.sales.revenuePrev)} />} hint={`${currency(data.leads.openValue, true)} em aberto no funil`} />
            <Kpi icon={MessageSquare} color={blue} label="Conversas" value={number(data.messages.conversations)} delta={<Delta value={change(data.messages.conversations, data.messages.conversationsPrev)} />} hint={`${number(data.messages.received)} mensagens recebidas`} />
            <Kpi icon={Clock} color={orange} label="1ª resposta (mediana)" value={formatMinutes(data.responses.medianAny)} delta={<Delta value={data.responses.medianAny !== null && data.responsesPrev.medianAny ? change(data.responses.medianAny, data.responsesPrev.medianAny) : null} invert />} hint={data.responses.turns ? `${percent(data.responses.within5, data.responses.turns)} respondidas em até 5 min` : 'sem conversas no período'} />
            <Kpi icon={Hourglass} color={data.waiting.over1h ? '#ef4444' : aqua} label="Esperando resposta agora" value={number(data.waiting.count)} hint={data.waiting.over1h ? `${data.waiting.over1h} há mais de 1 hora` : 'ninguém esperando há mais de 1 hora'} />
          </section>

          <div className={styles.rowWide}>
            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <h2><MessageSquare size={18} /> Mensagens</h2>
                <span>{data.daily.length > 62 ? 'por semana' : 'por dia'}</span>
              </div>
              <div className={styles.chartBox}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartDaily} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--track)" vertical={false} />
                    <XAxis dataKey="label" tick={axis} stroke="var(--track)" minTickGap={18} />
                    <YAxis tick={axis} stroke="var(--track)" allowDecimals={false} />
                    <Tooltip contentStyle={{ borderRadius: 12, fontSize: 13, background: 'var(--tooltip-bg)', border: '1px solid var(--card-border)', color: 'var(--foreground)' }} cursor={{ stroke: 'var(--muted)', strokeWidth: 1 }} />
                    <Legend wrapperStyle={{ fontSize: 13 }} />
                    <Area type="monotone" name="Recebidas" dataKey="received" stroke={blue} strokeWidth={2} fill={blue} fillOpacity={0.12} />
                    <Area type="monotone" name="Enviadas" dataKey="sent" stroke={orange} strokeWidth={2} fill={orange} fillOpacity={0.1} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <h2><Users size={18} /> Quem respondeu</h2>
                <span>{number(data.messages.sent)} enviadas</span>
              </div>
              {sentByKind.length === 0 ? (
                <p className={styles.mutedText}>Nenhuma mensagem enviada no período.</p>
              ) : (
                <ul className={styles.barList}>
                  {sentByKind.map((item) => (
                    <li key={item.kind}>
                      <div className={styles.barLine}>
                        <span><i style={{ background: kindColor(item.kind, theme) }} /> {KIND_LABEL[item.kind]}</span>
                        <strong>{number(item.count)} <small>{percent(item.count, data.messages.sent)}</small></strong>
                      </div>
                      <div className={styles.barTrack}><b style={{ width: `${(item.count / maxKind) * 100}%`, background: kindColor(item.kind, theme) }} /></div>
                    </li>
                  ))}
                </ul>
              )}
              <div className={styles.miniStats}>
                <div><span>Respondidas</span><strong>{percent(data.responses.answered, data.responses.turns)}</strong></div>
                <div title="Mediana do tempo até alguém da equipe responder"><span>Resposta da equipe</span><strong>{formatMinutes(data.responses.medianHuman)}</strong></div>
                <div><span><Phone size={12} /> Ligações</span><strong>{number(data.calls.count)}</strong></div>
              </div>
            </section>
          </div>

          <div className={styles.rowHalf}>
            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <h2><Flame size={18} /> Quando os clientes chamam</h2>
                <span>mensagens recebidas · dia × horário</span>
              </div>
              {heat.max === 0 ? (
                <p className={styles.mutedText}>Nenhuma mensagem recebida no período.</p>
              ) : (
                <div className={styles.heatmap} style={{ '--slots': 12 } as React.CSSProperties}>
                  <span />
                  {Array.from({ length: 12 }, (_, slot) => <span key={slot} className={styles.heatLabel}>{slot % 2 === 0 ? `${slot * 2}h` : ''}</span>)}
                  {WEEKDAYS.map((day, dayIndex) => (
                    <React.Fragment key={day}>
                      <span className={styles.heatDay}>{day}</span>
                      {heat.grid[dayIndex].map((value, slot) => (
                        <span
                          key={slot}
                          className={styles.heatCell}
                          style={{ '--heat': heat.max ? value / heat.max : 0, '--heat-color': blue } as React.CSSProperties}
                          title={`${day}, ${slot * 2}h–${slot * 2 + 2}h: ${value} ${value === 1 ? 'mensagem' : 'mensagens'}`}
                          tabIndex={0}
                        />
                      ))}
                    </React.Fragment>
                  ))}
                </div>
              )}
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <h2><Hourglass size={18} /> Esperando resposta</h2>
                <span>a última mensagem é do cliente</span>
              </div>
              {data.waiting.oldest.length === 0 ? (
                <p className={styles.mutedText}>Nenhum cliente esperando. 🎉</p>
              ) : (
                <ul className={styles.waitList}>
                  {data.waiting.oldest.map((item) => (
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
              {data.waiting.count > data.waiting.oldest.length && <Link href="/messages" className={styles.panelLink}>Ver todas em Mensagens ({data.waiting.count})</Link>}
            </section>
          </div>

          <div className={styles.rowWide}>
            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <h2><Trophy size={18} /> Novos leads e vendas</h2>
                <span>{data.daily.length > 62 ? 'por semana' : 'por dia'} · vendas pela data em que foram para Ganhos</span>
              </div>
              <div className={styles.chartBox}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartDaily} margin={{ top: 8, right: 8, left: -16, bottom: 0 }} barGap={2}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--track)" vertical={false} />
                    <XAxis dataKey="label" tick={axis} stroke="var(--track)" minTickGap={18} />
                    <YAxis tick={axis} stroke="var(--track)" allowDecimals={false} />
                    <Tooltip contentStyle={{ borderRadius: 12, fontSize: 13, background: 'var(--tooltip-bg)', border: '1px solid var(--card-border)', color: 'var(--foreground)' }} cursor={{ fill: 'var(--track)' }} />
                    <Legend wrapperStyle={{ fontSize: 13 }} />
                    <Bar name="Novos leads" dataKey="newLeads" fill={blue} radius={[4, 4, 0, 0]} maxBarSize={18} />
                    <Bar name="Vendas" dataKey="won" fill={aqua} radius={[4, 4, 0, 0]} maxBarSize={18} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <h2>Funil agora</h2>
                <span>{number(data.leads.open)} em aberto</span>
              </div>
              <ul className={styles.barList}>
                {data.funnel.map((stage) => (
                  <li key={stage.id}>
                    <div className={styles.barLine}>
                      <span><i style={{ background: stage.color }} /> {stage.name}</span>
                      <strong>{number(stage.count)} <small>{stage.value ? currency(stage.value, true) : ''}</small></strong>
                    </div>
                    <div className={styles.barTrack}><b style={{ width: `${(stage.count / maxFunnel) * 100}%`, background: stage.color }} /></div>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <h2>Origem dos leads</h2>
              <span>leads que entraram no período e quantos já viraram venda</span>
            </div>
            {data.sources.length === 0 ? (
              <p className={styles.mutedText}>Nenhum lead novo no período.</p>
            ) : (
              <ul className={`${styles.barList} ${styles.sourceGrid}`}>
                {data.sources.slice(0, 10).map((source) => (
                  <li key={source.source}>
                    <div className={styles.barLine}>
                      <span>{source.source}</span>
                      <strong>{number(source.total)} <small>{source.won} {source.won === 1 ? 'venda' : 'vendas'} · {percent(source.won, source.total)}</small></strong>
                    </div>
                    <div className={styles.barTrack}><b style={{ width: `${(source.total / maxSource) * 100}%`, background: blue }} /></div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {data.team && (
            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <h2><Users size={18} /> Equipe</h2>
                <span>ordenado por receita no período</span>
              </div>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Pessoa</th>
                      <th>Leads abertos</th>
                      <th>Novos</th>
                      <th>Conversas</th>
                      <th>Mensagens</th>
                      <th>1ª resposta</th>
                      <th>Vendas</th>
                      <th>Receita</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.team.map((member) => (
                      <tr key={member.id}>
                        <td><strong>{member.name}</strong><small>{member.role === 'ADMIN' ? 'Admin' : member.role === 'MANAGER' ? 'Gerente' : 'Vendedor'}</small></td>
                        <td>{number(member.openLeads)}</td>
                        <td>{number(member.newLeads)}</td>
                        <td>{number(member.conversations)}</td>
                        <td>{number(member.messages)}</td>
                        <td title={member.firstResponses ? `${member.firstResponses} primeiras respostas` : undefined}>{formatMinutes(member.medianResponse)}</td>
                        <td>{number(member.won)}</td>
                        <td><strong>{currency(member.revenue, true)}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className={styles.mutedText}>1ª resposta: mediana do tempo até a pessoa responder quando o cliente puxa conversa (tempo corrido, inclusive fora do expediente). Respostas pelo celular entram no total da empresa, mas não aparecem por pessoa.</p>
            </section>
          )}

          {(automations || campaigns) && (
            <div className={styles.rowHalf}>
              {automations && (
                <section className={styles.panel}>
                  <div className={styles.panelHeader}>
                    <h2><Workflow size={18} /> Automações e IA</h2>
                    <Link href="/automations" className={styles.panelLink}>Abrir</Link>
                  </div>
                  <div className={styles.statGrid}>
                    <div><span><Bot size={13} /> Conversas com a IA</span><strong>{number(automations.ai.conversations)}</strong></div>
                    <div><span>Respostas da IA</span><strong>{number(automations.ai.replies)}</strong></div>
                    <div><span>Resolvidas sem a equipe</span><strong>{number(automations.ai.resolved)}</strong></div>
                    <div><span>Passadas para a equipe</span><strong>{number(automations.ai.handoffs)}</strong></div>
                  </div>
                  <div className={styles.chips}>
                    <span>{number(automations.runs)} execuções</span>
                    {Object.entries(automations.byStatus).map(([status, count]) => (
                      <span key={status} data-tone={status === 'failed' ? 'bad' : status === 'completed' ? 'good' : undefined}>{count} {STATUS_LABEL[status]?.toLowerCase() || status}</span>
                    ))}
                  </div>
                  {automations.flows.length === 0 ? (
                    <p className={styles.mutedText}>Nenhuma automação rodou no período.</p>
                  ) : (
                    <ul className={styles.rankList}>
                      {automations.flows.map((flow) => (
                        <li key={flow.id}>
                          <span>{flow.name}</span>
                          <strong>{number(flow.runs)}</strong>
                          {flow.failed > 0 && <em>{flow.failed} com erro</em>}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}
              {campaigns && (
                <section className={styles.panel}>
                  <div className={styles.panelHeader}>
                    <h2><Megaphone size={18} /> Disparos</h2>
                    <Link href="/disparos" className={styles.panelLink}>Abrir</Link>
                  </div>
                  <div className={styles.statGrid}>
                    <div><span>Campanhas</span><strong>{number(campaigns.count)}</strong></div>
                    <div><span>Enviadas</span><strong>{number(campaigns.sent)}</strong></div>
                    <div><span>Responderam</span><strong>{number(campaigns.replied)} <small>{percent(campaigns.replied, campaigns.sent)}</small></strong></div>
                    <div><span>Pediram para sair</span><strong>{number(campaigns.optouts)}</strong></div>
                  </div>
                  {campaigns.top.length === 0 ? (
                    <p className={styles.mutedText}>Nenhuma campanha no período.</p>
                  ) : (
                    <ul className={styles.rankList}>
                      {campaigns.top.map((campaign) => (
                        <li key={campaign.id}>
                          <Link href={`/disparos/${campaign.id}`}>{campaign.name}</Link>
                          <strong>{number(campaign.sent)}</strong>
                          <em data-tone="good">{percent(campaign.replied, campaign.sent)} resp.</em>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
