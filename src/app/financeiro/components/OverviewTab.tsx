'use client';

import React, { useMemo } from 'react';
import {
  Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  AlertTriangle, CircleDollarSign, Lightbulb, PiggyBank, Scale, Store, Target, TrendingUp, Trophy,
} from 'lucide-react';
import styles from '../financeiro.module.css';
import { MonthPicker, marginTone, pricingBase, type TabProps } from './shared';
import {
  buildCostContext, computeMonthResult, computeProductCost, fixedCostsForMonth, formatMoney, formatPct, formatQty, priceForChannel,
} from '@/lib/finance/calc';
import type { FinSale } from '@/lib/finance/types';

interface Props extends TabProps {
  month: string;
  onMonthChange: (month: string) => void;
  sales: FinSale[] | null;
  onNavigate: (tab: string) => void;
}

const compact = (value: number) =>
  Math.abs(value) >= 1000 ? `${(value / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : value.toLocaleString('pt-BR', { maximumFractionDigits: 0 });

export default function OverviewTab({ workspace, month, onMonthChange, sales, onNavigate }: Props) {
  const { products, ingredients, settings, channels, fixedCosts, business } = workspace;
  const terms = business.terms;

  const result = useMemo(() => {
    const fixed = fixedCostsForMonth(fixedCosts, month);
    return computeMonthResult(sales || [], fixed, month, {
      products: new Map(products.map((product) => [product.id, product.name])),
      channels: new Map(channels.map((channel) => [channel.id, channel.name])),
    });
  }, [sales, fixedCosts, month, products, channels]);

  // Alertas a partir das fichas: produto com prejuízo, abaixo da meta ou sem preço.
  const alerts = useMemo(() => {
    const { fixedPct, base } = pricingBase(workspace, month);
    const ctx = buildCostContext(products, ingredients, settings);
    const main = channels.find((channel) => channel.active);
    const list: { tone: 'bad' | 'warn' | 'info'; text: string; tab: string }[] = [];
    for (const product of products.filter((item) => item.kind === 'product' && item.active)) {
      const cost = computeProductCost(product, ctx);
      if (cost.warnings.length > 0) list.push({ tone: 'warn', text: `${product.name}: cadastro com pendências (${cost.warnings[0]})`, tab: 'products' });
      if (!main) continue;
      const pricing = priceForChannel(product, cost.unitCost, main, settings, fixedPct);
      const target = product.target_margin_pct ?? settings.target_margin_pct;
      if (product.sale_price <= 0) {
        list.push({ tone: 'info', text: `${product.name}: sem preço de venda${pricing.roundedPrice ? ` (sugerido ${formatMoney(pricing.roundedPrice)})` : ''}`, tab: 'products' });
      } else if (pricing.analysis && pricing.analysis.netProfit < 0) {
        list.push({ tone: 'bad', text: `${product.name}: dá prejuízo de ${formatMoney(-pricing.analysis.netProfit)} por unidade a ${formatMoney(product.sale_price)}`, tab: 'products' });
      } else if (pricing.analysis && pricing.analysis.netMarginPct < target) {
        list.push({ tone: 'warn', text: `${product.name}: margem de ${formatPct(pricing.analysis.netMarginPct)}, abaixo da meta de ${formatPct(target, 0)}`, tab: 'products' });
      }
    }
    if (fixedCosts.length === 0) list.push({ tone: 'info', text: 'Cadastre as despesas fixas (aluguel, luz, salários) para calcular o lucro de verdade.', tab: 'costs' });
    else if (base.value <= 0) list.push({ tone: 'info', text: 'Informe o faturamento esperado para ratear as despesas fixas no preço.', tab: 'costs' });
    const weight = { bad: 0, warn: 1, info: 2 };
    return list.sort((a, b) => weight[a.tone] - weight[b.tone]).slice(0, 8);
  }, [workspace, month, products, ingredients, settings, channels, fixedCosts]);

  const hasSales = (sales?.length || 0) > 0;
  // Mês corrente: a linha para no dia de hoje (dias futuros ainda não aconteceram).
  const todayKey = new Date().toLocaleDateString('sv-SE');
  const chartData = result.daily.map((day) => ({
    ...day,
    label: day.day.slice(8),
    cumulativeProfit: day.day > todayKey ? null : day.cumulativeProfit,
  }));
  const waterfall = [
    { label: 'Faturamento', value: result.revenue, color: '#3b82f6' },
    { label: 'Custo dos produtos', value: -result.cmv, color: '#f97316' },
    { label: 'Taxas e comissões', value: -result.fees, color: '#eab308' },
    { label: 'Impostos', value: -result.taxes, color: '#a855f7' },
    { label: 'Despesas fixas', value: -result.fixed, color: '#ef4444' },
  ];
  const scale = Math.max(result.revenue, result.fixed, 1);

  return (
    <>
      {!business.type && workspace.access.canManage && (
        <div className={styles.setupBanner}>
          <div>
            <strong>Qual é o seu ramo?</strong>
            <span>Escolha o modelo do seu negócio (loja, serviços, restaurante, indústria...) para os nomes, tipos e exemplos ficarem do seu jeito.</span>
          </div>
          <button className={styles.primaryButton} onClick={() => onNavigate('business')}>Escolher o ramo</button>
        </div>
      )}
      <div className={styles.panelHeader} style={{ marginBottom: 0 }}>
        <h2 style={{ fontSize: '1.2rem' }}>Resultado do mês</h2>
        <MonthPicker month={month} onChange={onMonthChange} />
      </div>

      <div className={styles.kpis}>
        <div className={styles.kpi} style={{ '--kpi-color': '#3b82f6' } as React.CSSProperties}>
          <span className={styles.kpiLabel}><CircleDollarSign size={16} /> Faturamento</span>
          <span className={styles.kpiValue}>{formatMoney(result.revenue)}</span>
          <span className={styles.kpiFoot}>{result.salesCount} venda(s) · ticket médio {formatMoney(result.averageTicket)}</span>
        </div>
        <div className={styles.kpi} style={{ '--kpi-color': result.netProfit < 0 ? '#ef4444' : '#10b981' } as React.CSSProperties}>
          <span className={styles.kpiLabel}><PiggyBank size={16} /> Lucro líquido</span>
          <span className={`${styles.kpiValue} ${result.netProfit < 0 ? styles.bad : styles.good}`}>{formatMoney(result.netProfit)}</span>
          <span className={styles.kpiFoot}>{hasSales ? `${formatPct(result.netMarginPct)} do faturamento` : 'registre vendas para ver o lucro'}</span>
        </div>
        <div className={styles.kpi} style={{ '--kpi-color': '#8b5cf6' } as React.CSSProperties}>
          <span className={styles.kpiLabel}><TrendingUp size={16} /> Margem de contribuição</span>
          <span className={styles.kpiValue}>{formatPct(result.contributionPct)}</span>
          <span className={styles.kpiFoot}>{formatMoney(result.contribution)} para pagar as despesas fixas</span>
        </div>
        <div className={styles.kpi} style={{ '--kpi-color': '#f59e0b' } as React.CSSProperties}>
          <span className={styles.kpiLabel}><Scale size={16} /> Ponto de equilíbrio</span>
          <span className={styles.kpiValue}>{result.breakEvenRevenue !== null ? formatMoney(result.breakEvenRevenue) : '—'}</span>
          {result.breakEvenProgress !== null ? (
            <>
              <div className={styles.progress}><div style={{ width: `${result.breakEvenProgress}%`, background: result.breakEvenProgress >= 100 ? 'var(--good)' : 'var(--warn)' }} /></div>
              <span className={styles.kpiFoot}>
                {result.breakEvenProgress >= 100 ? 'Despesas do mês pagas — daqui pra frente é lucro' : `Faltam ${formatMoney(Math.max(0, (result.breakEvenRevenue || 0) - result.revenue))} em vendas`}
              </span>
            </>
          ) : (
            <span className={styles.kpiFoot}>faturamento mínimo para não ter prejuízo</span>
          )}
        </div>
      </div>

      <div className={styles.grid3}>
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2><TrendingUp size={18} /> Vendas por dia e lucro acumulado</h2>
          </div>
          <p className={styles.panelHint}>A linha verde começa em −{formatMoney(result.fixed)} (despesas fixas do mês) e sobe com o que sobra de cada venda. Quando cruza o zero, o mês se pagou.</p>
          <div className={styles.chartBox}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.2)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} interval={2} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} tickFormatter={compact} width={56} />
                <Tooltip
                  formatter={(value, name) => [formatMoney(Number(value)), name === 'revenue' ? 'Vendas do dia' : 'Lucro acumulado']}
                  labelFormatter={(label) => `Dia ${label}`}
                  contentStyle={{ borderRadius: 12, border: '1px solid rgba(148,163,184,0.3)', background: 'var(--background)', color: 'var(--foreground)' }}
                />
                <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="4 4" />
                <Bar dataKey="revenue" fill="#3b82f6" radius={[6, 6, 0, 0]} maxBarSize={18} />
                <Line dataKey="cumulativeProfit" type="monotone" stroke="#10b981" strokeWidth={2.5} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2><Target size={18} /> Para onde foi o dinheiro</h2>
          </div>
          <div className={styles.waterfall}>
            {waterfall.map((row) => (
              <div key={row.label} className={styles.waterRow}>
                <span>{row.label}</span>
                <div className={styles.waterTrack}><div style={{ width: `${(Math.abs(row.value) / scale) * 100}%`, background: row.color }} /></div>
                <strong>{formatMoney(row.value)}</strong>
              </div>
            ))}
            <div className={`${styles.waterRow} ${styles.waterTotal}`}>
              <span>= Lucro líquido</span>
              <div className={styles.waterTrack}><div style={{ width: `${(Math.abs(result.netProfit) / scale) * 100}%`, background: result.netProfit < 0 ? '#ef4444' : '#10b981' }} /></div>
              <strong className={result.netProfit < 0 ? styles.bad : styles.good}>{formatMoney(result.netProfit)}</strong>
            </div>
          </div>
        </section>
      </div>

      <div className={styles.grid2}>
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2><Trophy size={18} /> O que mais deu lucro</h2>
          </div>
          {result.byProduct.length === 0 ? (
            <div className={styles.empty}>Sem vendas neste mês.</div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr><th>Produto</th><th className={styles.num}>Qtd.</th><th className={styles.num}>Vendas</th><th className={styles.num}>Contribuição</th><th className={styles.num}>Margem</th></tr>
                </thead>
                <tbody>
                  {result.byProduct.slice(0, 8).map((row) => (
                    <tr key={row.id}>
                      <td><strong>{row.name}</strong></td>
                      <td className={styles.num}>{formatQty(row.quantity)}</td>
                      <td className={styles.num}>{formatMoney(row.revenue)}</td>
                      <td className={`${styles.num} ${row.contribution < 0 ? styles.bad : ''}`}>{formatMoney(row.contribution)}</td>
                      <td className={styles.num}><span className={`${styles.tag} ${marginTone(row.marginPct, settings.target_margin_pct)}`}>{formatPct(row.marginPct)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2><Store size={18} /> Por canal</h2>
          </div>
          {result.byChannel.length === 0 ? (
            <div className={styles.empty}>Sem vendas neste mês.</div>
          ) : (
            <div className={styles.waterfall}>
              {result.byChannel.map((row) => (
                <div key={row.id} className={styles.waterRow}>
                  <span>{row.name}</span>
                  <div className={styles.waterTrack}><div style={{ width: `${(row.revenue / Math.max(result.revenue, 1)) * 100}%`, background: '#3b82f6' }} /></div>
                  <strong>{formatMoney(row.revenue)}</strong>
                </div>
              ))}
              <p className={styles.panelHint} style={{ margin: '6px 0 0' }}>
                Sobra por canal (depois de custo, taxas e impostos): {result.byChannel.map((row) => `${row.name} ${row.revenue > 0 ? formatPct((row.contribution / row.revenue) * 100, 0) : '—'}`).join(' · ')}
              </p>
            </div>
          )}

          <div className={styles.panelHeader} style={{ marginTop: 22 }}>
            <h2><Lightbulb size={18} /> Atenção</h2>
          </div>
          {alerts.length === 0 ? (
            <p className={styles.muted} style={{ fontSize: '0.88rem', margin: 0 }}>Tudo certo: {terms.products.toLowerCase()} completos e com margem dentro da meta.</p>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {alerts.map((alert) => (
                <li key={alert.text}>
                  <button
                    className={`${styles.tag} ${alert.tone === 'bad' ? styles.tagBad : alert.tone === 'warn' ? styles.tagWarn : ''}`}
                    style={{ whiteSpace: 'normal', textAlign: 'left', cursor: 'pointer', padding: '7px 11px', fontSize: '0.8rem', fontWeight: 500, background: undefined }}
                    onClick={() => onNavigate(alert.tab)}
                  >
                    <AlertTriangle size={13} style={{ flex: 'none' }} /> {alert.text}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
