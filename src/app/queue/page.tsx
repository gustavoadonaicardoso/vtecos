'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Ban,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Loader2,
  MessageCircle,
  Monitor,
  Power,
  RotateCcw,
  Settings2,
  Ticket,
  Undo2,
  UserPlus,
  UserX,
  Users,
  X,
} from 'lucide-react';
import styles from './queue.module.css';
import { supabase } from '@/lib/supabase';
import {
  DEFAULT_QUEUE_SETTINGS,
  STATUS_LABEL,
  deskName,
  deskOptions,
  minutesBetween,
  ticketCode,
  type QueueSettings,
  type QueueTicket,
} from '@/lib/queue';
import DisplayMediaSettings from './DisplayMediaSettings';
import QueueSettingsModal from './components/QueueSettingsModal';

type Notice = { type: 'ok' | 'error' | 'info'; text: string } | null;
type QueueState = { tickets: QueueTicket[]; settings: QueueSettings; links: { display: string; totem: string } | null; canManage: boolean };

const DESK_KEY = 'vtec_queue_desk';

function readDesk() {
  try {
    return localStorage.getItem(DESK_KEY) || '01';
  } catch {
    return '01';
  }
}

async function post<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error || 'Algo deu errado. Tente de novo.');
  return json.data as T;
}

const time = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '');
const waitLabel = (minutes: number) => (minutes < 1 ? 'agora' : minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}`);

export default function QueuePage() {
  const [state, setState] = useState<QueueState | null>(null);
  const [loadError, setLoadError] = useState('');
  const [desk, setDeskState] = useState('01');
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [whatsapp, setWhatsapp] = useState<{ ok: boolean; text: string } | null>(null);
  const [form, setForm] = useState({ name: '', whatsapp: '', document: '', priority: false });
  const [showSettings, setShowSettings] = useState(false);
  const [showMedia, setShowMedia] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const settings = state?.settings ?? DEFAULT_QUEUE_SETTINGS;
  const tickets = useMemo(() => state?.tickets ?? [], [state]);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/queue/state', { cache: 'no-store' });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || 'Não foi possível carregar a fila.');
      setState(json.data);
      setLoadError('');
    } catch (error) {
      setLoadError((error as Error).message);
    }
  }, []);

  // Fila ao vivo: Realtime do banco + conferência a cada 15s (se o Realtime cair).
  useEffect(() => {
    void load();
    const channel = supabase
      ?.channel('queue_staff')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_queue_tickets' }, () => void load())
      .subscribe();
    const poll = setInterval(() => void load(), 15_000);
    const clock = setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      if (channel) supabase?.removeChannel(channel);
      clearInterval(poll);
      clearInterval(clock);
    };
  }, [load]);

  // Guichê escolhido neste computador (lido depois de montar, para não divergir do servidor).
  useEffect(() => {
    const timer = setTimeout(() => setDeskState(readDesk()), 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  const setDesk = (value: string) => {
    setDeskState(value);
    setWhatsapp(null);
    try {
      localStorage.setItem(DESK_KEY, value);
    } catch {}
  };

  // Guichê salvo que não existe mais (diminuíram a quantidade).
  const desks = deskOptions(settings.totalDesks);
  const activeDesk = desks.includes(desk) ? desk : desks[0];

  const waiting = tickets.filter((t) => t.status === 'waiting').sort((a, b) => Number(b.priority) - Number(a.priority) || a.number - b.number);
  const mine = tickets.find((t) => t.status === 'calling' && t.desk === activeDesk) || null;
  const otherDesks = tickets.filter((t) => t.status === 'calling' && t.desk !== activeDesk).sort((a, b) => String(a.desk).localeCompare(String(b.desk)));
  const finished = tickets.filter((t) => ['completed', 'no_show', 'canceled'].includes(t.status)).sort((a, b) => String(b.finishedAt || b.calledAt).localeCompare(String(a.finishedAt || a.calledAt)));
  const called = tickets.filter((t) => t.calledAt);
  const avgWait = called.length ? Math.round(called.reduce((sum, t) => sum + minutesBetween(t.createdAt, t.calledAt!), 0) / called.length) : null;
  const attended = tickets.filter((t) => t.status === 'completed').length;
  const noShow = tickets.filter((t) => t.status === 'no_show').length;
  const priorityWaiting = waiting.filter((t) => t.priority).length;
  const nextNumber = tickets.reduce((max, t) => Math.max(max, t.number), 0) + 1;

  const run = async (key: string, task: () => Promise<void>) => {
    setBusy(key);
    try {
      await task();
    } catch (error) {
      setNotice({ type: 'error', text: (error as Error).message });
    } finally {
      setBusy(null);
      void load();
    }
  };

  const showWhatsapp = (result?: { sent: boolean; reason?: string }) => {
    if (!result) return setWhatsapp(null);
    if (result.sent) setWhatsapp({ ok: true, text: 'Aviso enviado no WhatsApp.' });
    else if (result.reason === 'Sem WhatsApp cadastrado.') setWhatsapp(null);
    else setWhatsapp({ ok: false, text: `WhatsApp não enviado: ${result.reason || 'falha no envio'}` });
  };

  const callNext = () => run('next', async () => {
    const result = await post<{ ticket: QueueTicket | null; whatsapp?: { sent: boolean; reason?: string } }>('/api/queue/call-next', { desk: activeDesk });
    if (!result.ticket) {
      setNotice({ type: 'info', text: mine ? 'Atendimento finalizado. Não há mais ninguém aguardando.' : 'Não há ninguém aguardando.' });
      setWhatsapp(null);
    } else showWhatsapp(result.whatsapp);
  });

  const act = (ticket: QueueTicket, action: 'call' | 'recall' | 'finish' | 'no_show' | 'cancel' | 'requeue') => {
    if (action === 'cancel' && !confirm(`Cancelar a senha ${ticketCode(ticket.number, ticket.priority)}?`)) return;
    return run(`${action}-${ticket.id}`, async () => {
      const result = await post<{ ticket: QueueTicket; whatsapp?: { sent: boolean; reason?: string } }>(`/api/queue/tickets/${ticket.id}`, { action, desk: activeDesk });
      if (action === 'call' || action === 'recall') showWhatsapp(result.whatsapp);
      else setWhatsapp(null);
    });
  };

  const issue = () => run('issue', async () => {
    const response = await fetch('/api/queue/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: form.name.trim() || 'Cliente (Manual)', whatsapp: form.whatsapp, document: form.document, priority: form.priority, origin: 'recepcao' }),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(json.error || 'Não foi possível gerar a senha.');
    setForm({ name: '', whatsapp: '', document: '', priority: false });
    setNotice({ type: 'ok', text: `Senha ${ticketCode(json.number, json.priority)} gerada. ${json.ahead ? `${json.ahead} na frente.` : 'É a próxima.'}` });
  });

  const closeDay = () => {
    if (!confirm(`Encerrar a fila de hoje? ${waiting.length ? `${waiting.length} senha(s) aguardando serão canceladas. ` : ''}O histórico continua salvo e amanhã a numeração recomeça do 1.`)) return;
    void run('close', async () => {
      const result = await post<{ canceled: number; finished: number }>('/api/queue/close-day');
      setNotice({ type: 'ok', text: `Fila encerrada: ${result.canceled} cancelada(s), ${result.finished} finalizada(s).` });
    });
  };

  const openLink = (kind: 'display' | 'totem') => {
    if (state?.links) window.open(state.links[kind], '_blank', 'noopener');
  };

  const copyLink = async (kind: 'display' | 'totem') => {
    if (!state?.links) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${state.links[kind]}`);
      setNotice({ type: 'ok', text: `Link ${kind === 'totem' ? 'do totem' : 'da TV'} copiado.` });
    } catch {
      setNotice({ type: 'error', text: 'Não foi possível copiar. Abra o link e copie da barra de endereço.' });
    }
  };

  if (!state && loadError) {
    return (
      <div className={styles.container}>
        <div className={styles.errorBox}><AlertCircle size={16} /> {loadError} <button type="button" className={styles.linkBtn} onClick={() => void load()}>Tentar de novo</button></div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.titleBlock}>
          <h1>Senhas</h1>
          <p>Fila de atendimento presencial: totem, recepção e TV.</p>
        </div>
        <div className={styles.headerActions}>
          <span className={styles.linkGroup}>
            <button type="button" className={styles.secondaryBtn} onClick={() => openLink('totem')} disabled={!state?.links}><ExternalLink size={15} /> Totem</button>
            <button type="button" className={styles.iconBtn} onClick={() => copyLink('totem')} disabled={!state?.links} title="Copiar link do totem" aria-label="Copiar link do totem"><Copy size={15} /></button>
          </span>
          <span className={styles.linkGroup}>
            <button type="button" className={styles.secondaryBtn} onClick={() => openLink('display')} disabled={!state?.links}><Monitor size={15} /> TV</button>
            <button type="button" className={styles.iconBtn} onClick={() => copyLink('display')} disabled={!state?.links} title="Copiar link da TV" aria-label="Copiar link da TV"><Copy size={15} /></button>
          </span>
          {state?.canManage && (
            <>
              <button type="button" className={styles.secondaryBtn} onClick={() => setShowSettings(true)}><Settings2 size={15} /> Configurações</button>
              <button type="button" className={styles.dangerBtn} onClick={closeDay} disabled={busy !== null}><Power size={15} /> Encerrar o dia</button>
            </>
          )}
        </div>
      </header>

      <div className={styles.stats}>
        <span className={styles.stat}><Users size={15} /> <strong>{waiting.length}</strong> aguardando{priorityWaiting ? ` (${priorityWaiting} pref.)` : ''}</span>
        <span className={styles.stat}><CheckCircle2 size={15} /> <strong>{attended}</strong> atendidas hoje</span>
        <span className={styles.stat}><Clock size={15} /> espera média <strong>{avgWait === null ? '—' : waitLabel(avgWait)}</strong></span>
        {noShow > 0 && <span className={styles.stat}><UserX size={15} /> <strong>{noShow}</strong> não compareceram</span>}
      </div>

      <div className={styles.grid}>
        <div className={styles.column}>
          <section className={`${styles.card} ${styles.deskCard}`} aria-label="Meu atendimento">
            <div className={styles.cardHead}>
              <h2>Meu atendimento</h2>
              <label className={styles.deskSelect}>
                <span>{settings.deskLabel}</span>
                <select value={activeDesk} onChange={(e) => setDesk(e.target.value)}>
                  {desks.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
            </div>

            {mine ? (
              <div className={styles.current}>
                <span className={styles.currentLabel}>Chamando agora</span>
                <strong className={styles.currentCode} style={{ color: settings.primaryColor }}>{ticketCode(mine.number, mine.priority)}</strong>
                <span className={styles.currentName}>{mine.name || 'Sem nome'}</span>
                <span className={styles.currentMeta}>
                  {mine.priority && <span className={styles.prefBadge}>Preferencial</span>}
                  Esperou {waitLabel(minutesBetween(mine.createdAt, mine.calledAt || now))}
                  {mine.callCount > 1 && ` · chamada ${mine.callCount}x`}
                </span>
                {whatsapp && <span className={whatsapp.ok ? styles.whatsOk : styles.whatsFail}><MessageCircle size={13} /> {whatsapp.text}</span>}
                <div className={styles.currentActions}>
                  <button type="button" className={styles.secondaryBtn} onClick={() => act(mine, 'recall')} disabled={busy !== null}>
                    {busy === `recall-${mine.id}` ? <Loader2 size={15} className={styles.spin} /> : <RotateCcw size={15} />} Chamar de novo
                  </button>
                  <button type="button" className={styles.secondaryBtn} onClick={() => act(mine, 'no_show')} disabled={busy !== null}>
                    <UserX size={15} /> Não veio
                  </button>
                  <button type="button" className={styles.secondaryBtn} onClick={() => act(mine, 'finish')} disabled={busy !== null}>
                    <CheckCircle2 size={15} /> Finalizar
                  </button>
                </div>
                <button type="button" className={styles.linkBtn} onClick={() => act(mine, 'requeue')} disabled={busy !== null}><Undo2 size={13} /> Chamou por engano? Devolver à fila</button>
              </div>
            ) : (
              <div className={styles.idle}>
                <Ticket size={28} />
                <p>Nenhuma senha no {deskName(settings.deskLabel, activeDesk)}.</p>
              </div>
            )}

            <button type="button" className={`${styles.primaryBtn} ${styles.nextBtn}`} onClick={callNext} disabled={busy !== null || (!mine && waiting.length === 0)}>
              {busy === 'next' ? <Loader2 size={18} className={styles.spin} /> : <ArrowRight size={18} />}
              {mine ? 'Finalizar e chamar a próxima' : 'Chamar a próxima'}
              {waiting.length > 0 && <span className={styles.nextPeek}>{ticketCode(waiting[0].number, waiting[0].priority)}</span>}
            </button>
          </section>

          <section className={styles.card} aria-label="Gerar senha na recepção">
            <div className={styles.cardHead}><h2><UserPlus size={16} /> Senha na recepção</h2></div>
            <div className={styles.form}>
              <input className={styles.input} placeholder="Nome (opcional)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <div className={styles.row2}>
                <input className={styles.input} placeholder="WhatsApp" inputMode="tel" value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} />
                <input className={styles.input} placeholder="CPF ou RG" inputMode="numeric" value={form.document} onChange={(e) => setForm({ ...form, document: e.target.value })} />
              </div>
              <label className={styles.check}>
                <input type="checkbox" checked={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.checked })} />
                <span>Preferencial</span>
              </label>
              <button type="button" className={styles.primaryBtn} onClick={issue} disabled={busy !== null}>
                {busy === 'issue' ? <Loader2 size={16} className={styles.spin} /> : <Ticket size={16} />} Gerar senha {ticketCode(nextNumber, form.priority)}
              </button>
              <small className={styles.hint}>Com WhatsApp, a pessoa recebe a senha e o aviso quando for chamada.</small>
            </div>
          </section>
        </div>

        <section className={styles.card} aria-label="Fila">
          <div className={styles.cardHead}>
            <h2><Users size={16} /> Fila</h2>
            <span className={styles.count}>{waiting.length}</span>
          </div>
          {!state && <p className={styles.empty}><Loader2 size={14} className={styles.spin} /> Carregando...</p>}
          {state && waiting.length === 0 && <p className={styles.empty}>Ninguém aguardando.</p>}
          <ol className={styles.list}>
            {waiting.map((ticket, index) => {
              const minutes = minutesBetween(ticket.createdAt, now);
              return (
                <li key={ticket.id} className={styles.ticketRow}>
                  <span className={`${styles.code} ${ticket.priority ? styles.codePref : ''}`}>{ticketCode(ticket.number, ticket.priority)}</span>
                  <span className={styles.rowBody}>
                    <strong>{ticket.name || 'Visitante'}</strong>
                    <small>
                      {index === 0 ? 'Próxima · ' : ''}{ticket.origin === 'recepcao' ? 'Recepção' : 'Totem'} · {time(ticket.createdAt)}
                    </small>
                  </span>
                  <span className={`${styles.wait} ${minutes >= 30 ? styles.waitLong : ''}`}>{waitLabel(minutes)}</span>
                  <span className={styles.rowActions}>
                    <button type="button" className={styles.smallBtn} onClick={() => act(ticket, 'call')} disabled={busy !== null} title={`Chamar para o ${deskName(settings.deskLabel, activeDesk)}`}>
                      {busy === `call-${ticket.id}` ? <Loader2 size={13} className={styles.spin} /> : 'Chamar'}
                    </button>
                    <button type="button" className={styles.iconBtn} onClick={() => act(ticket, 'cancel')} disabled={busy !== null} title="Cancelar senha" aria-label={`Cancelar senha ${ticketCode(ticket.number, ticket.priority)}`}>
                      <Ban size={14} />
                    </button>
                  </span>
                </li>
              );
            })}
          </ol>
        </section>

        <div className={styles.column}>
          <section className={styles.card} aria-label="Em atendimento">
            <div className={styles.cardHead}><h2><Monitor size={16} /> Outros {settings.deskLabel.toLowerCase()}s</h2></div>
            {otherDesks.length === 0 && <p className={styles.empty}>Nenhum outro atendimento agora.</p>}
            <ul className={styles.list}>
              {otherDesks.map((ticket) => (
                <li key={ticket.id} className={styles.ticketRow}>
                  <span className={`${styles.code} ${ticket.priority ? styles.codePref : ''}`}>{ticketCode(ticket.number, ticket.priority)}</span>
                  <span className={styles.rowBody}>
                    <strong>{ticket.name || 'Visitante'}</strong>
                    <small>{deskName(settings.deskLabel, ticket.desk)} · desde {time(ticket.calledAt)}</small>
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className={styles.card} aria-label="Histórico de hoje">
            <button type="button" className={styles.cardToggle} onClick={() => setHistoryOpen((value) => !value)} aria-expanded={historyOpen}>
              <h2><Clock size={16} /> Histórico de hoje</h2>
              <span className={styles.count}>{finished.length}</span>
            </button>
            {historyOpen && (
              <>
                {finished.length === 0 && <p className={styles.empty}>Nada finalizado ainda.</p>}
                <ul className={styles.list}>
                  {finished.slice(0, 50).map((ticket) => (
                    <li key={ticket.id} className={styles.ticketRow}>
                      <span className={`${styles.code} ${styles.codeMuted}`}>{ticketCode(ticket.number, ticket.priority)}</span>
                      <span className={styles.rowBody}>
                        <strong>{ticket.name || 'Visitante'}</strong>
                        <small>
                          {STATUS_LABEL[ticket.status]}
                          {ticket.desk && ticket.status !== 'canceled' ? ` · ${deskName(settings.deskLabel, ticket.desk)}` : ''}
                          {ticket.calledAt ? ` · esperou ${waitLabel(minutesBetween(ticket.createdAt, ticket.calledAt))}` : ''}
                        </small>
                      </span>
                      <span className={styles.wait}>{time(ticket.finishedAt || ticket.calledAt)}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </div>
      </div>

      {showSettings && (
        <QueueSettingsModal
          settings={settings}
          onSaved={(next) => {
            setState((current) => (current ? { ...current, settings: next } : current));
            setShowSettings(false);
            setNotice({ type: 'ok', text: 'Configurações salvas. O totem e a TV atualizam em instantes.' });
          }}
          onOpenMedia={() => { setShowSettings(false); setShowMedia(true); }}
          onClose={() => setShowSettings(false)}
        />
      )}
      {showMedia && <DisplayMediaSettings onClose={() => setShowMedia(false)} />}

      {notice && (
        <div className={`${styles.toast} ${notice.type === 'error' ? styles.toastError : ''}`} role="status">
          {notice.type === 'error' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
          <span>{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Fechar aviso"><X size={14} /></button>
        </div>
      )}
    </div>
  );
}
