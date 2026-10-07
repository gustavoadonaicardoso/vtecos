'use client';

import React, { useMemo, useState } from 'react';
import { Check, Loader2, Plus, RotateCcw, Save, Shapes, Store, Trash2, Type } from 'lucide-react';
import styles from '../financeiro.module.css';
import { finRequest } from '../api';
import type { TabProps } from './shared';
import {
  BUSINESS_PRESETS,
  GROUP_LABEL,
  TERM_INFO,
  presetFor,
  type BusinessType,
  type CategoryGroup,
  type FinBusiness,
  type IngredientCategoryDef,
  type Terms,
} from '@/lib/finance/business';

type CategoryDraft = IngredientCategoryDef & { isNew?: boolean };

/**
 * Meu negócio: ramo (modelo pronto), nomes das telas e tipos do que a
 * empresa compra. Tudo editável; trocar de ramo não apaga nada.
 */
export default function BusinessTab({ workspace, tenantId, setWorkspace }: TabProps) {
  const { business, ingredients, access } = workspace;
  const readOnly = !access.canManage;
  const preset = presetFor(business.type);
  const [terms, setTerms] = useState<Partial<Terms>>(business.customTerms);
  const [categories, setCategories] = useState<CategoryDraft[]>(business.categories);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  const usage = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of ingredients) map.set(item.category, (map.get(item.category) || 0) + 1);
    return map;
  }, [ingredients]);

  const apply = (next: FinBusiness, message: string) => {
    setWorkspace((current) => current && ({ ...current, business: next }));
    setTerms(next.customTerms);
    setCategories(next.categories);
    setSaved(message);
    setTimeout(() => setSaved(''), 3000);
  };

  const chooseType = async (type: BusinessType) => {
    if (readOnly || type === business.type) return;
    const target = presetFor(type);
    if (business.type && !confirm(`Mudar para "${target.label}"? Os nomes das telas e os tipos voltam ao padrão desse ramo. Nada é apagado: tipos que já têm itens continuam.`)) return;
    setBusy(type);
    setError('');
    try {
      apply(await finRequest<FinBusiness>('/business', tenantId, { method: 'POST', body: { type, applyPreset: true } }), `Ramo: ${target.label}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar.');
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    setBusy('save');
    setError('');
    try {
      const body = { type: business.type || preset.type, terms, categories: categories.map(({ key, label, group, isNew }) => ({ key: isNew ? undefined : key, label, group })) };
      apply(await finRequest<FinBusiness>('/business', tenantId, { method: 'POST', body }), 'Nomes e tipos salvos.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar.');
    } finally {
      setBusy(null);
    }
  };

  const setCategory = (index: number, patch: Partial<CategoryDraft>) =>
    setCategories((current) => current.map((item, position) => (position === index ? { ...item, ...patch } : item)));

  return (
    <>
      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2><Store size={18} /> Ramo do negócio</h2>
          {saved && <span className={`${styles.tag} ${styles.tagGood}`}><Check size={12} /> {saved}</span>}
        </div>
        <p className={styles.panelHint}>
          Escolha o modelo mais parecido com o seu negócio: ele ajusta os nomes das telas, os tipos do que você compra e os exemplos. Depois dá para mudar qualquer nome abaixo.
          {!business.type && ' Hoje está no modelo padrão (alimentação).'}
        </p>
        {error && <div className={styles.errorBanner} style={{ marginBottom: 12 }}>{error}</div>}
        <div className={styles.presetGrid}>
          {BUSINESS_PRESETS.map((item) => {
            const active = (business.type || null) === item.type;
            return (
              <button
                key={item.type}
                type="button"
                className={`${styles.presetCard} ${active ? styles.presetCardOn : ''}`}
                onClick={() => chooseType(item.type)}
                disabled={readOnly || Boolean(busy)}
                aria-pressed={active}
              >
                <strong>{busy === item.type ? <Loader2 size={14} className={styles.spin} /> : active ? <Check size={14} /> : null} {item.label}</strong>
                <span>{item.description}</span>
                <small>{item.terms.ingredients} → {item.terms.products}</small>
              </button>
            );
          })}
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2><Type size={18} /> Nomes nas telas</h2>
          {!readOnly && Object.keys(terms).length > 0 && (
            <button className={styles.secondaryButton} onClick={() => setTerms({})}><RotateCcw size={15} /> Voltar ao padrão do ramo</button>
          )}
        </div>
        <p className={styles.panelHint}>Deixe em branco para usar o nome do ramo (aparece em cinza).</p>
        <div className={styles.formGrid}>
          {TERM_INFO.map((info) => (
            <label key={info.key} className={styles.field}>
              {info.label}
              <input
                className={styles.input}
                value={terms[info.key] || ''}
                placeholder={preset.terms[info.key]}
                maxLength={40}
                disabled={readOnly}
                onChange={(event) => setTerms((current) => ({ ...current, [info.key]: event.target.value }))}
              />
              <small className={styles.muted}>{info.hint}</small>
            </label>
          ))}
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2><Shapes size={18} /> Tipos de {business.terms.ingredients.toLowerCase()}</h2>
          {!readOnly && (
            <button className={styles.secondaryButton} onClick={() => setCategories((current) => [...current, { key: `novo_${current.length}`, label: '', group: 'material', isNew: true }])} disabled={categories.length >= 20}>
              <Plus size={15} /> Novo tipo
            </button>
          )}
        </div>
        <p className={styles.panelHint}>
          Separe o que você compra do seu jeito (ex.: tecidos, aviamentos, revenda). &quot;Entra como&quot; diz em que linha o custo aparece no detalhe de cada {business.terms.product}: material, embalagem ou outros custos.
        </p>
        <div className={styles.categoryList}>
          {categories.map((item, index) => {
            const count = usage.get(item.key) || 0;
            return (
              <div key={`${item.key}-${index}`} className={styles.categoryRow}>
                <input className={styles.input} value={item.label} placeholder="Nome do tipo" maxLength={40} disabled={readOnly} onChange={(event) => setCategory(index, { label: event.target.value })} aria-label="Nome do tipo" />
                <select className={styles.input} value={item.group} disabled={readOnly} onChange={(event) => setCategory(index, { group: event.target.value as CategoryGroup })} aria-label="Entra como">
                  {(Object.keys(GROUP_LABEL) as CategoryGroup[]).map((group) => <option key={group} value={group}>{GROUP_LABEL[group]}</option>)}
                </select>
                <span className={styles.muted} style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{count ? `${count} item(ns)` : 'sem itens'}</span>
                {!readOnly && (
                  <button
                    className={`${styles.iconButton} ${styles.iconDanger}`}
                    onClick={() => setCategories((current) => current.filter((_, position) => position !== index))}
                    disabled={count > 0 || categories.length <= 1}
                    title={count > 0 ? 'Mude o tipo dos itens antes de apagar' : 'Apagar tipo'}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {!readOnly && (
        <div className={styles.saveBar}>
          <button className={styles.primaryButton} onClick={save} disabled={Boolean(busy) || categories.some((item) => !item.label.trim())}>
            {busy === 'save' ? <Loader2 size={16} className={styles.spin} /> : <Save size={16} />} Salvar nomes e tipos
          </button>
        </div>
      )}
    </>
  );
}
