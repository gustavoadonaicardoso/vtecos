'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Plus, Trash2, X } from 'lucide-react';
import styles from '../disparos.module.css';
import { api, dateTime } from './Bits';

interface Optout { id: string; phone: string; reason: string; created_at: string }

const formatPhone = (phone: string) => phone.replace(/^55(\d{2})(\d{4,5})(\d{4})$/, '($1) $2-$3');

/** Quem pediu para não receber campanhas (respondeu SAIR ou foi adicionado pela equipe). */
export default function OptoutsModal({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<Optout[] | null>(null);
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');

  const load = () => api<Optout[]>('/api/disparos/optouts').then((result) => {
    setItems(result.data || []);
    if (result.error) setError(result.error);
  });
  useEffect(() => {
    const timer = window.setTimeout(load, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const add = async () => {
    setBusy(true);
    const result = await api('/api/disparos/optouts', { method: 'POST', body: JSON.stringify({ phone }) });
    setBusy(false);
    if (result.error) { setError(result.error); return; }
    setPhone('');
    setError('');
    load();
  };
  const remove = async (item: Optout) => {
    if (!confirm(`${formatPhone(item.phone)} volta a poder receber campanhas. Confirmar?`)) return;
    await api(`/api/disparos/optouts?id=${item.id}`, { method: 'DELETE' });
    load();
  };
  const shown = (items || []).filter((item) => !search.trim() || item.phone.includes(search.replace(/\D/g, '')) || item.reason.toLowerCase().includes(search.toLowerCase()));

  return createPortal(
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="optout-title">
        <div className={styles.modalHead}>
          <div>
            <h2 id="optout-title">Descadastrados</h2>
            <p>Estes números nunca recebem campanhas. Quem responde &quot;SAIR&quot; entra aqui sozinho.</p>
          </div>
          <button type="button" className={styles.iconBtn} onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </div>
        <div className={styles.modalBody}>
          {error && <div className={styles.errorBox}>{error}</div>}
          <div className={styles.row}>
            <input className={`${styles.input} ${styles.grow}`} placeholder="Adicionar número (com DDD)" value={phone} onChange={(e) => setPhone(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && phone.trim()) add(); }} />
            <button type="button" className={styles.secondaryBtn} disabled={!phone.trim() || busy} onClick={add}>{busy ? <Loader2 size={15} className={styles.spin} /> : <Plus size={15} />} Adicionar</button>
          </div>
          {(items?.length || 0) > 8 && <input className={styles.input} placeholder="Buscar" value={search} onChange={(e) => setSearch(e.target.value)} />}
          {items === null && <span className={styles.hint}><Loader2 size={14} className={styles.spin} /> Carregando...</span>}
          {items?.length === 0 && <span className={styles.hint}>Ninguém pediu para sair ainda.</span>}
          {shown.map((item) => (
            <div key={item.id} className={styles.optoutRow}>
              <div className={styles.grow}>
                <strong>{formatPhone(item.phone)}</strong>
                <small>{item.reason || 'Sem motivo'} · {dateTime(item.created_at)}</small>
              </div>
              <button type="button" className={styles.iconBtn} aria-label="Remover" onClick={() => remove(item)}><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}
