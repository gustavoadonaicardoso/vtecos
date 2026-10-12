'use client';

import React, { useState } from 'react';
import { Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import styles from '../email.module.css';
import { api, jsonInit, type Template } from '../types';

interface Props {
  templates: Template[];
  onClose: () => void;
  onChanged: () => void;
}

export default function TemplatesModal({ templates, onClose, onChanged }: Props) {
  const [editing, setEditing] = useState<Partial<Template> | null>(templates.length ? null : {});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    setError('');
    try {
      await api('/api/email/templates', jsonInit('POST', editing));
      setEditing(null);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar.');
    }
    setBusy(false);
  };

  const remove = async (template: Template) => {
    if (!window.confirm(`Apagar o modelo "${template.name}"?`)) return;
    setError('');
    try {
      await api(`/api/email/templates/${template.id}`, { method: 'DELETE' });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível apagar.');
    }
  };

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Modelos de e-mail">
      <div className={styles.modal}>
        <div className={styles.modalHead}>
          <h2>{editing ? (editing.id ? 'Editar modelo' : 'Novo modelo') : 'Modelos de e-mail'}</h2>
          <button type="button" className={styles.iconBtn} onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </div>
        {editing ? (
          <>
            <div className={styles.modalBody}>
              <label className={styles.field}>
                <span>Nome do modelo</span>
                <input className={styles.input} value={editing.name || ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Ex.: Envio de orçamento" maxLength={80} />
              </label>
              <label className={styles.field}>
                <span>Assunto (opcional)</span>
                <input className={styles.input} value={editing.subject || ''} onChange={(e) => setEditing({ ...editing, subject: e.target.value })} maxLength={300} />
              </label>
              <label className={styles.field}>
                <span>Texto</span>
                <textarea className={styles.input} rows={9} value={editing.body || ''} onChange={(e) => setEditing({ ...editing, body: e.target.value })} placeholder="Olá! Segue em anexo o orçamento que você pediu..." />
              </label>
              <p className={styles.hint}>No e-mail, escolha o modelo em “Modelo”: o texto entra no corpo (e o assunto, se o e-mail ainda não tiver um).</p>
              {error && <div className={styles.errorBox}>{error}</div>}
            </div>
            <div className={styles.modalFoot}>
              {templates.length > 0 && <button type="button" className={styles.secondaryBtn} onClick={() => setEditing(null)} disabled={busy}>Voltar</button>}
              <button type="button" className={styles.primaryBtn} onClick={save} disabled={busy}>{busy && <Loader2 size={16} className={styles.spin} />} Salvar modelo</button>
            </div>
          </>
        ) : (
          <>
            <div className={styles.modalBody}>
              {error && <div className={styles.errorBox}>{error}</div>}
              {templates.map((template) => (
                <div key={template.id} className={styles.templateRow}>
                  <div>
                    <strong>{template.name}</strong>
                    <small>{template.subject ? `${template.subject} · ` : ''}{template.body}</small>
                  </div>
                  {template.canEdit && (
                    <>
                      <button type="button" className={styles.iconBtn} onClick={() => setEditing(template)} aria-label={`Editar ${template.name}`}><Pencil size={15} /></button>
                      <button type="button" className={styles.iconBtn} onClick={() => remove(template)} aria-label={`Apagar ${template.name}`}><Trash2 size={15} /></button>
                    </>
                  )}
                </div>
              ))}
            </div>
            <div className={styles.modalFoot}>
              <button type="button" className={styles.primaryBtn} onClick={() => setEditing({})}><Plus size={16} /> Novo modelo</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
