'use client';

import React, { useMemo, useState } from 'react';
import { AlertTriangle, ClipboardList, Layers, Plus, Search, Tag } from 'lucide-react';
import styles from '../financeiro.module.css';
import { currentMonth } from '../api';
import { marginTone, pricingBase, type TabProps } from './shared';
import ProductEditor from './ProductEditor';
import { buildCostContext, computeProductCost, formatMoney, formatPct, priceForChannel } from '@/lib/finance/calc';
import type { FinProduct } from '@/lib/finance/types';
import { capitalize, presetFor } from '@/lib/finance/business';

export default function ProductsTab(props: TabProps) {
  const { workspace } = props;
  const { products, ingredients, settings, channels, access, business } = workspace;
  const terms = business.terms;
  const example = presetFor(business.type).examples;
  const [editing, setEditing] = useState<{ product: FinProduct | null; kind: 'product' | 'base' } | null>(null);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<'product' | 'base'>('product');

  const { fixedPct } = useMemo(() => pricingBase(workspace, currentMonth()), [workspace]);
  const mainChannel = channels.find((channel) => channel.active) || null;

  const rows = useMemo(() => {
    const ctx = buildCostContext(products, ingredients, settings, business.categories);
    return products.map((product) => {
      const cost = computeProductCost(product, ctx);
      const pricing = mainChannel ? priceForChannel(product, cost.unitCost, mainChannel, settings, fixedPct) : null;
      return { product, cost, pricing, target: product.target_margin_pct ?? settings.target_margin_pct };
    });
  }, [products, ingredients, settings, business.categories, mainChannel, fixedPct]);

  const visible = rows.filter((row) =>
    row.product.kind === kind && row.product.name.toLowerCase().includes(query.trim().toLowerCase())
  );
  const counts = { product: rows.filter((row) => row.product.kind === 'product').length, base: rows.filter((row) => row.product.kind === 'base').length };

  return (
    <>
      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2><ClipboardList size={18} /> {terms.products}</h2>
          {access.canManage && (
            <button className={styles.primaryButton} onClick={() => setEditing({ product: null, kind })}>
              <Plus size={16} /> Adicionar {kind === 'base' ? terms.base : terms.product}
            </button>
          )}
        </div>
        <p className={styles.panelHint}>
          Em cada {terms.product}, liste o que vai nele e as quantidades ({terms.composition.toLowerCase()}): o sistema soma os {terms.ingredients.toLowerCase()}, a perda e o tempo de trabalho e mostra o custo de cada unidade e o preço certo em cada canal.
          Use <strong>{terms.bases}</strong> para o que você monta uma vez e usa em vários itens (ex.: {example.base}).
        </p>

        <div className={styles.toolbar}>
          <div className={styles.tabs} style={{ padding: 4 }}>
            <button className={`${styles.tab} ${kind === 'product' ? styles.tabActive : ''}`} onClick={() => setKind('product')}>
              <Tag size={15} /> À venda ({counts.product})
            </button>
            <button className={`${styles.tab} ${kind === 'base' ? styles.tabActive : ''}`} onClick={() => setKind('base')}>
              <Layers size={15} /> {capitalize(terms.bases)} ({counts.base})
            </button>
          </div>
          <div className={styles.inputGroup} style={{ maxWidth: 280 }}>
            <span><Search size={15} /></span>
            <input className={styles.input} placeholder={`Buscar ${terms.product}`} value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
        </div>

        {visible.length === 0 ? (
          <div className={styles.empty}>
            {rows.length === 0
              ? `Nada cadastrado ainda. Comece pelos ${terms.ingredients.toLowerCase()} e depois clique em Adicionar ${terms.product}.`
              : 'Nada por aqui com esse filtro.'}
          </div>
        ) : (
          <div className={styles.productGrid}>
            {visible.map(({ product, cost, pricing, target }) => {
              const analysis = pricing?.analysis;
              const margin = analysis?.netMarginPct ?? null;
              const width = margin === null ? 0 : Math.max(0, Math.min(100, margin * 2));
              return (
                <button key={product.id} className={styles.productCard} onClick={() => setEditing({ product, kind: product.kind })}>
                  <header>
                    <div>
                      <h3>{product.name}</h3>
                      <span className={styles.muted} style={{ fontSize: '0.78rem' }}>
                        {product.category || 'Sem categoria'} · {terms.yield.toLowerCase()}: {product.yield_qty.toLocaleString('pt-BR')} {product.yield_unit}
                      </span>
                    </div>
                    {cost.warnings.length > 0 && <span className={`${styles.tag} ${styles.tagWarn}`} title={cost.warnings.join('\n')}><AlertTriangle size={12} /> revisar</span>}
                  </header>

                  {product.kind === 'base' ? (
                    <div className={styles.productStats}>
                      <div><span>Custo / {product.yield_unit}</span><strong>{formatMoney(cost.unitCost)}</strong></div>
                      <div><span>Custo total</span><strong>{formatMoney(cost.batchTotal)}</strong></div>
                      <div><span>Itens</span><strong>{product.items.length}</strong></div>
                    </div>
                  ) : (
                    <>
                      <div className={styles.productStats}>
                        <div><span>Custo / {product.yield_unit}</span><strong>{formatMoney(cost.unitCost)}</strong></div>
                        <div><span>Preço</span><strong>{product.sale_price > 0 ? formatMoney(product.sale_price) : '—'}</strong></div>
                        <div>
                          <span>Lucro / un</span>
                          <strong className={analysis && analysis.netProfit < 0 ? styles.bad : ''}>{analysis ? formatMoney(analysis.netProfit) : '—'}</strong>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <span className={styles.muted} style={{ fontSize: '0.75rem' }}>
                          {product.sale_price > 0 ? `Margem líquida (meta ${formatPct(target, 0)})` : pricing?.roundedPrice ? `Sugerido: ${formatMoney(pricing.roundedPrice)}` : 'Defina o preço'}
                        </span>
                        {margin !== null && <span className={`${styles.tag} ${marginTone(margin, target)}`}>{formatPct(margin)}</span>}
                      </div>
                      <div className={styles.marginBar}>
                        <div style={{ width: `${width}%`, background: margin !== null && margin < 0 ? 'var(--bad)' : margin !== null && margin < target ? 'var(--warn)' : 'var(--good)' }} />
                        <span className={styles.marginTarget} style={{ left: `${Math.min(100, target * 2)}%` }} />
                      </div>
                    </>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {editing && (
        <ProductEditor {...props} product={editing.product} initialKind={editing.kind} onClose={() => setEditing(null)} />
      )}
    </>
  );
}
