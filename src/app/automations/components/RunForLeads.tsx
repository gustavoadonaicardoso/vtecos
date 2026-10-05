'use client';

import React, { useEffect, useState } from 'react';
import { Loader2, Search, Send, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import styles from '../automations.module.css';

interface LeadOption {
  id: string;
  name: string;
  phone: string | null;
  blocked: boolean;
}

interface RunForLeadsProps {
  flowId: string;
  active: boolean;
  onClose: () => void;
  onDone: (message: string) => void;
}

/** Escolher leads e rodar o fluxo para eles agora (qualquer gatilho). */
export default function RunForLeads({ flowId, active, onClose, onDone }: RunForLeadsProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LeadOption[] | null>(null);
  const [chosen, setChosen] = useState<Map<string, LeadOption>>(new Map());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const response = await fetch(`/api/automations/leads?q=${encodeURIComponent(query)}`, { cache: 'no-store' });
      const json = await response.json().catch(() => ({}));
      if (cancelled) return;
      if (response.ok) setResults(json.data || []);
      else setError(json.error || 'Não foi possível buscar os leads.');
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  const toggle = (lead: LeadOption) => {
    setChosen((current) => {
      const next = new Map(current);
      if (next.has(lead.id)) next.delete(lead.id);
      else next.set(lead.id, lead);
      return next;
    });
  };

  const start = async () => {
    setBusy(true);
    setError('');
    const response = await fetch(`/api/automations/${flowId}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadIds: [...chosen.keys()] }),
    });
    const json = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(json.error || 'Não foi possível rodar o fluxo.');
      return;
    }
    const { started, skipped } = json.data as { started: number; skipped: number };
    onDone(`Fluxo iniciado para ${started} lead(s)${skipped ? ` · ${skipped} pulado(s) (já rodando ou bloqueado)` : ''}.`);
  };

  // No body: o editor cria um contexto de empilhamento abaixo do topo do sistema.
  return createPortal(
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="run-title">
        <div className={styles.modalHead}>
          <div>
            <h2 id="run-title">Rodar para leads</h2>
            <p>O fluxo começa agora para os leads escolhidos, seja qual for o gatilho.</p>
          </div>
          <button type="button" className={styles.iconBtn} onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </div>
        <div className={styles.modalBody}>
          {!active && <div className={styles.banner}>Ative o fluxo antes de rodar para os leads.</div>}
          {error && <div className={styles.errorBox}>{error}</div>}
          <label className={styles.searchBox}>
            <Search size={14} />
            <input autoFocus placeholder="Buscar por nome, telefone ou e-mail" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <div className={styles.pickList}>
            {results === null && <span className={styles.muted}><Loader2 size={14} className={styles.spin} /> Buscando...</span>}
            {results?.length === 0 && <span className={styles.muted}>Nenhum lead encontrado.</span>}
            {results?.map((lead) => (
              <label key={lead.id} className={`${styles.check} ${styles.pickItem}`}>
                <input type="checkbox" checked={chosen.has(lead.id)} disabled={lead.blocked} onChange={() => toggle(lead)} />
                <span>
                  <strong>{lead.name || 'Sem nome'}</strong>
                  <small>{lead.phone || 'sem telefone'}{lead.blocked ? ' · bloqueado' : ''}</small>
                </span>
              </label>
            ))}
          </div>
          {chosen.size > 0 && (
            <div className={styles.chips}>
              {[...chosen.values()].map((lead) => (
                <button key={lead.id} type="button" onClick={() => toggle(lead)} title="Tirar da lista">{lead.name || lead.phone} ✕</button>
              ))}
            </div>
          )}
          <small className={styles.note}>Até 10 leads começam na hora; acima disso entram na fila (60 por minuto, para proteger o WhatsApp).</small>
          <button type="button" className={styles.primaryBtn} disabled={!active || chosen.size === 0 || busy} onClick={start}>
            {busy ? <Loader2 size={15} className={styles.spin} /> : <Send size={15} />} Rodar para {chosen.size} lead(s)
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
