'use client';

import React, { useMemo, useState } from 'react';
import { AlertTriangle, Calculator, ClipboardList, Copy, Plus, Tag, Trash2, X } from 'lucide-react';
import styles from '../financeiro.module.css';
import { currentMonth, finRequest, numText, toNum } from '../api';
import { marginTone, pricingBase, type TabProps } from './shared';
import {
  UNIT_INFO, breakEvenUnits, buildCostContext, compatibleUnits, computeProductCost, formatMoney, formatPct, formatQty,
  priceForChannel,
} from '@/lib/finance/calc';
import { capitalize, categoryInfo, presetFor } from '@/lib/finance/business';
import type { FinProduct, FinProductItem, FinUnit } from '@/lib/finance/types';

interface DraftItem {
  key: string;
  source: string; // "i:<id>" insumo | "p:<id>" preparo | ""
  quantity: string;
  unit: FinUnit;
}

interface Draft {
  id?: string;
  name: string;
  category: string;
  kind: 'product' | 'base';
  yield_qty: string;
  yield_unit: string;
  prep_minutes: string;
  loss_pct: string;
  sale_price: string;
  target_margin_pct: string;
  notes: string;
  channel_prices: Record<string, string>;
  items: DraftItem[];
}

const YIELD_UNITS = ['un', 'peça', 'kit', 'atendimento', 'sessão', 'hora', 'porção', 'fatia', 'kg', 'g', 'litro', 'ml', 'metro', 'm²', 'cento', 'caixa', 'lote'];

let keySeq = 0;
const newKey = () => `n${++keySeq}`;

function toDraft(product: FinProduct | null, kind: 'product' | 'base'): Draft {
  if (!product) {
    return {
      name: '', category: '', kind, yield_qty: '1', yield_unit: kind === 'base' ? 'g' : 'un', prep_minutes: '', loss_pct: '',
      sale_price: '', target_margin_pct: '', notes: '', channel_prices: {}, items: [],
    };
  }
  return {
    id: product.id,
    name: product.name,
    category: product.category,
    kind: product.kind,
    yield_qty: numText(product.yield_qty),
    yield_unit: product.yield_unit,
    prep_minutes: numText(product.prep_minutes),
    loss_pct: numText(product.loss_pct),
    sale_price: numText(product.sale_price),
    target_margin_pct: product.target_margin_pct === null ? '' : numText(product.target_margin_pct),
    notes: product.notes,
    channel_prices: Object.fromEntries(Object.entries(product.channel_prices).map(([key, value]) => [key, numText(value)])),
    items: product.items.map((item) => ({
      key: item.id || newKey(),
      source: item.ingredient_id ? `i:${item.ingredient_id}` : `p:${item.component_product_id}`,
      quantity: numText(item.quantity),
      unit: item.unit,
    })),
  };
}

function draftItems(draft: Draft): FinProductItem[] {
  return draft.items
    .filter((item) => item.source && toNum(item.quantity) > 0)
    .map((item) => ({
      id: item.key,
      ingredient_id: item.source.startsWith('i:') ? item.source.slice(2) : null,
      component_product_id: item.source.startsWith('p:') ? item.source.slice(2) : null,
      quantity: toNum(item.quantity),
      unit: item.unit,
    }));
}

function fromDraft(draft: Draft): FinProduct {
  return {
    id: draft.id || '__draft__',
    name: draft.name || 'Novo produto',
    category: draft.category,
    kind: draft.kind,
    yield_qty: toNum(draft.yield_qty, 1) || 1,
    yield_unit: draft.yield_unit || 'un',
    prep_minutes: toNum(draft.prep_minutes),
    loss_pct: Math.min(99, toNum(draft.loss_pct)),
    sale_price: toNum(draft.sale_price),
    channel_prices: Object.fromEntries(Object.entries(draft.channel_prices).map(([key, value]) => [key, toNum(value)]).filter(([, value]) => Number(value) > 0)),
    target_margin_pct: draft.target_margin_pct.trim() === '' ? null : toNum(draft.target_margin_pct),
    notes: draft.notes,
    active: true,
    items: draftItems(draft),
  };
}

interface Props extends TabProps {
  product: FinProduct | null;
  initialKind: 'product' | 'base';
  onClose: () => void;
}

export default function ProductEditor({ workspace, tenantId, setWorkspace, product, initialKind, onClose }: Props) {
  const { ingredients, products, channels, settings, access, business } = workspace;
  const terms = business.terms;
  const example = presetFor(business.type).examples;
  const [draft, setDraft] = useState<Draft>(() => toDraft(product, initialKind));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const readOnly = !access.canManage;

  const current = useMemo(() => fromDraft(draft), [draft]);
  const ctx = useMemo(
    () => buildCostContext(products.filter((item) => item.id !== current.id).concat(current), ingredients, settings, business.categories),
    [products, ingredients, settings, business.categories, current]
  );
  const cost = useMemo(() => computeProductCost(current, ctx), [current, ctx]);
  const { fixedMonthly, base, fixedPct } = useMemo(() => pricingBase(workspace, currentMonth()), [workspace]);
  const activeChannels = useMemo(() => channels.filter((channel) => channel.active), [channels]);
  const pricing = useMemo(
    () => activeChannels.map((channel) => priceForChannel(current, cost.unitCost, channel, settings, fixedPct)),
    [activeChannels, current, cost.unitCost, settings, fixedPct]
  );
  const targetMargin = current.target_margin_pct ?? settings.target_margin_pct;

  const ingredientById = useMemo(() => new Map(ingredients.map((item) => [item.id, item])), [ingredients]);
  const productById = useMemo(() => new Map(products.map((item) => [item.id, item])), [products]);
  const bases = products.filter((item) => item.id !== draft.id);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((state) => ({ ...state, [key]: value }));

  const setItem = (key: string, changes: Partial<DraftItem>) => {
    setDraft((state) => ({
      ...state,
      items: state.items.map((item) => {
        if (item.key !== key) return item;
        const next = { ...item, ...changes };
        // Insumo trocado: ajusta a unidade para uma compatível (farinha em kg → g).
        if (changes.source && changes.source.startsWith('i:')) {
          const ingredient = ingredientById.get(changes.source.slice(2));
          if (ingredient && !compatibleUnits(ingredient.purchase_unit).includes(next.unit)) {
            const base = UNIT_INFO[ingredient.purchase_unit].base;
            next.unit = base === 'un' ? 'un' : base;
          }
        }
        return next;
      }),
    }));
  };

  const addItem = (kind: 'i' | 'p') => setDraft((state) => ({
    ...state,
    items: [...state.items, { key: newKey(), source: kind === 'p' ? 'p:' : '', quantity: '', unit: kind === 'p' ? 'un' : 'g' }],
  }));

  const removeItem = (key: string) => setDraft((state) => ({ ...state, items: state.items.filter((item) => item.key !== key) }));

  const applySuggested = (channelId: string, value: number, isMain: boolean) => {
    setDraft((state) => ({
      ...state,
      sale_price: isMain ? numText(value) : state.sale_price,
      channel_prices: isMain ? state.channel_prices : { ...state.channel_prices, [channelId]: numText(value) },
    }));
  };

  const save = async (asCopy = false) => {
    if (!draft.name.trim()) {
      setError('Dê um nome.');
      return;
    }
    setSaving(true);
    setError('');
    const body = { ...current, name: asCopy ? `${current.name} (cópia)` : current.name, items: current.items.map(({ id: _id, ...item }) => { void _id; return item; }) };
    try {
      const id = asCopy ? undefined : draft.id;
      const saved = id
        ? await finRequest<FinProduct>(`/products/${id}`, tenantId, { method: 'PUT', body })
        : await finRequest<FinProduct>('/products', tenantId, { method: 'POST', body });
      setWorkspace((state) => state && ({
        ...state,
        products: (id ? state.products.map((item) => (item.id === saved.id ? saved : item)) : [...state.products, saved])
          .sort((a, b) => a.name.localeCompare(b.name)),
      }));
      if (asCopy) setDraft(toDraft(saved, saved.kind));
      else onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!draft.id || !confirm(`Excluir a ficha "${draft.name}"?`)) return;
    try {
      await finRequest(`/products/${draft.id}`, tenantId, { method: 'DELETE' });
      setWorkspace((state) => state && ({ ...state, products: state.products.filter((item) => item.id !== draft.id) }));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir.');
    }
  };

  const mainPricing = pricing[0];
  const mainContribution = mainPricing?.analysis ? mainPricing.analysis.contribution : null;
  const unitsToBreakEven = mainContribution !== null ? breakEvenUnits(fixedMonthly, mainContribution) : null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <aside className={styles.drawer} onClick={(event) => event.stopPropagation()} aria-label="Ficha técnica">
        <div className={styles.drawerHead}>
          <h2><ClipboardList size={20} style={{ verticalAlign: '-3px', marginRight: 8 }} />{draft.id ? draft.name || capitalize(terms.product) : `Adicionar ${draft.kind === 'base' ? terms.base : terms.product}`}</h2>
          <div className={styles.headerActions}>
            {!readOnly && draft.id && (
              <>
                <button className={`${styles.iconButton} ${styles.iconDanger}`} onClick={remove} title="Excluir"><Trash2 size={16} /></button>
                <button className={styles.secondaryButton} onClick={() => save(true)} disabled={saving}><Copy size={15} /> Duplicar</button>
              </>
            )}
            {!readOnly && <button className={styles.primaryButton} onClick={() => save(false)} disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</button>}
            <button className={styles.iconButton} onClick={onClose} title="Fechar"><X size={16} /></button>
          </div>
        </div>

        {error && <div className={styles.errorBanner}>{error}</div>}

        <div className={styles.drawerBody}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
            <section className={styles.panel}>
              <div className={styles.formGrid}>
                <label className={`${styles.field} ${styles.span2}`}>
                  Nome
                  <input className={styles.input} value={draft.name} onChange={(event) => set('name', event.target.value)} placeholder={`Ex.: ${draft.kind === 'base' ? example.base : example.product}`} disabled={readOnly} autoFocus={!draft.id} />
                </label>
                <label className={styles.field}>
                  Categoria
                  <input className={styles.input} value={draft.category} onChange={(event) => set('category', event.target.value)} placeholder="Ex.: Linha principal" disabled={readOnly} list="fin-categories" />
                  <datalist id="fin-categories">
                    {Array.from(new Set(products.map((item) => item.category).filter(Boolean))).map((item) => <option key={item} value={item} />)}
                  </datalist>
                </label>
                <label className={styles.field}>
                  Tipo
                  <select className={styles.input} value={draft.kind} onChange={(event) => set('kind', event.target.value as Draft['kind'])} disabled={readOnly}>
                    <option value="product">À venda</option>
                    <option value="base">{capitalize(terms.base)} (usado em outros)</option>
                  </select>
                </label>
                <label className={styles.field}>
                  {terms.yield}
                  <div className={styles.inputGroup}>
                    <input className={styles.input} inputMode="decimal" value={draft.yield_qty} onChange={(event) => set('yield_qty', event.target.value)} disabled={readOnly} />
                    <select className={styles.input} style={{ width: 'auto', maxWidth: 110, flex: 'none', paddingInline: 8 }} value={draft.yield_unit} onChange={(event) => set('yield_unit', event.target.value)} disabled={readOnly}>
                      {Array.from(new Set([...YIELD_UNITS, draft.yield_unit])).map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                    </select>
                  </div>
                </label>
                <label className={styles.field}>
                  {terms.prep}
                  <div className={styles.inputGroup}>
                    <input className={styles.input} inputMode="decimal" value={draft.prep_minutes} onChange={(event) => set('prep_minutes', event.target.value)} placeholder="0" disabled={readOnly} />
                    <span>min</span>
                  </div>
                </label>
                <label className={styles.field}>
                  Perda / quebra
                  <div className={styles.inputGroup}>
                    <input className={styles.input} inputMode="decimal" value={draft.loss_pct} onChange={(event) => set('loss_pct', event.target.value)} placeholder="0" disabled={readOnly} />
                    <span>%</span>
                  </div>
                </label>
                {draft.kind === 'product' && (
                  <label className={styles.field}>
                    Margem desejada
                    <div className={styles.inputGroup}>
                      <input className={styles.input} inputMode="decimal" value={draft.target_margin_pct} onChange={(event) => set('target_margin_pct', event.target.value)} placeholder={numText(settings.target_margin_pct)} disabled={readOnly} />
                      <span>%</span>
                    </div>
                  </label>
                )}
              </div>
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <h2><Calculator size={18} /> {terms.composition}</h2>
                {!readOnly && (
                  <div className={styles.headerActions}>
                    <button className={styles.secondaryButton} onClick={() => addItem('i')}><Plus size={15} /> {capitalize(terms.ingredient)}</button>
                    <button className={styles.secondaryButton} onClick={() => addItem('p')}><Plus size={15} /> {capitalize(terms.base)}</button>
                  </div>
                )}
              </div>
              {ingredients.length === 0 && <p className={styles.panelHint}>Cadastre os {terms.ingredients.toLowerCase()} na aba “{terms.ingredients}” para montar a lista.</p>}

              {draft.items.map((item, index) => {
                const line = cost.lines.find((entry) => entry.key === item.key);
                const ingredient = item.source.startsWith('i:') ? ingredientById.get(item.source.slice(2)) : undefined;
                const component = item.source.startsWith('p:') ? productById.get(item.source.slice(2)) : undefined;
                const isComponent = item.source.startsWith('p:');
                return (
                  <div key={item.key} className={styles.itemRow}>
                    <select className={styles.input} value={item.source} onChange={(event) => setItem(item.key, { source: event.target.value })} disabled={readOnly} aria-label={`Item ${index + 1}`}>
                      <option value={isComponent ? 'p:' : ''}>{isComponent ? `Escolha: ${terms.base}…` : `Escolha: ${terms.ingredient}…`}</option>
                      {isComponent ? (
                        bases.map((entry) => <option key={entry.id} value={`p:${entry.id}`}>{entry.name}</option>)
                      ) : (
                        Array.from(new Set([...business.categories.map((entry) => entry.key), ...ingredients.map((entry) => entry.category)])).map((category) => {
                          const list = ingredients.filter((entry) => entry.category === category);
                          return list.length > 0 && (
                            <optgroup key={category} label={categoryInfo(business, category).label}>
                              {list.map((entry) => <option key={entry.id} value={`i:${entry.id}`}>{entry.name}</option>)}
                            </optgroup>
                          );
                        })
                      )}
                    </select>
                    <input className={styles.input} inputMode="decimal" placeholder="Qtd." value={item.quantity} onChange={(event) => setItem(item.key, { quantity: event.target.value })} disabled={readOnly} />
                    {isComponent ? (
                      <span className={styles.muted}>{component?.yield_unit || '—'}</span>
                    ) : (
                      <select className={styles.input} value={item.unit} onChange={(event) => setItem(item.key, { unit: event.target.value as FinUnit })} disabled={readOnly}>
                        {(ingredient ? compatibleUnits(ingredient.purchase_unit) : (Object.keys(UNIT_INFO) as FinUnit[])).map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                      </select>
                    )}
                    <span className={styles.itemCost}>{line ? formatMoney(line.cost) : '—'}</span>
                    {!readOnly ? (
                      <button className={`${styles.iconButton} ${styles.iconDanger}`} onClick={() => removeItem(item.key)} title="Remover"><Trash2 size={14} /></button>
                    ) : <span />}
                    {line?.problem && <span className={styles.itemProblem}>{line.problem}</span>}
                  </div>
                );
              })}
              {draft.items.length === 0 && <div className={styles.empty}>Adicione os {terms.ingredients.toLowerCase()} e {terms.bases} usados aqui, com a quantidade de cada um.</div>}
            </section>

            {draft.kind === 'product' && (
              <section className={styles.panel}>
                <div className={styles.panelHeader}>
                  <h2><Tag size={18} /> Preço por canal de venda</h2>
                </div>
                <p className={styles.panelHint}>
                  Sugestão = custo ÷ (1 − impostos − taxas do canal − despesas fixas {formatPct(fixedPct)} − margem {formatPct(targetMargin, 0)}).
                  {base.source === 'expected'
                    ? base.value > 0 ? ' Despesas fixas rateadas pelo faturamento esperado (Despesas e canais).' : ' Informe o faturamento esperado em “Despesas e canais” para ratear as despesas fixas.'
                    : ` Despesas fixas rateadas pela média de ${base.months} mês(es) de vendas.`}
                  {' '}Clique na sugestão para usar.
                </p>
                <div className={styles.tableWrap}>
                  <table className={`${styles.table} ${styles.priceTable}`}>
                    <thead>
                      <tr>
                        <th>Canal</th>
                        <th className={styles.num}>Custo + taxas</th>
                        <th className={styles.num}>Sugerido</th>
                        <th className={styles.num}>Seu preço</th>
                        <th className={styles.num}>Lucro / un</th>
                        <th className={styles.num}>Margem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pricing.map((row, index) => {
                        const isMain = index === 0;
                        const value = isMain ? draft.sale_price : (draft.channel_prices[row.channel.id] ?? '');
                        const analysis = row.analysis;
                        return (
                          <tr key={row.channel.id}>
                            <td>
                              <strong>{row.channel.name}</strong>
                              <div className={styles.muted} style={{ fontSize: '0.74rem' }}>
                                taxas {formatPct(row.variablePct)}{isMain ? ' · preço padrão' : ''}
                              </div>
                            </td>
                            <td className={styles.num}>{formatMoney(row.unitVariableCost)}</td>
                            <td className={styles.num}>
                              {row.roundedPrice === null ? (
                                <span className={styles.bad} title="Taxas + despesas + margem passam de 95%">inviável</span>
                              ) : (
                                <button className={styles.suggest} onClick={() => !readOnly && applySuggested(row.channel.id, row.roundedPrice as number, isMain)} disabled={readOnly}>
                                  {formatMoney(row.roundedPrice)}
                                  <small>exato {formatMoney(row.suggestedPrice as number)}</small>
                                </button>
                              )}
                            </td>
                            <td className={styles.num}>
                              <input
                                className={styles.input}
                                inputMode="decimal"
                                value={value}
                                placeholder={isMain ? '0,00' : numText(current.sale_price) || '0,00'}
                                onChange={(event) => (isMain
                                  ? set('sale_price', event.target.value)
                                  : set('channel_prices', { ...draft.channel_prices, [row.channel.id]: event.target.value }))}
                                disabled={readOnly}
                              />
                            </td>
                            <td className={`${styles.num} ${analysis && analysis.netProfit < 0 ? styles.bad : ''}`}>{analysis ? formatMoney(analysis.netProfit) : '—'}</td>
                            <td className={styles.num}>
                              {analysis ? <span className={`${styles.tag} ${marginTone(analysis.netMarginPct, targetMargin)}`}>{formatPct(analysis.netMarginPct)}</span> : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {pricing.length === 0 && <div className={styles.empty}>Cadastre um canal de venda em “Despesas e canais”.</div>}
                </div>
              </section>
            )}

            <label className={styles.field}>
              Observações e modo de fazer
              <textarea className={styles.input} rows={3} value={draft.notes} onChange={(event) => set('notes', event.target.value)} disabled={readOnly} />
            </label>
          </div>

          <div className={styles.sticky}>
            <section className={styles.panel}>
              <span className={styles.muted} style={{ fontSize: '0.82rem' }}>Custo por {draft.yield_unit || 'unidade'}</span>
              <div className={styles.bigNumber}>{formatMoney(cost.unitCost)}</div>
              <span className={styles.muted} style={{ fontSize: '0.8rem' }}>
                Custo total: {formatMoney(cost.batchTotal)} · {terms.yield.toLowerCase()}: {formatQty(current.yield_qty)} {current.yield_unit}
              </span>
              <div className={styles.costList} style={{ marginTop: 16 }}>
                <div><span>{terms.ingredients}</span><strong>{formatMoney(cost.ingredients)}</strong></div>
                {cost.bases > 0 && <div><span>{capitalize(terms.bases)}</span><strong>{formatMoney(cost.bases)}</strong></div>}
                <div><span>Embalagens</span><strong>{formatMoney(cost.packaging)}</strong></div>
                {cost.other > 0 && <div><span>Outros custos</span><strong>{formatMoney(cost.other)}</strong></div>}
                <div><span>Perda ({formatPct(current.loss_pct, 0)})</span><strong>{formatMoney(cost.loss)}</strong></div>
                <div>
                  <span>Mão de obra {settings.labor_hour_cost > 0 ? `(${formatQty(current.prep_minutes)} min)` : ''}</span>
                  <strong>{settings.labor_hour_cost > 0 ? formatMoney(cost.labor) : <span className={styles.muted}>não configurada</span>}</strong>
                </div>
                <div className={styles.costTotal}><span>Custo total</span><strong>{formatMoney(cost.batchTotal)}</strong></div>
              </div>
            </section>

            {draft.kind === 'product' && mainPricing?.analysis && (
              <section className={styles.panel}>
                <span className={styles.muted} style={{ fontSize: '0.82rem' }}>No {mainPricing.channel.name.toLowerCase()} a {formatMoney(mainPricing.currentPrice)}</span>
                <div className={`${styles.bigNumber} ${mainPricing.analysis.netProfit < 0 ? styles.bad : styles.good}`}>
                  {formatMoney(mainPricing.analysis.netProfit)}
                </div>
                <span className={styles.muted} style={{ fontSize: '0.8rem' }}>de lucro líquido por {draft.yield_unit || 'unidade'} ({formatPct(mainPricing.analysis.netMarginPct)})</span>
                <div className={styles.costList} style={{ marginTop: 16 }}>
                  <div><span>Preço</span><strong>{formatMoney(mainPricing.analysis.price)}</strong></div>
                  <div><span>− Custo do produto</span><strong>{formatMoney(mainPricing.unitVariableCost)}</strong></div>
                  <div><span>− Impostos</span><strong>{formatMoney(mainPricing.analysis.taxes)}</strong></div>
                  <div><span>− Taxas / comissão</span><strong>{formatMoney(mainPricing.analysis.fees)}</strong></div>
                  <div><span>= Margem de contribuição</span><strong>{formatMoney(mainPricing.analysis.contribution)}</strong></div>
                  <div><span>− Despesas fixas ({formatPct(fixedPct)})</span><strong>{formatMoney(mainPricing.analysis.fixedShare)}</strong></div>
                  <div className={styles.costTotal}><span>Markup</span><strong>{mainPricing.analysis.markup.toFixed(2).replace('.', ',')}×</strong></div>
                </div>
                {unitsToBreakEven !== null && fixedMonthly > 0 && (
                  <p className={styles.panelHint} style={{ margin: '14px 0 0' }}>
                    Só com este produto, seriam <strong>{unitsToBreakEven.toLocaleString('pt-BR')} {draft.yield_unit}/mês</strong> para pagar as despesas fixas ({formatMoney(fixedMonthly)}).
                  </p>
                )}
              </section>
            )}

            {cost.warnings.length > 0 && (
              <ul className={styles.warningList}>
                {cost.warnings.map((warning) => <li key={warning}><AlertTriangle size={12} style={{ verticalAlign: '-1px' }} /> {warning}</li>)}
              </ul>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
