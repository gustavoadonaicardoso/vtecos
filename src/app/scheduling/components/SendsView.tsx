'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Ban, Braces, CalendarClock, CheckCheck, Clock, Eye, Loader2, Pencil, RotateCcw, Search, Send, X } from 'lucide-react';
import styles from '../scheduling.module.css';
import type { QuickReply } from '@/app/messages/types';
import { SEND_STATUS_LABEL, dayTitle, ymd, type ScheduledSend } from '../format';
import { MESSAGE_VARIABLES } from '@/lib/message-variables';

export interface SendLead {
  id: string;
  name: string;
  phone: string;
}

interface SendsViewProps {
  sends: ScheduledSend[];
  leads: SendLead[];
  loaded: boolean;
  todayKey: string;
  workerEnabled: boolean;
  whatsappReady: boolean | null;
  isAdmin: boolean;
  quickReplies: QuickReply[];
  agentName: string;
  initialLeadId: string | null;
  onCreate: (payload: Record<string, unknown>) => Promise<string | null>;
  onUpdate: (id: string, payload: Record<string, unknown>) => Promise<string | null>;
  onCancel: (send: ScheduledSend) => Promise<void>;
}

/** Próxima hora cheia (mínimo 30 min à frente). */
function nextSlot() {
  const date = new Date(Date.now() + 30 * 60_000);
  date.setMinutes(0, 0, 0);
  date.setHours(date.getHours() + 1);
  return { date: ymd(date), time: `${String(date.getHours()).padStart(2, '0')}:00` };
}

const STATUS_ICON: Record<ScheduledSend['status'], React.ReactNode> = {
  pending: <Clock size={13} />,
  sending: <Loader2 size={13} className={styles.spin} />,
  sent: <CheckCheck size={13} />,
  failed: <AlertTriangle size={13} />,
  canceled: <Ban size={13} />,
};

export default function SendsView(props: SendsViewProps) {
  const { sends, leads, loaded, todayKey, workerEnabled, whatsappReady, isAdmin, quickReplies, initialLeadId, onCreate, onUpdate, onCancel } = props;
  const [slot] = useState(nextSlot);
  const [editing, setEditing] = useState<ScheduledSend | null>(null);
  const [leadId, setLeadId] = useState(initialLeadId && leads.some((lead) => lead.id === initialLeadId) ? initialLeadId : '');
  const [search, setSearch] = useState('');
  const [date, setDate] = useState(slot.date);
  const [time, setTime] = useState(slot.time);
  const [message, setMessage] = useState('');
  const [templateName, setTemplateName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [view, setView] = useState<'upcoming' | 'history'>('upcoming');
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ key: string; text: string; unknown: string[] } | null>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);

  const lead = leads.find((item) => item.id === leadId);
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const digits = term.replace(/\D/g, '');
    const list = term ? leads.filter((item) => item.name.toLowerCase().includes(term) || (digits && item.phone.replace(/\D/g, '').includes(digits))) : leads;
    return list.slice(0, 200);
  }, [leads, search]);

  const upcoming = sends.filter((send) => send.status === 'pending' || send.status === 'sending').sort((a, b) => String(a.sendAt).localeCompare(String(b.sendAt)));
  const history = sends.filter((send) => !['pending', 'sending'].includes(send.status));
  const list = view === 'upcoming' ? upcoming : history;

  const reset = () => {
    const next = nextSlot();
    setEditing(null);
    setMessage('');
    setTemplateName(null);
    setDate(next.date);
    setTime(next.time);
    setError('');
  };

  const startEdit = (send: ScheduledSend) => {
    const reschedule = send.status !== 'pending';
    const next = nextSlot();
    setEditing(send);
    setLeadId(send.leadId || '');
    setMessage(send.message);
    setTemplateName(send.templateName);
    setDate(reschedule ? next.date : send.date);
    setTime(reschedule ? next.time : send.time);
    setError('');
    if (typeof window !== 'undefined' && window.innerWidth < 900) window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // As variáveis ficam no texto e viram os dados do lead na hora do envio.
  const applyReply = (id: string) => {
    const reply = quickReplies.find((item) => item.id === id);
    if (!reply) return;
    setMessage(reply.content);
    setTemplateName(reply.name);
  };

  /** Coloca {{variavel}} onde está o cursor. */
  const insertVariable = (name: string) => {
    const tag = `{{${name}}}`;
    const box = messageRef.current;
    const start = box?.selectionStart ?? message.length;
    const end = box?.selectionEnd ?? message.length;
    const next = `${message.slice(0, start)}${tag}${message.slice(end)}`.slice(0, 4096);
    setMessage(next);
    setTemplateName(null);
    requestAnimationFrame(() => {
      box?.focus();
      box?.setSelectionRange(start + tag.length, start + tag.length);
    });
  };

  // Prévia com os dados do lead escolhido (só quando há variáveis).
  const previewLeadId = editing?.leadId || leadId;
  const hasVariables = message.includes('{{');
  const previewKey = `${previewLeadId}::${message}`;
  useEffect(() => {
    if (!previewLeadId || !hasVariables) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const response = await fetch('/api/scheduling/sends/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: previewLeadId, message }),
      }).catch(() => null);
      const json = response ? await response.json().catch(() => ({})) : {};
      if (!cancelled && response?.ok && json.data) setPreview({ key: `${previewLeadId}::${message}`, text: json.data.text, unknown: json.data.unknown || [] });
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [previewLeadId, message, hasVariables]);
  const shownPreview = hasVariables && previewLeadId && preview?.key === previewKey ? preview : null;

  const submit = async () => {
    if (!editing && !leadId) return setError('Escolha o lead.');
    if (!message.trim()) return setError('Escreva a mensagem.');
    setBusy(true);
    setError('');
    const failure = editing
      ? await onUpdate(editing.id, { message, date, time })
      : await onCreate({ leadId, message, date, time, templateName });
    setBusy(false);
    if (failure) return setError(failure);
    reset();
    if (!editing) setLeadId('');
    setView('upcoming');
  };

  const cancel = async (send: ScheduledSend) => {
    if (!confirm(`Cancelar o envio para ${send.leadName}?`)) return;
    setCancelling(send.id);
    await onCancel(send);
    setCancelling(null);
    if (editing?.id === send.id) reset();
  };

  return (
    <div className={styles.sends}>
      <section className={`${styles.card} ${styles.sendForm}`} aria-label="Agendar mensagem">
        <header className={styles.cardHead}>
          <h2>{editing ? (editing.status === 'pending' ? 'Alterar envio' : 'Reagendar envio') : 'Agendar mensagem'}</h2>
          {editing && <button type="button" className={styles.iconBtn} onClick={reset} aria-label="Cancelar alteração"><X size={17} /></button>}
        </header>
        <p className={styles.hint}>Sai pelo WhatsApp da empresa no dia e horário escolhidos e aparece na conversa em Mensagens.</p>

        {whatsappReady === false && (
          <div className={styles.warnBox}>
            <AlertTriangle size={15} />
            <span>Nenhum WhatsApp conectado: no horário, o envio vai falhar. {isAdmin ? <Link href="/integrations">Conectar em Integrações</Link> : 'Peça ao administrador para conectar em Integrações.'}</span>
          </div>
        )}
        {!workerEnabled && (
          <div className={styles.warnBox}>
            <AlertTriangle size={15} />
            <span>
              O envio automático está desligado neste servidor: as mensagens ficam agendadas, mas não saem.
              {isAdmin ? <> Ligue com <code>CONTENT_SCHEDULER_ENABLED=true</code> no <code>.env.local</code> da VPS.</> : ' Avise o administrador.'}
            </span>
          </div>
        )}

        <div className={styles.field}>
          <span>Para</span>
          {editing ? (
            <input className={styles.input} value={editing.leadName} disabled />
          ) : (
            <>
              <label className={styles.searchBox}>
                <Search size={14} />
                <input type="search" placeholder="Buscar lead por nome ou telefone" value={search} onChange={(e) => setSearch(e.target.value)} />
              </label>
              <select className={styles.input} value={leadId} onChange={(e) => setLeadId(e.target.value)} aria-label="Lead">
                <option value="">{filtered.length ? 'Escolha o lead...' : 'Nenhum lead encontrado'}</option>
                {filtered.map((item) => <option key={item.id} value={item.id}>{item.name}{item.phone ? ` · ${item.phone}` : ''}</option>)}
              </select>
              {lead && !lead.phone && <small className={styles.badText}>Este lead não tem telefone.</small>}
            </>
          )}
        </div>

        <div className={styles.row}>
          <label className={styles.field}>
            <span>Dia</span>
            <input className={styles.input} type="date" min={todayKey} value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className={styles.field}>
            <span>Horário</span>
            <input className={styles.input} type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </label>
        </div>

        {quickReplies.length > 0 && (
          <label className={styles.field}>
            <span>Resposta rápida (opcional)</span>
            <select className={styles.input} value="" onChange={(e) => applyReply(e.target.value)}>
              <option value="">Usar uma resposta rápida...</option>
              {quickReplies.map((reply) => <option key={reply.id} value={reply.id}>{reply.name}</option>)}
            </select>
          </label>
        )}

        <label className={styles.field}>
          <span>Mensagem</span>
          <textarea ref={messageRef} className={styles.input} rows={5} maxLength={4096} value={message} onChange={(e) => { setMessage(e.target.value); setTemplateName(null); }} placeholder="{{saudacao}}, {{primeiro_nome}}! Passando para lembrar da nossa conversa de amanhã. Seu protocolo é {{protocolo}}." />
          <small className={styles.counter}>{message.length}/4096</small>
        </label>

        <div className={styles.varBox}>
          <span className={styles.varTitle}><Braces size={13} /> Variáveis: clique para inserir no texto</span>
          <div className={styles.varChips}>
            {MESSAGE_VARIABLES.map((variable) => (
              <button key={variable.name} type="button" className={styles.varChip} onClick={() => insertVariable(variable.name)} title={`{{${variable.name}}}`}>
                {variable.label}
              </button>
            ))}
          </div>
          <small>Viram os dados do lead na hora do envio. Se estiver vazio, use um texto reserva: <code>{'{{primeiro_nome|cliente}}'}</code>.</small>
        </div>

        {hasVariables && (
          <div className={styles.previewBox} aria-live="polite">
            <span className={styles.varTitle}><Eye size={13} /> {previewLeadId ? `Como vai chegar para ${editing?.leadName || lead?.name || 'o lead'}` : 'Prévia'}</span>
            {!previewLeadId ? (
              <p className={styles.note}>Escolha o lead para ver a prévia.</p>
            ) : shownPreview ? (
              <>
                <p className={styles.previewText}>{shownPreview.text || <em>(mensagem vazia)</em>}</p>
                {shownPreview.unknown.length > 0 && (
                  <small className={styles.badText}>Variável desconhecida: {shownPreview.unknown.map((name) => `{{${name}}}`).join(', ')}. Ela sai em branco.</small>
                )}
              </>
            ) : (
              <p className={styles.note}><Loader2 size={13} className={styles.spin} /> Montando a prévia...</p>
            )}
          </div>
        )}

        {error && <div className={styles.errorBox}>{error}</div>}

        <button type="button" className={styles.primaryBtn} onClick={submit} disabled={busy}>
          {busy ? <Loader2 size={16} className={styles.spin} /> : <Send size={16} />}
          {editing ? (editing.status === 'pending' ? 'Salvar alteração' : 'Reagendar') : 'Agendar envio'}
        </button>
      </section>

      <section className={styles.card} aria-label="Envios">
        <div className={styles.cardHead}>
          <div className={styles.filters} role="tablist">
            <button type="button" role="tab" aria-selected={view === 'upcoming'} className={view === 'upcoming' ? styles.filterOn : ''} onClick={() => setView('upcoming')}>
              Agendados {upcoming.length > 0 && <span className={styles.count}>{upcoming.length}</span>}
            </button>
            <button type="button" role="tab" aria-selected={view === 'history'} className={view === 'history' ? styles.filterOn : ''} onClick={() => setView('history')}>
              Histórico
            </button>
          </div>
        </div>

        {!loaded && <p className={styles.empty}><Loader2 size={14} className={styles.spin} /> Carregando...</p>}
        {loaded && list.length === 0 && (
          <p className={styles.empty}><CalendarClock size={16} /> {view === 'upcoming' ? 'Nenhuma mensagem agendada.' : 'Nada enviado ainda.'}</p>
        )}
        <ul className={styles.sendList}>
          {list.map((send) => (
            <li key={send.id} className={`${styles.sendItem} ${editing?.id === send.id ? styles.sendEditing : ''}`}>
              <div className={styles.sendTop}>
                <strong>{send.leadName}</strong>
                <span className={`${styles.badge} ${styles[`s_${send.status}`]}`}>{STATUS_ICON[send.status]} {SEND_STATUS_LABEL[send.status]}</span>
              </div>
              <span className={styles.sendWhen}>{send.date ? `${dayTitle(send.date, todayKey)} às ${send.time}` : 'Sem data'}</span>
              <p className={styles.sendText}>{send.message}</p>
              {send.error && <p className={styles.sendError}>{send.error}</p>}
              <div className={styles.sendActions}>
                {send.status === 'pending' && (
                  <>
                    <button type="button" className={styles.linkBtn} onClick={() => startEdit(send)}><Pencil size={13} /> Alterar</button>
                    <button type="button" className={styles.linkBtnDanger} onClick={() => cancel(send)} disabled={cancelling === send.id}>
                      {cancelling === send.id ? <Loader2 size={13} className={styles.spin} /> : <Ban size={13} />} Cancelar
                    </button>
                  </>
                )}
                {(send.status === 'failed' || send.status === 'canceled') && send.leadId && (
                  <button type="button" className={styles.linkBtn} onClick={() => startEdit(send)}><RotateCcw size={13} /> Reagendar</button>
                )}
                {send.leadId && send.status !== 'pending' && (
                  <Link className={styles.linkBtn} href={`/messages?chatId=${send.leadId}`}>Ver conversa</Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
