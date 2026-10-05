'use client';

import { useState } from 'react';
import { Loader2, Plus, Trash2, X } from 'lucide-react';
import styles from '../leads.module.css';
import type { LeadTag } from '@/types';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#64748b'];

interface TagsManagerProps {
  tags: LeadTag[];
  onChanged: () => Promise<void>;
  onClose: () => void;
}

async function call(method: string, body?: unknown, query = '') {
  const response = await fetch(`/api/leads/tags${query}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await response.json().catch(() => ({}));
  return response.ok ? null : json.error || 'Não foi possível salvar.';
}

/** Etiquetas da empresa: criar, renomear, trocar a cor e apagar. */
export default function TagsManager({ tags, onChanged, onClose }: TagsManagerProps) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<{ from: string; to: string } | null>(null);

  const run = async (action: () => Promise<string | null>) => {
    setBusy(true);
    setError('');
    const failure = await action();
    if (failure) setError(failure);
    await onChanged();
    setBusy(false);
    return !failure;
  };

  const create = async () => {
    if (!name.trim()) return;
    if (await run(() => call('POST', { name: name.trim(), color }))) setName('');
  };

  const rename = async () => {
    if (!editing || !editing.to.trim() || editing.to.trim() === editing.from) {
      setEditing(null);
      return;
    }
    if (await run(() => call('PATCH', { name: editing.from, newName: editing.to.trim() }))) setEditing(null);
  };

  const remove = async (tag: LeadTag) => {
    if (!confirm(`Apagar a etiqueta "${tag.name}"? Ela sai de ${tag.count || 0} lead(s).`)) return;
    await run(() => call('DELETE', undefined, `?name=${encodeURIComponent(tag.name)}`));
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="tags-title">
        <div className={styles.modalHead}>
          <div>
            <h2 id="tags-title">Etiquetas</h2>
            <p>Organize os leads por interesse, temperatura ou campanha. Renomear ou apagar vale para todos os leads.</p>
          </div>
          <button type="button" className={styles.iconBtn} onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </div>

        <div className={styles.modalBody}>
          <div className={styles.tagCreate}>
            <input className={styles.input} value={name} maxLength={40} placeholder="Nova etiqueta (ex.: Quente)" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} />
            <div className={styles.colorRow} role="radiogroup" aria-label="Cor">
              {COLORS.map((item) => (
                <button key={item} type="button" role="radio" aria-checked={color === item} aria-label={`Cor ${item}`} className={`${styles.colorDot} ${color === item ? styles.colorOn : ''}`} style={{ background: item }} onClick={() => setColor(item)} />
              ))}
            </div>
            <button type="button" className={styles.primaryBtn} onClick={create} disabled={busy || !name.trim()}><Plus size={15} /> Criar</button>
          </div>

          {error && <div className={styles.errorBox}>{error}</div>}

          <ul className={styles.tagTable}>
            {tags.length === 0 && <li className={styles.muted}>Nenhuma etiqueta cadastrada.</li>}
            {tags.map((tag) => (
              <li key={tag.name}>
                <button
                  type="button"
                  className={styles.colorDot}
                  style={{ background: tag.color }}
                  title="Trocar a cor"
                  aria-label={`Trocar a cor de ${tag.name}`}
                  disabled={busy}
                  onClick={() => run(() => call('PATCH', { name: tag.name, color: COLORS[(COLORS.indexOf(tag.color) + 1) % COLORS.length] }))}
                />
                {editing?.from === tag.name ? (
                  <input className={styles.input} value={editing.to} autoFocus maxLength={40} onChange={(e) => setEditing({ from: tag.name, to: e.target.value })} onBlur={rename} onKeyDown={(e) => { if (e.key === 'Enter') rename(); if (e.key === 'Escape') setEditing(null); }} />
                ) : (
                  <button type="button" className={styles.tagName} onClick={() => setEditing({ from: tag.name, to: tag.name })} title="Clique para renomear">{tag.name}</button>
                )}
                <span className={styles.muted}>{tag.count || 0} lead(s)</span>
                <button type="button" className={styles.iconBtn} onClick={() => remove(tag)} disabled={busy} aria-label={`Apagar ${tag.name}`}><Trash2 size={14} /></button>
              </li>
            ))}
          </ul>
          {busy && <p className={styles.muted}><Loader2 size={14} className={styles.spin} /> Salvando...</p>}
        </div>
      </div>
    </div>
  );
}
