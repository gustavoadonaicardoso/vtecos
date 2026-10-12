'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Loader2, Plus, Trash2, X } from 'lucide-react';
import styles from '../leads.module.css';
import { CUSTOM_FIELD_TYPES, MAX_CUSTOM_FIELDS, customFieldKey, type CustomFieldDef, type CustomFieldType } from '@/lib/lead-fields';

interface Props {
  fields: CustomFieldDef[];
  onSaved: () => Promise<unknown>;
  onClose: () => void;
}

type Row = { key: string | null; label: string; type: CustomFieldType };

/** Leads > Campos: campos personalizados da empresa (viram {{campo.chave}} nas mensagens). */
export default function CustomFieldsManager({ fields, onSaved, onClose }: Props) {
  const [rows, setRows] = useState<Row[]>(fields.map((field) => ({ key: field.key, label: field.label, type: field.type })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const original = JSON.stringify(fields.map((field) => ({ key: field.key, label: field.label, type: field.type })));
  const dirty = JSON.stringify(rows) !== original;

  const update = (index: number, change: Partial<Row>) => setRows((list) => list.map((row, i) => (i === index ? { ...row, ...change } : row)));
  const move = (index: number, delta: number) => setRows((list) => {
    const next = [...list];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item);
    return next;
  });

  const save = async () => {
    setBusy(true);
    setError('');
    const response = await fetch('/api/leads/fields', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: rows.map((row) => ({ key: row.key || undefined, label: row.label, type: row.type })) }),
    });
    const json = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(json.error || 'Não foi possível salvar.');
      return;
    }
    await onSaved();
    onClose();
  };

  const close = () => {
    if (dirty && !confirm('Descartar as mudanças nos campos?')) return;
    onClose();
  };

  return (
    <div className={styles.overlay} onClick={close}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="fields-title">
        <div className={styles.modalHead}>
          <div>
            <h2 id="fields-title">Campos personalizados</h2>
            <p>Informações que só a sua empresa usa (matrícula, plano contratado, data da compra...). Aparecem no lead e viram variáveis nas mensagens e automações.</p>
          </div>
          <button type="button" className={styles.iconBtn} onClick={close} aria-label="Fechar"><X size={18} /></button>
        </div>

        <div className={styles.modalBody}>
          {rows.length === 0 && <p className={styles.muted}>Nenhum campo ainda. Clique em &quot;Novo campo&quot;.</p>}
          <ul className={styles.fieldRows}>
            {rows.map((row, index) => {
              const variable = row.key || customFieldKey(row.label);
              return (
                <li key={row.key || `novo-${index}`}>
                  <span className={styles.moveBtns}>
                    <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`Subir ${row.label}`}><ChevronUp size={14} /></button>
                    <button type="button" onClick={() => move(index, 1)} disabled={index === rows.length - 1} aria-label={`Descer ${row.label}`}><ChevronDown size={14} /></button>
                  </span>
                  <input className={styles.input} value={row.label} maxLength={60} placeholder="Nome do campo (ex.: Matrícula)" onChange={(e) => update(index, { label: e.target.value })} aria-label="Nome do campo" autoFocus={!row.key && index === rows.length - 1} />
                  <select className={styles.input} value={row.type} onChange={(e) => update(index, { type: e.target.value as CustomFieldType })} aria-label="Tipo">
                    {CUSTOM_FIELD_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                  </select>
                  <button type="button" className={styles.iconBtn} onClick={() => setRows((list) => list.filter((_, i) => i !== index))} aria-label={`Remover ${row.label || 'campo'}`}><Trash2 size={14} /></button>
                  {variable && <code>{`{{campo.${variable}}}`}</code>}
                </li>
              );
            })}
          </ul>
          <button type="button" className={styles.secondaryBtn} onClick={() => setRows((list) => [...list, { key: null, label: '', type: 'text' }])} disabled={rows.length >= MAX_CUSTOM_FIELDS} style={{ alignSelf: 'flex-start' }}>
            <Plus size={15} /> Novo campo
          </button>
          <p className={styles.hintText}>Remover um campo tira ele da tela, mas o que já foi preenchido fica guardado: se criar de novo com o mesmo nome, os valores voltam. Mudar o nome de um campo existente não muda a variável.</p>
          {error && <div className={styles.errorBox}>{error}</div>}
        </div>
        <div className={styles.modalFoot}>
          <button type="button" className={styles.secondaryBtn} onClick={close} disabled={busy}>Cancelar</button>
          <button type="button" className={styles.primaryBtn} onClick={save} disabled={busy || !dirty}>
            {busy && <Loader2 size={15} className={styles.spin} />} Salvar campos
          </button>
        </div>
      </div>
    </div>
  );
}
