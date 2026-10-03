'use client';

import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Check, Pencil, Plus, Settings2, Store, Trash2, Wallet, X } from 'lucide-react';
import styles from '../financeiro.module.css';
import { currentMonth, finRequest, monthLabel, numText, toNum } from '../api';
import { pricingBase, type TabProps } from './shared';
import { formatMoney, formatPct } from '@/lib/finance/calc';
import type { FinChannel, FinFixedCost, FinSettings } from '@/lib/finance/types';

const COST_CATEGORIES = ['Aluguel', 'Energia', 'Água', 'Gás', 'Internet / telefone', 'Salários', 'Pró-labore', 'Contador', 'Marketing', 'Sistema / assinaturas', 'Manutenção', 'Outros'];

interface CostDraft { id?: string; name: string; category: string; amount: string; recurrence: 'monthly' | 'once'; month: string }
interface ChannelDraft { id?: string; name: string; fee_pct: string; fixed_fee: string; extra_cost: string }

export default function CostsTab({ workspace, tenantId, setWorkspace }: TabProps) {
  const { fixedCosts, channels, settings, access } = workspace;
  const month = currentMonth();
  const { fixedMonthly, base, fixedPct } = useMemo(() => pricingBase(workspace, month), [workspace, month]);
  const [costDraft, setCostDraft] = useState<CostDraft | null>(null);
  const [channelDraft, setChannelDraft] = useState<ChannelDraft | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<Record<keyof FinSettings, string>>(() => ({
    tax_pct: numText(settings.tax_pct),
    commission_pct: numText(settings.commission_pct),
    target_margin_pct: numText(settings.target_margin_pct),
    labor_hour_cost: numText(settings.labor_hour_cost),
    expected_monthly_revenue: numText(settings.expected_monthly_revenue),
  }));
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [error, setError] = useState('');

  const monthly = fixedCosts.filter((cost) => cost.recurrence === 'monthly');
  const once = fixedCosts.filter((cost) => cost.recurrence === 'once').sort((a, b) => (b.month || '').localeCompare(a.month || ''));

  const fail = (err: unknown) => setError(err instanceof Error ? err.message : 'Erro ao salvar.');

  // ── Despesas ──
  const saveCost = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!costDraft) return;
    const body = { name: costDraft.name, category: costDraft.category, amount: toNum(costDraft.amount), recurrence: costDraft.recurrence, month: costDraft.month };
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
    if (!confirm(`Excluir o canal "${channel.name}"? As vendas já registradas nele ficam como "sem canal".`)) return;
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

  const settingField = (key: keyof FinSettings, label: string, suffix: string, hint: string) => (
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

  const costRow = (cost: FinFixedCost) => (
    <tr key={cost.id} style={{ opacity: cost.active ? 1 : 0.5 }}>
      <td>
        <strong>{cost.name}</strong>
        <div className={styles.muted} style={{ fontSize: '0.76rem' }}>
          {cost.category}{cost.recurrence === 'once' && cost.month ? ` · ${monthLabel(cost.month.slice(0, 7))}` : ''}
        </div>
      </td>
      <td className={styles.num}><strong>{formatMoney(cost.amount)}</strong></td>
      <td className={styles.num}>{cost.recurrence === 'monthly' && fixedMonthly > 0 && cost.active ? formatPct((cost.amount / fixedMonthly) * 100, 0) : ''}</td>
      {access.canManage && (
        <td>
          <div className={styles.rowActions}>
            {cost.recurrence === 'monthly' && (
              <button className={styles.ghostButton} onClick={() => toggleCost(cost)}>{cost.active ? 'Pausar' : 'Reativar'}</button>
            )}
            <button className={styles.iconButton} title="Editar" onClick={() => setCostDraft({ id: cost.id, name: cost.name, category: cost.category, amount: numText(cost.amount), recurrence: cost.recurrence, month: (cost.month || month).slice(0, 7) })}><Pencil size={15} /></button>
            <button className={`${styles.iconButton} ${styles.iconDanger}`} title="Excluir" onClick={() => removeCost(cost)}><Trash2 size={15} /></button>
          </div>
        </td>
      )}
    </tr>
  );

  return (
    <>
      {error && <div className={styles.errorBanner}>{error}</div>}

      <div className={styles.kpis}>
        <div className={styles.kpi} style={{ '--kpi-color': '#f59e0b' } as React.CSSProperties}>
          <span className={styles.kpiLabel}>Despesas fixas / mês</span>
          <span className={styles.kpiValue}>{formatMoney(fixedMonthly)}</span>
          <span className={styles.kpiFoot}>{monthly.filter((cost) => cost.active).length} despesas ativas</span>
        </div>
        <div className={styles.kpi} style={{ '--kpi-color': '#3b82f6' } as React.CSSProperties}>
          <span className={styles.kpiLabel}>Faturamento de referência</span>
          <span className={styles.kpiValue}>{formatMoney(base.value)}</span>
          <span className={styles.kpiFoot}>{base.source === 'history' ? `média de ${base.months} mês(es) de vendas` : 'faturamento esperado (configuração)'}</span>
        </div>
        <div className={styles.kpi} style={{ '--kpi-color': '#8b5cf6' } as React.CSSProperties}>
          <span className={styles.kpiLabel}>Peso das despesas fixas</span>
          <span className={styles.kpiValue}>{base.value > 0 ? formatPct(fixedPct) : '—'}</span>
          <span className={styles.kpiFoot}>entra no preço de todas as fichas</span>
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
              <button className={styles.primaryButton} onClick={() => setCostDraft({ name: '', category: 'Aluguel', amount: '', recurrence: 'monthly', month: month })}>
                <Plus size={16} /> Nova despesa
              </button>
            )}
          </div>
          <p className={styles.panelHint}>
            Fixas são as que chegam todo mês, vendendo ou não (aluguel, luz, salários, pró-labore). Avulsas entram só no mês em que aconteceram (conserto, compra de equipamento).
          </p>

          {costDraft && (
            <form className={styles.formRow} style={{ gridTemplateColumns: '2fr 1.3fr 1fr 1.1fr auto' }} onSubmit={saveCost}>
              <label className={styles.field}>
                Descrição
                <input className={styles.input} value={costDraft.name} onChange={(event) => setCostDraft({ ...costDraft, name: event.target.value })} placeholder="Ex.: Aluguel da loja" required autoFocus />
              </label>
              <label className={styles.field}>
                Categoria
                <select className={styles.input} value={costDraft.category} onChange={(event) => setCostDraft({ ...costDraft, category: event.target.value })}>
                  {Array.from(new Set([...COST_CATEGORIES, costDraft.category])).map((item) => <option key={item}>{item}</option>)}
                </select>
              </label>
              <label className={styles.field}>
                Valor (R$)
                <input className={styles.input} inputMode="decimal" value={costDraft.amount} onChange={(event) => setCostDraft({ ...costDraft, amount: event.target.value })} required />
              </label>
              <label className={styles.field}>
                Frequência
                <select className={styles.input} value={costDraft.recurrence} onChange={(event) => setCostDraft({ ...costDraft, recurrence: event.target.value as CostDraft['recurrence'] })}>
                  <option value="monthly">Todo mês</option>
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
            </form>
          )}

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr><th>Fixas (todo mês)</th><th className={styles.num}>Valor</th><th className={styles.num}>Peso</th>{access.canManage && <th />}</tr>
              </thead>
              <tbody>{monthly.map(costRow)}</tbody>
            </table>
            {monthly.length === 0 && <div className={styles.empty}>Nenhuma despesa fixa cadastrada.</div>}
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
            {settingField('tax_pct', 'Impostos sobre a venda', '%', 'Ex.: Simples Nacional 4% a 6%; MEI ≈ 0%.')}
            {settingField('target_margin_pct', 'Margem de lucro desejada', '%', 'Quanto sobra limpo de cada venda. Cada ficha pode ter a sua.')}
            {settingField('commission_pct', 'Comissão de vendedor', '%', 'Se alguém ganha % sobre as vendas.')}
            {settingField('labor_hour_cost', 'Custo da hora de trabalho', 'R$', 'Salários (+ encargos) ÷ horas trabalhadas no mês. Multiplica pelo tempo de preparo de cada ficha.')}
            {settingField('expected_monthly_revenue', 'Faturamento esperado por mês', 'R$', 'Usado para ratear as despesas fixas até existirem vendas registradas.')}
            {access.canManage && (
              <button type="submit" className={styles.primaryButton}>{settingsSaved ? <><Check size={16} /> Salvo</> : 'Salvar parâmetros'}</button>
            )}
          </form>
        </section>
      </div>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2><Store size={18} /> Canais de venda</h2>
          {access.canManage && !channelDraft && (
            <button className={styles.primaryButton} onClick={() => setChannelDraft({ name: '', fee_pct: '', fixed_fee: '', extra_cost: '' })}><Plus size={16} /> Novo canal</button>
          )}
        </div>
        <p className={styles.panelHint}>
          Cada canal cobra diferente: maquininha no balcão, comissão do iFood, embalagem extra no delivery. O primeiro canal da lista é o seu preço padrão.
        </p>

        {channelDraft && (
          <form className={styles.formRow} style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr auto' }} onSubmit={saveChannel}>
            <label className={styles.field}>
              Nome
              <input className={styles.input} value={channelDraft.name} onChange={(event) => setChannelDraft({ ...channelDraft, name: event.target.value })} placeholder="Ex.: Rappi" required autoFocus />
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
              <input className={styles.input} inputMode="decimal" value={channelDraft.extra_cost} onChange={(event) => setChannelDraft({ ...channelDraft, extra_cost: event.target.value })} placeholder="embalagem de entrega" />
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
                <th>Canal</th>
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
        <p className={styles.panelHint} style={{ margin: '12px 0 0' }}>* taxa do canal + impostos + comissão, em % do preço de venda.</p>
      </section>
    </>
  );
}
