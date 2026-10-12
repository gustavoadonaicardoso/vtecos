'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, Ban, CalendarClock, CircleDollarSign, ExternalLink, Loader2, Percent, RefreshCw, Rocket, TrendingUp, Users } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import styles from '../master.module.css';
import local from './SalesTab.module.css';
import { useTheme } from '@/components/ThemeProvider';
import { seriesColor } from '@/lib/reports';
import { BILLING_TYPE_LABEL, type SalesDashboard } from '@/lib/sales-dashboard';

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: value % 1 ? 2 : 0 });
const compact = (value: number) => (value >= 1000 ? `R$ ${(value / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : `R$ ${value.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`);
const brDate = (date: string | null) => (date ? `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}` : '—');
/** Eixo: só o número (o título diz que é R$), curto para não quebrar linha. */
const axisMoney = (value: number) => (value >= 1000 ? `${(value / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : value.toLocaleString('pt-BR'));
const legendText = (value: string) => <span style={{ color: 'var(--foreground)' }}>{value}</span>;
const tooltipStyle = { borderRadius: 12, fontSize: 13, background: 'var(--tooltip-bg, var(--glass-bg))', border: '1px solid var(--card-border)', color: 'var(--foreground)' };

function Tile({ icon: Icon, label, value, caption, tone }: { icon: React.ComponentType<{ size?: number }>; label: string; value: string; caption: React.ReactNode; tone?: 'warn' }) {
  return (
    <div className={`${local.tile} ${tone === 'warn' ? local.tileWarn : ''}`}>
      <span className={local.tileLabel}><Icon size={15} /> {label}</span>
      <strong className={local.tileValue}>{value}</strong>
      <span className={local.tileCaption}>{caption}</span>
    </div>
  );
}

/** Painel Master > Vendas: a Vórtice como empresa de software. */
export default function SalesTab() {
  const { theme } = useTheme();
  const [data, setData] = useState<SalesDashboard | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/master/sales', { cache: 'no-store' });
      const json = await response.json().catch(() => ({}));
      if (response.ok) {
        setData(json.data);
        setError('');
      } else setError(json.error || 'Não foi possível carregar os números.');
    } catch {
      setError('Sem conexão com o servidor.');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(load, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const blue = seriesColor(0, theme);
  const orange = seriesColor(1, theme);
  const overdueTotal = data ? data.overdue.pastDue.value + data.overdue.suspended.value : 0;
  const maxPlan = data ? Math.max(1, ...data.byPlan.map((plan) => plan.mrr)) : 1;

  return (
    <motion.div key="sales" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} className={styles.grid}>
      <div className={`${styles.cardWide} ${local.head}`}>
        <div>
          <h2 className={local.title}><TrendingUp size={20} /> Vendas da Vórtice</h2>
          <p className={local.sub}>
            Receita recorrente, testes grátis e cobrança das empresas clientes.
            {data && <> Atualizado às {new Date(data.generatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.</>}
          </p>
        </div>
        <button type="button" className={styles.resetBtn} onClick={load} disabled={loading} aria-label="Atualizar números">
          {loading ? <Loader2 size={15} className={styles.spin} /> : <RefreshCw size={15} />} Atualizar
        </button>
      </div>

      {error && <div className={`${styles.errorBanner} ${styles.cardWide}`}><AlertTriangle size={16} /> {error}</div>}
      {!data && !error && <p className={`${styles.cardWide} ${styles.hint}`}><Loader2 size={15} className={styles.spin} /> Calculando…</p>}

      {data && (
        <>
          <section className={`${styles.cardWide} ${local.tiles}`} aria-label="Indicadores">
            <Tile icon={CircleDollarSign} label="Receita recorrente (MRR)" value={money(data.mrr.total)} caption={<>Por ano: {compact(data.mrr.arr)}{data.mrr.manual > 0 && <> · {money(data.mrr.manual)} em cobrança manual</>}</>} />
            <Tile icon={Users} label="Clientes pagantes" value={String(data.mrr.paying)} caption={data.mrr.avgTicket !== null ? <>Ticket médio {money(data.mrr.avgTicket)}/mês</> : 'Nenhum cliente pagante ainda'} />
            <Tile icon={Rocket} label="Testes em andamento" value={String(data.trials.active)} caption={data.trials.endingSoon ? <>{data.trials.endingSoon} termina{data.trials.endingSoon === 1 ? '' : 'm'} em até 2 dias</> : 'Nenhum terminando nos próximos 2 dias'} />
            <Tile icon={Percent} label="Conversão do teste" value={data.conversion.rate === null ? '—' : `${data.conversion.rate.toLocaleString('pt-BR')}%`} caption={data.conversion.ended ? <>{data.conversion.converted} de {data.conversion.ended} testes que terminaram nos últimos {data.conversion.windowDays} dias</> : `Nenhum teste terminou nos últimos ${data.conversion.windowDays} dias`} />
            <Tile icon={CalendarClock} label="Recebido no mês" value={money(data.receivedThisMonth)} caption="Pagamentos avisados pelo Asaas" />
            <Tile
              icon={AlertTriangle}
              label="Inadimplência"
              value={money(overdueTotal)}
              tone={overdueTotal > 0 ? 'warn' : undefined}
              caption={<>{data.overdue.pastDue.count} em atraso · {data.overdue.suspended.count} suspensa{data.overdue.suspended.count === 1 ? '' : 's'} · {data.canceled.count} cancelada{data.canceled.count === 1 ? '' : 's'}</>}
            />
          </section>

          <div className={styles.card}>
            <h3 className={local.cardTitle}>Recebido por mês (R$)</h3>
            <div className={local.chart} role="img" aria-label={`Recebido por mês: ${data.months.map((month) => `${month.label} ${money(month.received)}`).join(', ')}`}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.months} margin={{ top: 12, right: 8, left: -8, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(148, 163, 184, 0.18)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="currentColor" opacity={0.6} tickLine={false} />
                  <YAxis tick={{ fontSize: 12 }} stroke="currentColor" opacity={0.6} tickLine={false} axisLine={false} width={56} tickFormatter={axisMoney} />
                  <Tooltip cursor={{ fill: 'rgba(148, 163, 184, 0.12)' }} contentStyle={tooltipStyle} formatter={(value) => [money(Number(value)), 'Recebido']} />
                  <Bar dataKey="received" name="Recebido" fill={blue} radius={[4, 4, 0, 0]} maxBarSize={36} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <details className={local.tableToggle}>
              <summary>Ver em tabela</summary>
              <table className={local.table}>
                <thead><tr><th>Mês</th><th className={local.num}>Recebido</th></tr></thead>
                <tbody>{data.months.map((month) => <tr key={month.month}><td>{month.label}</td><td className={local.num}>{money(month.received)}</td></tr>)}</tbody>
              </table>
            </details>
          </div>

          <div className={styles.card}>
            <h3 className={local.cardTitle}>Testes grátis por mês</h3>
            <div className={local.chart} role="img" aria-label={`Testes por mês: ${data.months.map((month) => `${month.label} ${month.trialsStarted} iniciados e ${month.trialsConverted} convertidos`).join(', ')}`}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.months} margin={{ top: 12, right: 8, left: -18, bottom: 0 }} barGap={2}>
                  <CartesianGrid stroke="rgba(148, 163, 184, 0.18)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="currentColor" opacity={0.6} tickLine={false} />
                  <YAxis tick={{ fontSize: 12 }} stroke="currentColor" opacity={0.6} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip cursor={{ fill: 'rgba(148, 163, 184, 0.12)' }} contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 13 }} iconType="circle" formatter={legendText} />
                  <Bar dataKey="trialsStarted" name="Começaram o teste" fill={blue} radius={[4, 4, 0, 0]} maxBarSize={22} />
                  <Bar dataKey="trialsConverted" name="Viraram assinantes" fill={orange} radius={[4, 4, 0, 0]} maxBarSize={22} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <details className={local.tableToggle}>
              <summary>Ver em tabela</summary>
              <table className={local.table}>
                <thead><tr><th>Mês</th><th className={local.num}>Começaram</th><th className={local.num}>Assinaram</th></tr></thead>
                <tbody>{data.months.map((month) => <tr key={month.month}><td>{month.label}</td><td className={local.num}>{month.trialsStarted}</td><td className={local.num}>{month.trialsConverted}</td></tr>)}</tbody>
              </table>
            </details>
          </div>

          <div className={`${styles.card} ${styles.cardWide}`}>
            <h3 className={local.cardTitle}>Testes em andamento</h3>
            {data.trials.list.length === 0 ? (
              <p className={styles.hint}>Nenhuma empresa no teste grátis agora.</p>
            ) : (
              <div className={local.scroll}>
                <table className={local.table}>
                  <thead><tr><th>Empresa</th><th>Plano</th><th>Termina em</th><th>Primeiros passos</th></tr></thead>
                  <tbody>
                    {data.trials.list.map((trial) => (
                      <tr key={trial.id}>
                        <td><strong>{trial.name}</strong></td>
                        <td>{trial.plan || '—'}</td>
                        <td>
                          {brDate(trial.endsOn)}{' '}
                          {trial.daysLeft <= 2
                            ? <span className={`${local.chip} ${local.chipWarn}`}><AlertTriangle size={12} /> {trial.daysLeft <= 0 ? 'hoje' : `${trial.daysLeft} dia${trial.daysLeft === 1 ? '' : 's'}`}</span>
                            : <span className={local.muted}>({trial.daysLeft} dias)</span>}
                        </td>
                        <td>
                          {trial.onboardingTotal ? (
                            <span className={local.progressCell}>
                              <span className={local.progress} aria-hidden="true"><span style={{ width: `${(trial.onboardingDone! / trial.onboardingTotal) * 100}%` }} /></span>
                              {trial.onboardingDone} de {trial.onboardingTotal}
                            </span>
                          ) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className={styles.card}>
            <h3 className={local.cardTitle}>Em atraso e suspensas</h3>
            {data.overdue.list.length === 0 ? (
              <p className={styles.hint}>Nenhuma empresa com pagamento em atraso. 🎉</p>
            ) : (
              <div className={local.scroll}>
                <table className={local.table}>
                  <thead><tr><th>Empresa</th><th>Situação</th><th>Venceu em</th><th className={local.num}>Valor</th><th aria-label="Fatura" /></tr></thead>
                  <tbody>
                    {data.overdue.list.map((item) => (
                      <tr key={item.id}>
                        <td><strong>{item.name}</strong></td>
                        <td>
                          {item.status === 'suspended'
                            ? <span className={`${local.chip} ${local.chipBad}`}><Ban size={12} /> Suspensa</span>
                            : <span className={`${local.chip} ${local.chipWarn}`}><AlertTriangle size={12} /> Em atraso</span>}
                        </td>
                        <td>{brDate(item.since)}</td>
                        <td className={local.num}>{money(item.value)}</td>
                        <td>{item.invoiceUrl && <a href={item.invoiceUrl} target="_blank" rel="noreferrer" aria-label={`Fatura de ${item.name}`}><ExternalLink size={14} /></a>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {data.canceled.count > 0 && (
              <p className={local.footnote}>Canceladas: {data.canceled.list.map((item) => item.name).join(', ')}.</p>
            )}
          </div>

          <div className={styles.card}>
            <h3 className={local.cardTitle}>Receita por plano</h3>
            {data.byPlan.length === 0 ? (
              <p className={styles.hint}>Sem clientes pagantes ainda.</p>
            ) : (
              <table className={local.table}>
                <thead><tr><th>Plano</th><th className={local.num}>Clientes</th><th>MRR</th></tr></thead>
                <tbody>
                  {data.byPlan.map((plan) => (
                    <tr key={plan.plan}>
                      <td><strong>{plan.plan}</strong></td>
                      <td className={local.num}>{plan.customers}</td>
                      <td>
                        <span className={local.barCell}>
                          <span className={local.barTrack} aria-hidden="true"><span style={{ width: `${(plan.mrr / maxPlan) * 100}%`, background: blue }} /></span>
                          {money(plan.mrr)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className={`${styles.card} ${styles.cardWide}`}>
            <h3 className={local.cardTitle}>Últimos pagamentos</h3>
            {data.recentPayments.length === 0 ? (
              <p className={styles.hint}>Nenhum pagamento avisado pelo Asaas ainda. Os pagamentos aparecem aqui depois que o webhook do Asaas estiver ligado (Plataforma &gt; Cobrança automática).</p>
            ) : (
              <div className={local.scroll}>
                <table className={local.table}>
                  <thead><tr><th>Data</th><th>Empresa</th><th>Forma</th><th className={local.num}>Valor</th></tr></thead>
                  <tbody>
                    {data.recentPayments.map((payment, index) => (
                      <tr key={`${payment.paidAt}-${index}`}>
                        <td>{brDate(payment.paidAt)}</td>
                        <td>{payment.tenantName}</td>
                        <td>{payment.billingType ? BILLING_TYPE_LABEL[payment.billingType] || payment.billingType : '—'}</td>
                        <td className={local.num}>{money(payment.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className={local.footnote}>MRR: cobrança automática em dia ou em atraso (o anual conta como 1/12) + empresas de cobrança manual ativas pelo preço do plano. Testes grátis e suspensas não entram.</p>
          </div>
        </>
      )}
    </motion.div>
  );
}
