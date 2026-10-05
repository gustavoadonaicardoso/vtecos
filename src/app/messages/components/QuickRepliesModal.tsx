import { useState } from 'react';
import { Edit2, Loader2, Plus, Trash2, X } from 'lucide-react';
import styles from '../messages.module.css';
import type { QuickReply } from '../types';

interface QuickRepliesModalProps {
  replies: QuickReply[];
  onChanged: () => Promise<void>;
  onClose: () => void;
}

async function call(url: string, method: string, body?: unknown) {
  const response = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const json = await response.json().catch(() => ({}));
  return response.ok ? null : json.error || 'Não foi possível salvar.';
}

/** Respostas rápidas da empresa (admin e gerente). Quem vê cada uma é definido em Equipe > Acessos. */
export default function QuickRepliesModal({ replies, onChanged, onClose }: QuickRepliesModalProps) {
  const [editing, setEditing] = useState<{ id: string | null; name: string; content: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (!editing || !editing.name.trim() || !editing.content.trim()) {
      setError('Dê um nome e escreva a mensagem.');
      return;
    }
    setBusy(true);
    setError('');
    const failure = editing.id
      ? await call(`/api/messages/templates/${editing.id}`, 'PATCH', { name: editing.name.trim(), content: editing.content.trim() })
      : await call('/api/messages/templates', 'POST', { name: editing.name.trim(), content: editing.content.trim() });
    setBusy(false);
    if (failure) {
      setError(failure);
      return;
    }
    setEditing(null);
    await onChanged();
  };

  const remove = async (reply: QuickReply) => {
    if (!confirm(`Apagar a resposta rápida "${reply.name}"?`)) return;
    setBusy(true);
    const failure = await call(`/api/messages/templates/${reply.id}`, 'DELETE');
    setBusy(false);
    if (failure) setError(failure);
    await onChanged();
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={`${styles.modal} ${styles.modalWide}`} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="quick-title">
        <div className={styles.modalHead}>
          <div>
            <h2 id="quick-title">Respostas rápidas</h2>
            <p>Textos prontos para o atendimento. Use <code>{'{{nome}}'}</code>, <code>{'{{primeiro_nome}}'}</code> e <code>{'{{atendente}}'}</code> para personalizar.</p>
          </div>
          <button type="button" className={styles.iconBtn} onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </div>
        <div className={styles.modalBody}>
          {editing ? (
            <div className={styles.quickForm}>
              <label className={styles.field}>
                <span>Nome (só a equipe vê)</span>
                <input className={styles.input} value={editing.name} maxLength={60} autoFocus onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Ex.: Boas-vindas" />
              </label>
              <label className={styles.field}>
                <span>Mensagem</span>
                <textarea className={styles.input} rows={5} maxLength={2000} value={editing.content} onChange={(e) => setEditing({ ...editing, content: e.target.value })} placeholder="Olá, {{primeiro_nome}}! Aqui é {{atendente}}..." />
              </label>
              <div className={styles.quickFormActions}>
                <button type="button" className={styles.secondaryBtn} onClick={() => { setEditing(null); setError(''); }}>Cancelar</button>
                <button type="button" className={styles.primaryBtn} onClick={save} disabled={busy}>{busy && <Loader2 size={15} className={styles.spin} />} Salvar</button>
              </div>
            </div>
          ) : (
            <>
              <button type="button" className={styles.secondaryBtn} onClick={() => setEditing({ id: null, name: '', content: '' })}><Plus size={15} /> Nova resposta</button>
              <ul className={styles.quickTable}>
                {replies.length === 0 && <li className={styles.muted}>Nenhuma resposta rápida ainda.</li>}
                {replies.map((reply) => (
                  <li key={reply.id}>
                    <div>
                      <strong>{reply.name}</strong>
                      <p>{reply.content}</p>
                    </div>
                    <button type="button" className={styles.iconBtn} onClick={() => setEditing({ id: reply.id, name: reply.name, content: reply.content })} aria-label={`Editar ${reply.name}`}><Edit2 size={15} /></button>
                    <button type="button" className={styles.iconBtn} onClick={() => remove(reply)} disabled={busy} aria-label={`Apagar ${reply.name}`}><Trash2 size={15} /></button>
                  </li>
                ))}
              </ul>
            </>
          )}
          {error && <div className={styles.errorBox}>{error}</div>}
        </div>
      </div>
    </div>
  );
}
