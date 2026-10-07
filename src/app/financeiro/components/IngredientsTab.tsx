'use client';

import React, { useMemo, useState } from 'react';
import { Check, Package, Pencil, Plus, Search, Settings2, Trash2, X } from 'lucide-react';
import styles from '../financeiro.module.css';
import { finRequest, numText, toNum } from '../api';
import type { TabProps } from './shared';
import { BASE_DISPLAY, UNIT_INFO, UNITS, formatMoney, formatQty, ingredientBaseCost } from '@/lib/finance/calc';
import { capitalize, categoryInfo, presetFor } from '@/lib/finance/business';
import type { FinIngredient, FinUnit, IngredientCategory } from '@/lib/finance/types';

interface Draft {
  id?: string;
  name: string;
  category: IngredientCategory;
  purchase_qty: string;
  purchase_unit: FinUnit;
  purchase_price: string;
  supplier: string;
}

/** "R$ 4,50 / kg" — custo na unidade que a pessoa pensa (kg, litro, metro, hora...). */
export function unitPriceLabel(ingredient: Pick<FinIngredient, 'purchase_unit' | 'purchase_qty' | 'purchase_price'>) {
  const display = BASE_DISPLAY[UNIT_INFO[ingredient.purchase_unit].base];
  return `${formatMoney(ingredientBaseCost(ingredient) * display.per)} / ${display.label}`;
}

export default function IngredientsTab({ workspace, tenantId, setWorkspace, onNavigate }: TabProps) {
  const { ingredients, products, access, business } = workspace;
  const terms = business.terms;
  const example = presetFor(business.type).examples;
  const defaultUnit = (UNITS.includes(example.ingredientUnit as FinUnit) ? example.ingredientUnit : 'un') as FinUnit;
  const EMPTY: Draft = { name: '', category: business.categories[0]?.key || 'outro', purchase_qty: '1', purchase_unit: defaultUnit, purchase_price: '', supplier: '' };
  const label = (key: string) => categoryInfo(business, key).label;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'all' | IngredientCategory>('all');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const usage = useMemo(() => {
    const map = new Map<string, number>();
    for (const product of products) {
      for (const item of product.items) {
        if (item.ingredient_id) map.set(item.ingredient_id, (map.get(item.ingredient_id) || 0) + 1);
      }
    }
    return map;
  }, [products]);

  const term = query.trim().toLowerCase();
  const visible = ingredients.filter((item) =>
    (category === 'all' || item.category === category) &&
    (item.name.toLowerCase().includes(term) || item.supplier.toLowerCase().includes(term))
  );

  // Soma do que foi pago em cada item cadastrado: geral, por tipo e no filtro atual.
  const totals = useMemo(() => {
    const byCategory = new Map<string, { total: number; count: number }>();
    let total = 0;
    for (const item of ingredients) {
      total += item.purchase_price;
      const entry = byCategory.get(item.category) || { total: 0, count: 0 };
      entry.total += item.purchase_price;
      entry.count += 1;
      byCategory.set(item.category, entry);
    }
    const order = business.categories.map((item) => item.key);
    const groups = [...byCategory.entries()].sort((a, b) => (order.indexOf(a[0]) + 1 || 99) - (order.indexOf(b[0]) + 1 || 99));
    return { total, groups, missingPrice: ingredients.filter((item) => item.purchase_price <= 0).length };
  }, [ingredients, business.categories]);
  const visibleTotal = visible.reduce((sum, item) => sum + item.purchase_price, 0);
  const filtered = visible.length !== ingredients.length;
  const categoryKeys = Array.from(new Set([...business.categories.map((item) => item.key), ...ingredients.map((item) => item.category)]));

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    setSaving(true);
    setError('');
    const body = {
      name: draft.name,
      category: draft.category,
      purchase_qty: toNum(draft.purchase_qty, 1),
      purchase_unit: draft.purchase_unit,
      purchase_price: toNum(draft.purchase_price),
      supplier: draft.supplier,
    };
    try {
      const saved = draft.id
        ? await finRequest<FinIngredient>(`/ingredients/${draft.id}`, tenantId, { method: 'PUT', body })
        : await finRequest<FinIngredient>('/ingredients', tenantId, { method: 'POST', body });
      setWorkspace((current) => current && ({
        ...current,
        ingredients: draft.id
          ? current.ingredients.map((item) => (item.id === saved.id ? saved : item))
          : [...current.ingredients, saved].sort((a, b) => a.name.localeCompare(b.name)),
      }));
      setDraft(draft.id ? null : { ...EMPTY, category: draft.category, purchase_unit: draft.purchase_unit });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (ingredient: FinIngredient) => {
    if (!confirm(`Excluir "${ingredient.name}"?`)) return;
    try {
      await finRequest(`/ingredients/${ingredient.id}`, tenantId, { method: 'DELETE' });
      setWorkspace((current) => current && ({ ...current, ingredients: current.ingredients.filter((item) => item.id !== ingredient.id) }));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao excluir.');
    }
  };

  const edit = (ingredient: FinIngredient) => setDraft({
    id: ingredient.id,
    name: ingredient.name,
    category: ingredient.category,
    purchase_qty: numText(ingredient.purchase_qty),
    purchase_unit: ingredient.purchase_unit,
    purchase_price: numText(ingredient.purchase_price),
    supplier: ingredient.supplier,
  });

  const preview = draft && toNum(draft.purchase_qty) > 0
    ? unitPriceLabel({ purchase_unit: draft.purchase_unit, purchase_qty: toNum(draft.purchase_qty), purchase_price: toNum(draft.purchase_price) })
    : null;

  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <h2><Package size={18} /> {terms.ingredients} ({ingredients.length})</h2>
        <div className={styles.headerActions}>
          {access.canManage && onNavigate && (
            <button className={styles.secondaryButton} onClick={() => onNavigate('business')}><Settings2 size={16} /> Tipos e nomes</button>
          )}
          {access.canManage && !draft && (
            <button className={styles.primaryButton} onClick={() => setDraft({ ...EMPTY })}><Plus size={16} /> Adicionar {terms.ingredient}</button>
          )}
        </div>
      </div>
      <p className={styles.panelHint}>
        Cadastre como você compra: o nome (ex.: {example.ingredient.toLowerCase()}), a quantidade, a unidade e o preço pago. O sistema calcula o custo por {UNIT_INFO[defaultUnit].label} e usa em {terms.products.toLowerCase()}.
        Quando o preço mudar, edite aqui: tudo que usa este item se atualiza.
      </p>

      {ingredients.length > 0 && (
        <div className={styles.totalsRow}>
          <button type="button" className={`${styles.totalCard} ${category === 'all' ? styles.totalCardOn : ''}`} onClick={() => setCategory('all')}>
            <span>Total comprado</span>
            <strong>{formatMoney(totals.total)}</strong>
            <small>{ingredients.length} {ingredients.length === 1 ? terms.ingredient : terms.ingredients.toLowerCase()}{totals.missingPrice ? ` · ${totals.missingPrice} sem preço` : ''}</small>
          </button>
          {totals.groups.map(([key, entry]) => (
            <button key={key} type="button" className={`${styles.totalCard} ${category === key ? styles.totalCardOn : ''}`} onClick={() => setCategory(category === key ? 'all' : key)}>
              <span>{label(key)}</span>
              <strong>{formatMoney(entry.total)}</strong>
              <small>{entry.count} item(ns) · {totals.total > 0 ? Math.round((entry.total / totals.total) * 100) : 0}%</small>
            </button>
          ))}
        </div>
      )}

      {error && <div className={styles.errorBanner} style={{ marginBottom: 12 }}>{error}</div>}

      {draft && (
        <form className={styles.formRow} style={{ gridTemplateColumns: '2fr 1.2fr 0.8fr 0.9fr 1fr 1.2fr auto' }} onSubmit={save}>
          <label className={styles.field}>
            Nome
            <input className={styles.input} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder={`Ex.: ${example.ingredient}`} required autoFocus />
          </label>
          <label className={styles.field}>
            Tipo
            <select className={styles.input} value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value as IngredientCategory })}>
              {Array.from(new Set([...business.categories.map((item) => item.key), draft.category])).map((key) => <option key={key} value={key}>{label(key)}</option>)}
            </select>
          </label>
          <label className={styles.field}>
            Qtd. comprada
            <input className={styles.input} inputMode="decimal" value={draft.purchase_qty} onChange={(event) => setDraft({ ...draft, purchase_qty: event.target.value })} required />
          </label>
          <label className={styles.field}>
            Unidade
            <select className={styles.input} value={draft.purchase_unit} onChange={(event) => setDraft({ ...draft, purchase_unit: event.target.value as FinUnit })}>
              {UNITS.map((unit) => <option key={unit} value={unit}>{UNIT_INFO[unit].label}</option>)}
            </select>
          </label>
          <label className={styles.field}>
            Preço pago (R$)
            <input className={styles.input} inputMode="decimal" value={draft.purchase_price} onChange={(event) => setDraft({ ...draft, purchase_price: event.target.value })} placeholder="0,00" required />
          </label>
          <label className={styles.field}>
            Fornecedor <small>(opcional)</small>
            <input className={styles.input} value={draft.supplier} onChange={(event) => setDraft({ ...draft, supplier: event.target.value })} />
          </label>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="submit" className={styles.primaryButton} disabled={saving} title="Salvar"><Check size={16} /></button>
            <button type="button" className={styles.secondaryButton} onClick={() => setDraft(null)} title="Cancelar"><X size={16} /></button>
          </div>
          {preview && <small className={styles.muted} style={{ gridColumn: '1 / -1' }}>Custo calculado: <strong>{preview}</strong></small>}
        </form>
      )}

      <div className={styles.toolbar}>
        <div className={styles.inputGroup} style={{ maxWidth: 280 }}>
          <span><Search size={15} /></span>
          <input className={styles.input} placeholder={`Buscar ${terms.ingredient} ou fornecedor`} value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
        <select className={styles.input} style={{ maxWidth: 200 }} value={category} onChange={(event) => setCategory(event.target.value as typeof category)}>
          <option value="all">Todos os tipos</option>
          {categoryKeys.map((key) => <option key={key} value={key}>{label(key)}</option>)}
        </select>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>{capitalize(terms.ingredient)}</th>
              <th>Tipo</th>
              <th className={styles.num}>Compra</th>
              <th className={styles.num}>Preço pago</th>
              <th className={styles.num}>Custo</th>
              <th>Usado em</th>
              {access.canManage && <th />}
            </tr>
          </thead>
          <tbody>
            {visible.map((item) => (
              <tr key={item.id}>
                <td>
                  <strong>{item.name}</strong>
                  {item.supplier && <div className={styles.muted} style={{ fontSize: '0.78rem' }}>{item.supplier}</div>}
                </td>
                <td><span className={styles.tag}>{label(item.category)}</span></td>
                <td className={styles.num}>{formatQty(item.purchase_qty)} {item.purchase_unit}</td>
                <td className={styles.num}>{formatMoney(item.purchase_price)}</td>
                <td className={styles.num}>
                  {item.purchase_price > 0 ? <strong>{unitPriceLabel(item)}</strong> : <span className={styles.tagWarn + ' ' + styles.tag}>sem preço</span>}
                </td>
                <td className={styles.muted}>{usage.get(item.id) ? `${usage.get(item.id)} item(ns)` : '—'}</td>
                {access.canManage && (
                  <td>
                    <div className={styles.rowActions}>
                      <button className={styles.iconButton} onClick={() => edit(item)} title="Editar"><Pencil size={15} /></button>
                      <button className={`${styles.iconButton} ${styles.iconDanger}`} onClick={() => remove(item)} title="Excluir"><Trash2 size={15} /></button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          {visible.length > 0 && (
            <tfoot>
              <tr className={styles.totalRow}>
                <td colSpan={3}>{filtered ? `Total do filtro (${visible.length} de ${ingredients.length})` : `Total (${visible.length})`}</td>
                <td className={styles.num}><strong>{formatMoney(visibleTotal)}</strong></td>
                <td colSpan={access.canManage ? 3 : 2} />
              </tr>
            </tfoot>
          )}
        </table>
        {visible.length === 0 && (
          <div className={styles.empty}>
            {ingredients.length === 0 ? `Nada cadastrado ainda. Clique em Adicionar ${terms.ingredient} ou traga da sua planilha em “Importar planilha”.` : 'Nada encontrado com esse filtro.'}
          </div>
        )}
      </div>
    </section>
  );
}
