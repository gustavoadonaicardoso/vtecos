'use client';

import React, { useMemo, useState } from 'react';
import { Check, Package, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import styles from '../financeiro.module.css';
import { finRequest, numText, toNum } from '../api';
import type { TabProps } from './shared';
import { UNIT_INFO, UNITS, formatMoney, formatQty, ingredientBaseCost } from '@/lib/finance/calc';
import type { FinIngredient, FinUnit, IngredientCategory } from '@/lib/finance/types';

const CATEGORY_LABEL: Record<IngredientCategory, string> = {
  ingrediente: 'Ingrediente',
  embalagem: 'Embalagem',
  outro: 'Outro material',
};

interface Draft {
  id?: string;
  name: string;
  category: IngredientCategory;
  purchase_qty: string;
  purchase_unit: FinUnit;
  purchase_price: string;
  supplier: string;
}

const EMPTY: Draft = { name: '', category: 'ingrediente', purchase_qty: '1', purchase_unit: 'kg', purchase_price: '', supplier: '' };

/** "R$ 4,50 / kg" — custo na unidade que a pessoa pensa (kg, litro, unidade). */
export function unitPriceLabel(ingredient: Pick<FinIngredient, 'purchase_unit' | 'purchase_qty' | 'purchase_price'>) {
  const base = ingredientBaseCost(ingredient);
  const unit = UNIT_INFO[ingredient.purchase_unit].base;
  if (unit === 'g') return `${formatMoney(base * 1000)} / kg`;
  if (unit === 'ml') return `${formatMoney(base * 1000)} / litro`;
  return `${formatMoney(base)} / un`;
}

export default function IngredientsTab({ workspace, tenantId, setWorkspace }: TabProps) {
  const { ingredients, products, access } = workspace;
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

  const visible = ingredients.filter((item) =>
    (category === 'all' || item.category === category) &&
    item.name.toLowerCase().includes(query.trim().toLowerCase())
  );

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
    if (!confirm(`Excluir o insumo "${ingredient.name}"?`)) return;
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
        <h2><Package size={18} /> Insumos ({ingredients.length})</h2>
        {access.canManage && !draft && (
          <button className={styles.primaryButton} onClick={() => setDraft({ ...EMPTY })}><Plus size={16} /> Novo insumo</button>
        )}
      </div>
      <p className={styles.panelHint}>
        Cadastre como você compra (ex.: farinha, pacote de 5 kg por R$ 25). O sistema calcula o custo por grama, ml ou unidade e usa nas fichas técnicas.
        Quando o preço mudar, edite aqui: todas as fichas se atualizam.
      </p>

      {error && <div className={styles.errorBanner} style={{ marginBottom: 12 }}>{error}</div>}

      {draft && (
        <form className={styles.formRow} style={{ gridTemplateColumns: '2fr 1.2fr 0.8fr 0.9fr 1fr 1.2fr auto' }} onSubmit={save}>
          <label className={styles.field}>
            Nome
            <input className={styles.input} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Ex.: Farinha de trigo" required autoFocus />
          </label>
          <label className={styles.field}>
            Tipo
            <select className={styles.input} value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value as IngredientCategory })}>
              {Object.entries(CATEGORY_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
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
          <input className={styles.input} placeholder="Buscar insumo" value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
        <select className={styles.input} style={{ maxWidth: 200 }} value={category} onChange={(event) => setCategory(event.target.value as typeof category)}>
          <option value="all">Todos os tipos</option>
          {Object.entries(CATEGORY_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Insumo</th>
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
                <td><span className={styles.tag}>{CATEGORY_LABEL[item.category]}</span></td>
                <td className={styles.num}>{formatQty(item.purchase_qty)} {item.purchase_unit}</td>
                <td className={styles.num}>{formatMoney(item.purchase_price)}</td>
                <td className={styles.num}>
                  {item.purchase_price > 0 ? <strong>{unitPriceLabel(item)}</strong> : <span className={styles.tagWarn + ' ' + styles.tag}>sem preço</span>}
                </td>
                <td className={styles.muted}>{usage.get(item.id) ? `${usage.get(item.id)} ficha(s)` : '—'}</td>
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
        </table>
        {visible.length === 0 && (
          <div className={styles.empty}>
            {ingredients.length === 0 ? 'Nenhum insumo ainda. Cadastre aqui ou traga da sua planilha em “Importar planilha”.' : 'Nada encontrado com esse filtro.'}
          </div>
        )}
      </div>
    </section>
  );
}
