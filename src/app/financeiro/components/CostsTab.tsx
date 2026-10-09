'use client';

import React, { useMemo, useState } from 'react';
import {
  ArrowDown, ArrowUp, Check, ChevronDown, ChevronUp, Globe2, ListChecks, Loader2, Pencil, Plus, RefreshCw, Settings2, Store, Trash2, Wallet, X,
} from 'lucide-react';
import styles from '../financeiro.module.css';
import { currentMonth, finRequest, monthLabel, numText, toNum } from '../api';
import { pricingBase, refreshRates, type TabProps } from './shared';
import {
  CURRENCIES, currencyRate, fixedCostMonthly, formatCurrency, formatMoney, formatPct, missingRate,
} from '@/lib/finance/calc';
import { costCategoriesFor, labelsFor, presetFor, type CostSuggestion } from '@/lib/finance/business';
import type { FinChannel, FinCurrency, FinFixedCost, FinSettings } from '@/lib/finance/types';

type Recurrence = FinFixedCost['recurrence'];
interface CostDraft { id?: string; name: string; category: string; amount: string; currency: FinCurrency; recurrence: Recurrence; month: string; hint?: string }
interface ChannelDraft { id?: string; name: string; fee_pct: string; fixed_fee: string; extra_cost: string }
type SettingKey = Exclude<keyof FinSettings, 'fx_updated_at'>;

const RECURRENCE_LABEL: Record<Recurrence, string> = { monthly: 'por mês', yearly: 'por ano', once: 'uma vez' };
const plain = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

function settingsText(settings: FinSettings): Record<SettingKey, string> {
  return {
    tax_pct: numText(settings.tax_pct),
    commission_pct: numText(settings.commission_pct),
    target_margin_pct: numText(settings.target_margin_pct),
    labor_hour_cost: numText(settings.labor_hour_cost),
    expected_monthly_revenue: numText(settings.expected_monthly_revenue),
    usd_rate: settings.usd_rate > 0 ? numText(settings.usd_rate) : '',
    eur_rate: settings.eur_rate > 0 ? numText(settings.eur_rate) : '',
    fx_fee_pct: numText(settings.fx_fee_pct),
  };
}

export default function CostsTab({ workspace, tenantId, setWorkspace }: TabProps) {
  const { fixedCosts, channels, settings, access, business, ingredients } = workspace;
  const terms = business.terms;
  const labels = labelsFor(business);
  const preset = presetFor(business.type);
  const month = currentMonth();
  const { fixedMonthly, base, fixedPct } = useMemo(() => pricingBase(workspace, month), [workspace, month]);
  const [costDraft, setCostDraft] = useState<CostDraft | null>(null);
  const [channelDraft, setChannelDraft] = useState<ChannelDraft | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<Record<SettingKey, string>>(() => settingsText(settings));
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(() => fixedCosts.length < 3);
  const [fxBusy, setFxBusy] = useState(false);
  const [fxNote, setFxNote] = useState('');
  const [error, setError] = useState('');

  const recurring = fixedCosts.filter((cost) => cost.recurrence !== 'once');
  const once = fixedCosts.filter((cost) => cost.recurrence === 'once').sort((a, b) => (b.month || '').localeCompare(a.month || ''));
  const foreignInUse = [...fixedCosts, ...ingredients].filter((item) => item.currency !== 'BRL');
  const ratesMissing = foreignInUse.some((item) => missingRate(item.currency, settings));

  // Fixas agrupadas por categoria, da que mais pesa para a que menos pesa.
  const groups = useMemo(() => {
    const map = new Map<string, { items: FinFixedCost[]; total: number }>();
    for (const cost of recurring) {
      const entry = map.get(cost.category) || { items: [], total: 0 };
      entry.items.push(cost);
      if (cost.active) entry.total += fixedCostMonthly(cost, settings);
      map.set(cost.category, entry);
    }
    for (const entry of map.values()) entry.items.sort((a, b) => fixedCostMonthly(b, settings) - fixedCostMonthly(a, settings));
    return [...map.entries()].sort((a, b) => b[1].total - a[1].total);
  }, [recurring, settings]);

  const categories = Array.from(new Set([...costCategoriesFor(business.type), ...fixedCosts.map((cost) => cost.category)]));
  const registered = new Set(fixedCosts.map((cost) => plain(cost.name)));
  const suggestions = (preset.costSuggestions || []).filter((item) => !registered.has(plain(item.name)));
  const foreignTotal = recurring.filter((cost) => cost.active && cost.currency !== 'BRL').reduce((sum, cost) => sum + fixedCostMonthly(cost, settings), 0);
  const yearlyCount = recurring.filter((cost) => cost.active && cost.recurrence === 'yearly').length;

  const fail = (err: unknown) => setError(err instanceof Error ? err.message : 'Erro ao salvar.');

  // ── Cotação ──
  const updateRates = async (silent = false) => {
    setFxBusy(true);
    try {
      const result = await refreshRates(tenantId, setWorkspace);
      setSettingsDraft((state) => ({ ...state, usd_rate: numText(result.settings.usd_rate), eur_rate: numText(result.settings.eur_rate) }));
      setFxNote(`Cotação ${result.source}${result.date ? ` de ${result.date.split('-').reverse().join('/')}` : ''}.`);
      if (!silent) setError('');
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível buscar a cotação.');
      return false;
    } finally {
      setFxBusy(false);
    }
  };

  // ── Despesas ──
  const startCost = (suggestion?: CostSuggestion) => setCostDraft(suggestion
    ? { name: suggestion.name, category: suggestion.category, amount: '', currency: suggestion.currency, recurrence: suggestion.recurrence, month, hint: suggestion.hint }
    : { name: '', category: categories[0] || 'Outros', amount: '', currency: 'BRL', recurrence: 'monthly', month });

  const saveCost = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!costDraft) return;
    const body = { name: costDraft.name, category: costDraft.category, amount: toNum(costDraft.amount), currency: costDraft.currency, recurrence: costDraft.recurrence, month: costDraft.month };
    try {
      const saved = costDraft.id
        ? await finRequest<FinFixedCost>(`/fixed-costs/${costDraft.id}`, tenantId, { method: 'PUT', body })
        : await finRequest<FinFixedCost>('/fixed-costs', tenantId, { method: 'POST', body });
      setWorkspace((state) => state && ({
        ...state,
        fixedCosts: costDraft.id ? state.fixedCosts.map((item) => (item.id === saved.id ? saved : item)) : [...state.fixedCosts, saved],
      }));
      setCostDraft(null);
      setError('');
      // Primeira despesa em dólar/euro: já busca a cotação do dia.
      if (missingRate(saved.currency, settings)) await updateRates(true);
    } catch (err) { fail(err); }
  };

  const removeCost = async (cost: FinFixedCost) => {
    if (!confirm(`Excluir "${cost.name}"?`)) return;
    try {
      await finRequest(`/fixed-costs/${cost.id}`, tenantId, { method: 'DELETE' });
      setWorkspace((state) => state && ({ ...state, fixedCosts: state.fixedCosts.filter((item) => item.id !== cost.id) }));
    } catch (err) { fail(err); }
  };

  const toggleCost = async (cost: FinFixedCost) => {
    try {
      const saved = await finRequest<FinFixedCost>(`/fixed-costs/${cost.id}`, tenantId, { method: 'PUT', body: { ...cost, active: !cost.active } });
      setWorkspace((state) => state && ({ ...state, fixedCosts: state.fixedCosts.map((item) => (item.id === saved.id ? saved : item)) }));
    } catch (err) { fail(err); }
  };

  // ── Canais ──
  const saveChannel = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!channelDraft) return;
    const body = { name: channelDraft.name, fee_pct: toNum(channelDraft.fee_pct), fixed_fee: toNum(channelDraft.fixed_fee), extra_cost: toNum(channelDraft.extra_cost) };
    try {
      const saved = channelDraft.id
        ? await finRequest<FinChannel>(`/channels/${channelDraft.id}`, tenantId, { method: 'PUT', body })
        : await finRequest<FinChannel>('/channels', tenantId, { method: 'POST', body });
      setWorkspace((state) => state && ({
        ...state,
        channels: channelDraft.id ? state.channels.map((item) => (item.id === saved.id ? saved : item)) : [...state.channels, saved],
      }));
      setChannelDraft(null);
      setError('');
    } catch (err) { fail(err); }
  };

  const removeChannel = async (channel: FinChannel) => {
    if (!confirm(`Excluir "${channel.name}"? As vendas já registradas nele ficam como "sem canal".`)) return;
    try {
      await finRequest(`/channels/${channel.id}`, tenantId, { method: 'DELETE' });
      setWorkspace((state) => state && ({ ...state, channels: state.channels.filter((item) => item.id !== channel.id) }));
    } catch (err) { fail(err); }
  };

  const toggleChannel = async (channel: FinChannel) => {
    try {
      const saved = await finRequest<FinChannel>(`/channels/${channel.id}`, tenantId, { method: 'PUT', body: { ...channel, active: !channel.active } });
      setWorkspace((state) => state && ({ ...state, channels: state.channels.map((item) => (item.id === saved.id ? saved : item)) }));
    } catch (err) { fail(err); }
  };

  const moveChannel = async (index: number, delta: number) => {
    const next = [...channels];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setWorkspace((state) => state && ({ ...state, channels: next.map((item, position) => ({ ...item, position })) }));
    try {
      await finRequest('/channels', tenantId, { method: 'POST', body: { order: next.map((item) => item.id) } });
    } catch (err) { fail(err); }
  };

  // ── Configurações ──
  const saveSettings = async (event: React.FormEvent) => {
    event.preventDefault();
    const body = Object.fromEntries(Object.entries(settingsDraft).map(([key, value]) => [key, toNum(value)]));
    try {
      const saved = await finRequest<FinSettings>('/settings', tenantId, { method: 'POST', body });
      setWorkspace((state) => state && ({ ...state, settings: saved }));
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 2500);
      setError('');
    } catch (err) { fail(err); }
  };

  const settingField = (key: SettingKey, label: string, suffix: string, hint: string) => (
    <label className={styles.field}>
      {label}
      <div className={styles.inputGroup}>
        {suffix === 'R$' && <span>R$</span>}
        <input
          className={styles.input}
          inputMode="decimal"
          value={settingsDraft[key]}
          onChange={(event) => setSettingsDraft((state) => ({ ...state, [key]: event.target.value }))}
          disabled={!access.canManage}
        />
        {suffix !== 'R$' && <span>{suffix}</span>}
      </div>
      <small>{hint}</small>
    </label>
  );

  const draftMonthly = costDraft && toNum(costDraft.amount) > 0 && (costDraft.currency !== 'BRL' || costDraft.recurrence === 'yearly')
    ? fixedCostMonthly({ amount: toNum(costDraft.amount), currency: costDraft.currency, recurrence: costDraft.recurrence }, settings)
    : null;

  const costRow = (cost: FinFixedCost) => {
    const monthly = fixedCostMonthly(cost, settings);
    const original = cost.currency !== 'BRL' || cost.recurrence === 'yearly';
    const noRate = missingRate(cost.currency, settings);
    return (
      <tr key={cost.id} style={{ opacity: cost.active ? 1 : 0.5 }}>
        <td>
          <strong>{cost.name}</strong>
          <div className={styles.muted} style={{ fontSize: '0.76rem' }}>
            {cost.recurrence === 'once'
              ? `${cost.category}${cost.month ? ` · ${monthLabel(cost.month.slice(0, 7))}` : ''}`
              : original ? `${formatCurrency(cost.amount, cost.currency)} ${RECURRENCE_LABEL[cost.recurrence]}` : ''}
            {cost.recurrence === 'once' && cost.currency !== 'BRL' ? ` · ${formatCurrency(cost.amount, cost.currency)}` : ''}
            {!cost.active ? ' · pausada' : ''}
          </div>
        </td>
        <td className={styles.num}>
          {noRate ? <span className={`${styles.tag} ${styles.tagWarn}`}>sem cotação</span> : <strong>{formatMoney(monthly)}</strong>}
        </td>
        <td className={styles.num}>{cost.recurrence !== 'once' && fixedMonthly > 0 && cost.active ? formatPct((monthly / fixedMonthly) * 100, 0) : ''}</td>
        {access.canManage && (
          <td>
            <div className={styles.rowActions}>
              {cost.recurrence !== 'once' && (
                <button className={styles.ghostButton} onClick={() => toggleCost(cost)}>{cost.active ? 'Pausar' : 'Reativar'}</button>
              )}
              <button className={styles.iconButton} title="Editar" onClick={() => setCostDraft({ id: cost.id, name: cost.name, category: cost.category, amount: numText(cost.amount), currency: cost.currency, recurrence: cost.recurrence, month: (cost.month || month).slice(0, 7) })}><Pencil size={15} /></button>
              <button className={`${styles.iconButton} ${styles.iconDanger}`} title="Excluir" onClick={() => removeCost(cost)}><Trash2 size={15} /></button>
            </div>
          </td>
        )}
      </tr>
    );
  };

  return (
    <>
      {error && <div className={styles.errorBanner}>{error}</div>}

      {ratesMissing && (
        <div className={styles.setupBanner}>
          <div>
            <strong>Falta a cotação do dólar/euro</strong>
            <span>Há {foreignInUse.length} item(ns) em moeda estrangeira. Sem a cotação eles entram como R$ 0,00 nos custos e nos preços.</span>
          </div>
          {access.canManage && (
            <button className={styles.primaryButton} onClick={() => updateRates()} disabled={fxBusy}>
              {fxBusy ? <Loader2 size={16} className={styles.spin} /> : <RefreshCw size={16} />} Buscar cotação de hoje
            </button>
          )}
        </div>
      )}

      <div className={styles.kpis}>
        <div className={styles.kpi} style={{ '--kpi-color': '#f59e0b' } as React.CSSProperties}>
          <span className={styles.kpiLabel}>Despesas fixas / mês</span>
          <span className={styles.kpiValue}>{formatMoney(fixedMonthly)}</span>
          <span className={styles.kpiFoot}>
            {recurring.filter((cost) => cost.active).length} ativas
            {foreignTotal > 0 ? ` · ${formatMoney(foreignTotal)} em moeda estrangeira` : ''}
            {yearlyCount > 0 ? ` · ${yearlyCount} anual(is) em 1/12` : ''}
          </span>
        </div>
        <div className={styles.kpi} style={{ '--kpi-color': '#3b82f6' } as React.CSSProperties}>
          <span className={styles.kpiLabel}>{business.type === 'software' ? 'Receita' : 'Faturamento'} de referência</span>
          <span className={styles.kpiValue}>{formatMoney(base.value)}</span>
          <span className={styles.kpiFoot}>{base.source === 'history' ? `média de ${base.months} mês(es) de vendas` : 'valor esperado (parâmetros)'}</span>
        </div>
        <div className={styles.kpi} style={{ '--kpi-color': '#8b5cf6' } as React.CSSProperties}>
          <span className={styles.kpiLabel}>Peso das despesas fixas</span>
          <span className={styles.kpiValue}>{base.value > 0 ? formatPct(fixedPct) : '—'}</span>
          <span className={styles.kpiFoot}>entra no preço de {terms.products.toLowerCase()}</span>
        </div>
        <div className={styles.kpi} style={{ '--kpi-color': '#10b981' } as React.CSSProperties}>
          <span className={styles.kpiLabel}>Margem de lucro desejada</span>
          <span className={styles.kpiValue}>{formatPct(settings.target_margin_pct, 0)}</span>
          <span className={styles.kpiFoot}>impostos {formatPct(settings.tax_pct)} sobre a venda</span>
        </div>
      </div>

      <div className={styles.grid3}>
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2><Wallet size={18} /> Despesas</h2>
            {access.canManage && !costDraft && (
              <div className={styles.headerActions}>
                {suggestions.length > 0 && (
                  <button className={styles.secondaryButton} onClick={() => setShowSuggestions((value) => !value)} aria-expanded={showSuggestions}>
                    <ListChecks size={16} /> Checklist {showSuggestions ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                )}
                <button className={styles.primaryButton} onClick={() => startCost()}><Plus size={16} /> Nova despesa</button>
              </div>
            )}
          </div>
          <p className={styles.panelHint}>{labels.fixedHint}</p>

          {access.canManage && showSuggestions && suggestions.length > 0 && !costDraft && (
            <div className={styles.suggestBox}>
              <strong>O que costuma ter quem {business.type === 'software' ? 'vende sistema' : 'tem um negócio como o seu'}</strong>
              <span className={styles.muted}>Clique para cadastrar; você só preenche o valor. Some o que não se aplica a você.</span>
              <div className={styles.chips}>
                {suggestions.map((item) => (
                  <button key={item.name} type="button" className={styles.chip} title={item.hint} onClick={() => startCost(item)}>
                    <Plus size={12} /> {item.name}
                    {(item.currency !== 'BRL' || item.recurrence !== 'monthly') && (
                      <small>{item.currency !== 'BRL' ? CURRENCIES.find((entry) => entry.code === item.currency)?.symbol : ''}{item.currency !== 'BRL' && item.recurrence !== 'monthly' ? ' · ' : ''}{item.recurrence !== 'monthly' ? RECURRENCE_LABEL[item.recurrence] : ''}</small>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {costDraft && (
            <form className={styles.formRow} style={{ gridTemplateColumns: '1.7fr 1.3fr 1.4fr 1fr auto' }} onSubmit={saveCost}>
              <label className={styles.field}>
                Descrição
                <input className={styles.input} value={costDraft.name} onChange={(event) => setCostDraft({ ...costDraft, name: event.target.value })} placeholder={`Ex.: ${labels.fixedExample}`} required autoFocus={!costDraft.hint} />
              </label>
              <label className={styles.field}>
                Categoria
                <select className={styles.input} value={costDraft.category} onChange={(event) => setCostDraft({ ...costDraft, category: event.target.value })}>
                  {Array.from(new Set([...categories, costDraft.category])).map((item) => <option key={item}>{item}</option>)}
                </select>
              </label>
              <label className={styles.field}>
                Valor
                <div className={styles.inputGroup}>
                  <select
                    className={styles.input}
                    style={{ width: 'auto', flex: 'none', paddingInline: 6 }}
                    value={costDraft.currency}
                    onChange={(event) => setCostDraft({ ...costDraft, currency: event.target.value as FinCurrency })}
                    aria-label="Moeda"
                  >
                    {CURRENCIES.map((item) => <option key={item.code} value={item.code}>{item.symbol}</option>)}
                  </select>
                  <input className={styles.input} inputMode="decimal" value={costDraft.amount} onChange={(event) => setCostDraft({ ...costDraft, amount: event.target.value })} placeholder="0,00" required autoFocus={Boolean(costDraft.hint)} />
                </div>
              </label>
              <label className={styles.field}>
                Frequência
                <select className={styles.input} value={costDraft.recurrence} onChange={(event) => setCostDraft({ ...costDraft, recurrence: event.target.value as Recurrence })}>
                  <option value="monthly">Todo mês</option>
                  <option value="yearly">Todo ano</option>
                  <option value="once">Só uma vez</option>
                </select>
              </label>
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="submit" className={styles.primaryButton} title="Salvar"><Check size={16} /></button>
                <button type="button" className={styles.secondaryButton} onClick={() => setCostDraft(null)} title="Cancelar"><X size={16} /></button>
              </div>
              {costDraft.recurrence === 'once' && (
                <label className={styles.field} style={{ gridColumn: '1 / 3' }}>
                  Mês da despesa
                  <input className={styles.input} type="month" value={costDraft.month} onChange={(event) => setCostDraft({ ...costDraft, month: event.target.value })} />
                </label>
              )}
              {(costDraft.hint || draftMonthly !== null || costDraft.currency !== 'BRL') && (
                <small className={styles.muted} style={{ gridColumn: '1 / -1' }}>
                  {costDraft.hint}
                  {costDraft.hint && (draftMonthly !== null || costDraft.currency !== 'BRL') ? ' · ' : ''}
                  {costDraft.currency !== 'BRL' && missingRate(costDraft.currency, settings)
                    ? 'A cotação do dia é buscada ao salvar.'
                    : draftMonthly !== null
                      ? <>Entra nos custos como <strong>{formatMoney(draftMonthly)}{costDraft.recurrence === 'once' ? '' : ' por mês'}</strong>
                        {costDraft.currency !== 'BRL' ? ` (cotação ${formatMoney(currencyRate(costDraft.currency, settings))} com IOF/spread)` : ''}</>
                      : null}
                </small>
              )}
            </form>
          )}

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr><th>Fixas (todo mês e anuais)</th><th className={styles.num}>Por mês</th><th className={styles.num}>Peso</th>{access.canManage && <th />}</tr>
              </thead>
              {groups.map(([category, entry]) => (
                <tbody key={category}>
                  <tr className={styles.groupRow}>
                    <td>{category} <span className={styles.muted}>({entry.items.length})</span></td>
                    <td className={styles.num}>{formatMoney(entry.total)}</td>
                    <td className={styles.num}>{fixedMonthly > 0 ? formatPct((entry.total / fixedMonthly) * 100, 0) : ''}</td>
                    {access.canManage && <td />}
                  </tr>
                  {entry.items.map(costRow)}
                </tbody>
              ))}
              {recurring.length > 0 && (
                <tfoot>
                  <tr className={styles.totalRow}>
                    <td>Total por mês</td>
                    <td className={styles.num}>{formatMoney(fixedMonthly)}</td>
                    <td />
                    {access.canManage && <td />}
                  </tr>
                </tfoot>
              )}
            </table>
            {recurring.length === 0 && <div className={styles.empty}>Nenhuma despesa fixa cadastrada.{suggestions.length > 0 ? ' Use o checklist acima para começar.' : ''}</div>}
          </div>

          {once.length > 0 && (
            <div className={styles.tableWrap} style={{ marginTop: 18 }}>
              <table className={styles.table}>
                <thead>
                  <tr><th>Avulsas</th><th className={styles.num}>Valor</th><th />{access.canManage && <th />}</tr>
                </thead>
                <tbody>{once.map(costRow)}</tbody>
              </table>
            </div>
          )}
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2><Settings2 size={18} /> Parâmetros</h2>
          </div>
          <form onSubmit={saveSettings} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {settingField('tax_pct', 'Impostos sobre a venda', '%', business.type === 'software'
              ? 'Simples Nacional para software: em geral Anexo III (a partir de 6%) ou V (a partir de 15,5%), conforme o fator R. MEI: 0% aqui e o DAS nas despesas.'
              : 'Ex.: Simples Nacional 4% a 6%; MEI ≈ 0% (o DAS entra nas despesas).')}
            {settingField('target_margin_pct', 'Margem de lucro desejada', '%', `Quanto sobra limpo de cada venda. Cada ${terms.product} pode ter a sua.`)}
            {settingField('commission_pct', 'Comissão de vendedor', '%', 'Se alguém ganha % sobre as vendas.')}
            {settingField('labor_hour_cost', labels.laborSetting, 'R$', labels.laborHint)}
            {settingField('expected_monthly_revenue', `${labels.expectedRevenue.charAt(0).toUpperCase()}${labels.expectedRevenue.slice(1)} por mês`, 'R$', 'Usado para ratear as despesas fixas até existirem vendas registradas.')}

            <div className={styles.fxBox}>
              <strong><Globe2 size={15} /> Dólar e euro</strong>
              {settingField('usd_rate', 'Dólar hoje', 'R$', '')}
              {settingField('eur_rate', 'Euro hoje', 'R$', '')}
              {settingField('fx_fee_pct', 'IOF + spread do cartão', '%', 'IOF de compra internacional no cartão: 3,5%. Some o spread do seu banco (veja na fatura).')}
              {access.canManage && (
                <button type="button" className={styles.secondaryButton} onClick={() => updateRates()} disabled={fxBusy}>
                  {fxBusy ? <Loader2 size={15} className={styles.spin} /> : <RefreshCw size={15} />} Buscar cotação de hoje
                </button>
              )}
              <small className={styles.muted}>
                {fxNote || (settings.fx_updated_at ? `Atualizada em ${new Date(settings.fx_updated_at).toLocaleDateString('pt-BR')}.` : 'Usada em despesas e compras em moeda estrangeira (Claude, ChatGPT, Supabase, APIs...).')}
              </small>
            </div>

            {access.canManage && (
              <button type="submit" className={styles.primaryButton}>{settingsSaved ? <><Check size={16} /> Salvo</> : 'Salvar parâmetros'}</button>
            )}
          </form>
        </section>
      </div>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2><Store size={18} /> {labels.channels}</h2>
          {access.canManage && !channelDraft && (
            <button className={styles.primaryButton} onClick={() => setChannelDraft({ name: '', fee_pct: '', fixed_fee: '', extra_cost: '' })}><Plus size={16} /> Adicionar</button>
          )}
        </div>
        <p className={styles.panelHint}>{labels.channelsHint}</p>

        {channelDraft && (
          <form className={styles.formRow} style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr auto' }} onSubmit={saveChannel}>
            <label className={styles.field}>
              Nome
              <input className={styles.input} value={channelDraft.name} onChange={(event) => setChannelDraft({ ...channelDraft, name: event.target.value })} placeholder={`Ex.: ${labels.channelExample}`} required autoFocus />
            </label>
            <label className={styles.field}>
              Taxa / comissão (%)
              <input className={styles.input} inputMode="decimal" value={channelDraft.fee_pct} onChange={(event) => setChannelDraft({ ...channelDraft, fee_pct: event.target.value })} placeholder="0" />
            </label>
            <label className={styles.field}>
              Taxa fixa por item (R$)
              <input className={styles.input} inputMode="decimal" value={channelDraft.fixed_fee} onChange={(event) => setChannelDraft({ ...channelDraft, fixed_fee: event.target.value })} placeholder="0,00" />
            </label>
            <label className={styles.field}>
              Custo extra por item (R$)
              <input className={styles.input} inputMode="decimal" value={channelDraft.extra_cost} onChange={(event) => setChannelDraft({ ...channelDraft, extra_cost: event.target.value })} placeholder={business.type === 'software' ? '0,00' : 'embalagem de entrega'} />
            </label>
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="submit" className={styles.primaryButton} title="Salvar"><Check size={16} /></button>
              <button type="button" className={styles.secondaryButton} onClick={() => setChannelDraft(null)} title="Cancelar"><X size={16} /></button>
            </div>
          </form>
        )}

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{labels.channel}</th>
                <th className={styles.num}>Taxa</th>
                <th className={styles.num}>Taxa fixa</th>
                <th className={styles.num}>Custo extra</th>
                <th className={styles.num}>Total descontado*</th>
                {access.canManage && <th />}
              </tr>
            </thead>
            <tbody>
              {channels.map((channel, index) => (
                <tr key={channel.id} style={{ opacity: channel.active ? 1 : 0.5 }}>
                  <td>
                    <strong>{channel.name}</strong>
                    {index === 0 && <span className={`${styles.tag} ${styles.tagGood}`} style={{ marginLeft: 8 }}>padrão</span>}
                  </td>
                  <td className={styles.num}>{formatPct(channel.fee_pct)}</td>
                  <td className={styles.num}>{formatMoney(channel.fixed_fee)}</td>
                  <td className={styles.num}>{formatMoney(channel.extra_cost)}</td>
                  <td className={styles.num}><strong>{formatPct(channel.fee_pct + settings.tax_pct + settings.commission_pct)}</strong></td>
                  {access.canManage && (
                    <td>
                      <div className={styles.rowActions}>
                        <button className={styles.iconButton} onClick={() => moveChannel(index, -1)} disabled={index === 0} title="Subir"><ArrowUp size={14} /></button>
                        <button className={styles.iconButton} onClick={() => moveChannel(index, 1)} disabled={index === channels.length - 1} title="Descer"><ArrowDown size={14} /></button>
                        <button className={styles.ghostButton} onClick={() => toggleChannel(channel)}>{channel.active ? 'Desativar' : 'Ativar'}</button>
                        <button className={styles.iconButton} title="Editar" onClick={() => setChannelDraft({ id: channel.id, name: channel.name, fee_pct: numText(channel.fee_pct), fixed_fee: numText(channel.fixed_fee), extra_cost: numText(channel.extra_cost) })}><Pencil size={15} /></button>
                        <button className={`${styles.iconButton} ${styles.iconDanger}`} title="Excluir" onClick={() => removeChannel(channel)}><Trash2 size={15} /></button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={styles.panelHint} style={{ margin: '12px 0 0' }}>* taxa + impostos + comissão, em % do preço. A taxa fixa e o custo extra são somados em reais.</p>
      </section>
    </>
  );
}
