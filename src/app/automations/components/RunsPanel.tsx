'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, ChevronDown, Clock, Loader2, RefreshCcw, X, XCircle } from 'lucide-react';
import styles from '../automations.module.css';

interface Run {
  id: string;
  lead_id: string | null;
  status: 'running' | 'waiting' | 'completed' | 'failed' | 'cancelled' | 'expired';
  waiting_for: 'delay' | 'reply' | null;
  resume_at: string | null;
  steps: { node_id: string; label: string; at: string; ok: boolean; detail: string }[];
  error: string | null;
  started_at: string;
  finished_at: string | null;
  lead: { id: string; name: string; phone: string } | null;
}

const STATUS: Record<Run['status'], { label: string; tone: string }> = {
  running: { label: 'Rodando', tone: 'info' },
  waiting: { label: 'Esperando', tone: 'info' },
  completed: { label: 'Concluída', tone: 'ok' },
  failed: { label: 'Falhou', tone: 'fail' },
  cancelled: { label: 'Cancelada', tone: 'muted' },
  expired: { label: 'Sem resposta', tone: 'muted' },
};

const when = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export default function RunsPanel({ flowId, canEdit, onClose }: { flowId: string; canEdit: boolean; onClose: () => void }) {
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState('');

  const fetchRuns = useCallback(async () => {
    const response = await fetch(`/api/automations/${flowId}/runs`, { cache: 'no-store' });
    const json = await response.json().catch(() => ({}));
    return response.ok ? { runs: json.data as Run[] } : { error: json.error || 'Não foi possível carregar as execuções.' };
  }, [flowId]);

  const apply = (result: { runs?: Run[]; error?: string }) => {
    if (result.runs) setRuns(result.runs);
    setError(result.error || '');
  };

  useEffect(() => {
    fetchRuns().then(apply);
  }, [fetchRuns]);

  const cancel = async (run: Run) => {
    if (!confirm('Cancelar esta execução? O fluxo para para este contato.')) return;
    const response = await fetch(`/api/automations/runs/${run.id}`, { method: 'DELETE' });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) setError(json.error || 'Não foi possível cancelar.');
    apply(await fetchRuns());
  };

  return (
    <aside className={styles.runsPanel} aria-label="Execuções">
      <div className={styles.inspectorHead}>
        <div>
          <small>Últimas 50</small>
          <strong>Execuções</strong>
        </div>
        <button type="button" className={styles.iconBtn} onClick={async () => apply(await fetchRuns())} aria-label="Atualizar"><RefreshCcw size={15} /></button>
        <button type="button" className={styles.iconBtn} onClick={onClose} aria-label="Fechar"><X size={16} /></button>
      </div>

      {error && <div className={styles.errorBox}><AlertTriangle size={15} /> {error}</div>}
      {!runs && !error && <div className={styles.muted}><Loader2 size={15} className={styles.spin} /> Carregando...</div>}
      {runs && runs.length === 0 && <p className={styles.muted}>Nenhuma execução ainda. Elas aparecem aqui quando o fluxo está ativo e o gatilho acontece.</p>}

      <div className={styles.runList}>
        {runs?.map((run) => {
          const status = STATUS[run.status];
          const expanded = open === run.id;
          return (
            <div key={run.id} className={styles.runItem}>
              <button type="button" className={styles.runHead} onClick={() => setOpen(expanded ? null : run.id)} aria-expanded={expanded}>
                <span className={`${styles.runStatus} ${styles[`run_${status.tone}`]}`}>
                  {status.tone === 'ok' ? <CheckCircle2 size={12} /> : status.tone === 'fail' ? <XCircle size={12} /> : <Clock size={12} />}
                  {status.label}
                </span>
                <span className={styles.runLead}>{run.lead?.name || 'Lead removido'}</span>
                <span className={styles.runWhen}>{when(run.started_at)}</span>
                <ChevronDown size={14} className={expanded ? styles.rotated : ''} />
              </button>
              {expanded && (
                <div className={styles.runBody}>
                  {run.status === 'waiting' && run.resume_at && (
                    <p className={styles.muted}>{run.waiting_for === 'reply' ? 'Esperando resposta até' : 'Continua em'} {when(run.resume_at)}</p>
                  )}
                  {run.error && <p className={styles.runError}>{run.error}</p>}
                  <ol>
                    {run.steps.map((step, index) => (
                      <li key={index} className={step.ok ? '' : styles.stepFail}>
                        <strong>{step.label}</strong> <span>{when(step.at)}</span>
                        <p>{step.detail}</p>
                      </li>
                    ))}
                  </ol>
                  <div className={styles.runActions}>
                    {run.lead && <Link href={`/messages?chatId=${run.lead.id}`} className={styles.linkBtn}>Abrir conversa</Link>}
                    {canEdit && ['waiting', 'running'].includes(run.status) && (
                      <button type="button" className={styles.dangerBtn} onClick={() => cancel(run)}>Cancelar execução</button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
