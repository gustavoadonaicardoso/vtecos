'use client';

import React, { useMemo, useState } from 'react';
import { Plus, ShoppingBag, Trash2 } from 'lucide-react';
import styles from '../financeiro.module.css';
import { finRequest, numText, toNum } from '../api';
import { MonthPicker, type TabProps } from './shared';
import { defaultSalePrice, formatMoney, formatQty, saleContribution, saleNet } from '@/lib/finance/calc';
import type { FinSale } from '@/lib/finance/types';

interface Props extends TabProps {
  month: string;
  onMonthChange: (month: string) => void;
  sales: FinSale[] | null;
  onChanged: () => Promise<void>;
}

const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

export default function SalesTab({ workspace, tenantId, month, onMonthChange, sales, onChanged }: Props) {
  const { products, channels, access } = workspace;
  const sellable = products.filter((product) => product.kind === 'product' && product.active);
  const activeChannels = channels.filter((channel) => channel.active);

  const [form, setForm] = useState({
    sold_at: today(),
    product_id: sellable[0]?.id || '',
    channel_id: activeChannels[0]?.id || '',
    quantity: '1',
    unit_price: '',
    discount: '',
    description: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');

  const productNames = useMemo(() => new Map(products.map((product) => [product.id, product.name])), [products]);
  const channelNames = useMemo(() => new Map(channels.map((channel) => [channel.id, channel.name])), [channels]);
  const selected = products.find((product) => product.id === form.product_id) || null;
  const autoPrice = selected ? defaultSalePrice(selected, form.channel_id || null) : 0;
  const preview = Math.max(0, toNum(form.quantity, 1) * (form.unit_price.trim() ? toNum(form.unit_price) : autoPrice) - toNum(form.discount));

  const totals = useMemo(() => {
    const list = sales || [];
    return {
      revenue: list.reduce((sum, sale) => sum + saleNet(sale), 0),
      contribution: list.reduce((sum, sale) => sum + saleContribution(sale), 0),
      count: list.length,
    };
  }, [sales]);

  const byDay = useMemo(() => {
    const groups = new Map<string, FinSale[]>();
    for (const sale of sales || []) {
      const list = groups.get(sale.sold_at) || [];
      list.push(sale);
      groups.set(sale.sold_at, list);
    }
    return Array.from(groups.entries());
  }, [sales]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.product_id && !form.description.trim()) {
      setError('Escolha um produto ou descreva a venda avulsa.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await finRequest('/sales', tenantId, {
        method: 'POST',
        body: {
          sold_at: form.sold_at,
          product_id: form.product_id || null,
          channel_id: form.channel_id || null,
          quantity: toNum(form.quantity, 1),
          unit_price: form.unit_price.trim() ? toNum(form.unit_price) : null,
          discount: toNum(form.discount),
          description: form.description,
        },
      });
      setForm((state) => ({ ...state, quantity: '1', unit_price: '', discount: '', description: '' }));
      setFlash(`Venda de ${formatMoney(preview)} registrada.`);
      setTimeout(() => setFlash(''), 2500);
      if (form.sold_at.slice(0, 7) !== month) onMonthChange(form.sold_at.slice(0, 7));
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao registrar.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (sale: FinSale) => {
    if (!confirm('Excluir esta venda?')) return;
    try {
      await finRequest(`/sales/${sale.id}`, tenantId, { method: 'DELETE' });
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir.');
    }
  };

  return (
    <>
      {access.canSell && (
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2><Plus size={18} /> Registrar venda</h2>
            {flash && <span className={`${styles.tag} ${styles.tagGood}`}>{flash}</span>}
          </div>
          <p className={styles.panelHint}>
            O custo do produto e as taxas do canal ficam gravados no momento da venda — se o preço de um insumo mudar depois, o resultado deste mês não muda.
          </p>
          {error && <div className={styles.errorBanner} style={{ marginBottom: 12 }}>{error}</div>}
          <form className={styles.formRow} style={{ gridTemplateColumns: '1fr 2fr 1.4fr 0.7fr 1fr 0.9fr auto', marginBottom: 0 }} onSubmit={submit}>
            <label className={styles.field}>
              Data
              <input className={styles.input} type="date" value={form.sold_at} onChange={(event) => setForm({ ...form, sold_at: event.target.value })} required />
            </label>
            <label className={styles.field}>
              Produto
              <select className={styles.input} value={form.product_id} onChange={(event) => setForm({ ...form, product_id: event.target.value, unit_price: '' })}>
                {sellable.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                <option value="">Venda avulsa (sem ficha)</option>
              </select>
            </label>
            <label className={styles.field}>
              Canal
              <select className={styles.input} value={form.channel_id} onChange={(event) => setForm({ ...form, channel_id: event.target.value, unit_price: '' })}>
                {activeChannels.map((channel) => <option key={channel.id} value={channel.id}>{channel.name}</option>)}
                <option value="">Sem canal</option>
              </select>
            </label>
            <label className={styles.field}>
              Qtd.
              <input className={styles.input} inputMode="decimal" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} required />
            </label>
            <label className={styles.field}>
              Preço unit. (R$)
              <input className={styles.input} inputMode="decimal" value={form.unit_price} placeholder={autoPrice > 0 ? numText(autoPrice) : '0,00'} onChange={(event) => setForm({ ...form, unit_price: event.target.value })} />
            </label>
            <label className={styles.field}>
              Desconto (R$)
              <input className={styles.input} inputMode="decimal" value={form.discount} placeholder="0,00" onChange={(event) => setForm({ ...form, discount: event.target.value })} />
            </label>
            <button type="submit" className={styles.primaryButton} disabled={saving}>{saving ? 'Salvando…' : `Registrar ${formatMoney(preview)}`}</button>
            {!form.product_id && (
              <label className={styles.field} style={{ gridColumn: '2 / 5' }}>
                Descrição da venda avulsa
                <input className={styles.input} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Ex.: Encomenda de salgados" />
              </label>
            )}
          </form>
        </section>
      )}

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2><ShoppingBag size={18} /> Vendas do mês</h2>
          <MonthPicker month={month} onChange={onMonthChange} />
        </div>
        <div className={styles.toolbar} style={{ gap: 18 }}>
          <span>Faturamento <strong>{formatMoney(totals.revenue)}</strong></span>
          <span>Margem de contribuição <strong className={totals.contribution < 0 ? styles.bad : styles.good}>{formatMoney(totals.contribution)}</strong></span>
          <span className={styles.muted}>{totals.count} venda(s)</span>
        </div>

        {sales === null ? (
          <div className={styles.empty}>Carregando…</div>
        ) : sales.length === 0 ? (
          <div className={styles.empty}>Nenhuma venda neste mês. Registre acima ou importe da sua planilha.</div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Canal</th>
                  <th className={styles.num}>Qtd.</th>
                  <th className={styles.num}>Valor</th>
                  <th className={styles.num}>Custo + taxas</th>
                  <th className={styles.num}>Contribuição</th>
                  {access.canSell && <th />}
                </tr>
              </thead>
              <tbody>
                {byDay.map(([day, list]) => (
                  <React.Fragment key={day}>
                    <tr>
                      <td colSpan={access.canSell ? 7 : 6} className={styles.muted} style={{ fontSize: '0.78rem', fontWeight: 700, background: 'var(--soft)' }}>
                        {new Date(`${day}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'short' })}
                        {' · '}{formatMoney(list.reduce((sum, sale) => sum + saleNet(sale), 0))}
                      </td>
                    </tr>
                    {list.map((sale) => {
                      const contribution = saleContribution(sale);
                      return (
                        <tr key={sale.id}>
                          <td>
                            {(sale.product_id && productNames.get(sale.product_id)) || sale.description || 'Venda avulsa'}
                            {sale.source === 'import' && <span className={styles.tag} style={{ marginLeft: 6 }}>importada</span>}
                          </td>
                          <td className={styles.muted}>{(sale.channel_id && channelNames.get(sale.channel_id)) || '—'}</td>
                          <td className={styles.num}>{formatQty(sale.quantity)}</td>
                          <td className={styles.num}>{formatMoney(saleNet(sale))}</td>
                          <td className={styles.num}>{formatMoney(sale.quantity * sale.unit_cost + sale.fee_amount + sale.tax_amount)}</td>
                          <td className={`${styles.num} ${contribution < 0 ? styles.bad : styles.good}`}>{formatMoney(contribution)}</td>
                          {access.canSell && (
                            <td>
                              <div className={styles.rowActions}>
                                <button className={`${styles.iconButton} ${styles.iconDanger}`} onClick={() => remove(sale)} title="Excluir"><Trash2 size={14} /></button>
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
