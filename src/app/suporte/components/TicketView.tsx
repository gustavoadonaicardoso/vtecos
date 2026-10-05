'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, CheckCircle2, FileText, Loader2, Lock, MessageCircle, Send, Star, UserCheck } from 'lucide-react';
import styles from '../suporte.module.css';
import {
  CATEGORY_LABEL,
  PRIORITY_LABEL,
  STAFF_STATUS_LABEL,
  STATUS_LABEL,
  ticketLabel,
  type SupportTicketDetail,
  type TicketCategory,
  type TicketPriority,
  type TicketStatus,
} from '@/lib/support';
import { formatBrazilPhone, parseBrazilPhoneInput } from '@/lib/brazilian-fields';
import { api, dateTime, fileSize } from '../format';
import FilePicker from './FilePicker';

interface Props {
  ticket: SupportTicketDetail;
  staff: boolean;
  me: string;
  team: { id: string; name: string }[];
  onBack: () => void;
  onChanged: () => Promise<void>;
  onNew: () => void;
}

const REPLY_STATUS: { value: '' | TicketStatus; label: string }[] = [
  { value: '', label: 'Manter a situação' },
  { value: 'in_progress', label: 'Em andamento' },
  { value: 'waiting_customer', label: 'Aguardando cliente' },
  { value: 'resolved', label: 'Resolvido' },
];

export default function TicketView({ ticket, staff, me, team, onBack, onChanged, onNew }: Props) {
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [internal, setInternal] = useState(false);
  const [replyStatus, setReplyStatus] = useState<'' | TicketStatus>('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [confirming, setConfirming] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const labels = staff ? STAFF_STATUS_LABEL : STATUS_LABEL;

  // Rola só a conversa até a última mensagem (no celular a página não pula).
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [ticket.id, ticket.messages.length]);

  const run = async (key: string, task: () => Promise<unknown>) => {
    setBusy(key);
    setError('');
    try {
      await task();
      await onChanged();
      return true;
    } catch (failure) {
      setError((failure as Error).message);
      return false;
    } finally {
      setBusy(null);
    }
  };

  const send = async () => {
    if (!text.trim() && files.length === 0) return setError('Escreva a mensagem.');
    const form = new FormData();
    form.append('message', text);
    if (staff) {
      form.append('internal', String(internal));
      if (!internal && replyStatus) form.append('status', replyStatus);
    }
    files.forEach((file) => form.append('files', file));
    const ok = await run('send', () => api(`/api/support/tickets/${ticket.id}/messages`, { method: 'POST', body: form }));
    if (ok) {
      setText('');
      setFiles([]);
      setReplyStatus('');
    }
  };

  const update = (changes: Record<string, unknown>) => run('update', () => api(`/api/support/tickets/${ticket.id}`, { method: 'PATCH', body: JSON.stringify(changes) }));

  const confirm = () => run('confirm', () => api(`/api/support/tickets/${ticket.id}/confirm`, { method: 'POST', body: JSON.stringify({ rating, comment }) }));

  const closed = ticket.status === 'closed';
  const canReply = staff || !closed;

  return (
    <section className={styles.detail} aria-label={`Chamado ${ticketLabel(ticket.code)}`}>
      <header className={styles.detailHead}>
        <button type="button" className={`${styles.iconBtn} ${styles.backBtn}`} onClick={onBack} aria-label="Voltar para a lista"><ArrowLeft size={18} /></button>
        <div className={styles.detailTitle}>
          <span className={styles.code}>{ticketLabel(ticket.code)}</span>
          <h2>{ticket.subject}</h2>
          <p>
            {staff && <strong>{ticket.tenantName}</strong>}
            {staff && ' · '}
            {ticket.openedByName}
            {staff && ticket.openedByEmail ? ` <${ticket.openedByEmail}>` : ''}
            {' · '}{CATEGORY_LABEL[ticket.category]}
            {' · '}aberto em {dateTime(ticket.createdAt)}
          </p>
          {staff && ticket.contactPhone && (
            <p className={styles.contact}><MessageCircle size={13} /> {formatBrazilPhone(parseBrazilPhoneInput(ticket.contactPhone))} {ticket.notifyWhatsapp ? '· recebe avisos no WhatsApp' : '· sem avisos no WhatsApp'}</p>
          )}
        </div>
        <span className={`${styles.status} ${styles[`st_${ticket.status}`]}`}>{labels[ticket.status]}</span>
      </header>

      {staff && (
        <div className={styles.controls}>
          <label>
            <span>Situação</span>
            <select value={ticket.status} disabled={busy !== null} onChange={(e) => update({ status: e.target.value })}>
              {(Object.keys(STAFF_STATUS_LABEL) as TicketStatus[]).map((key) => <option key={key} value={key}>{STAFF_STATUS_LABEL[key]}</option>)}
            </select>
          </label>
          <label>
            <span>Prioridade</span>
            <select value={ticket.priority} disabled={busy !== null} onChange={(e) => update({ priority: e.target.value })}>
              {(Object.keys(PRIORITY_LABEL) as TicketPriority[]).map((key) => <option key={key} value={key}>{PRIORITY_LABEL[key]}</option>)}
            </select>
          </label>
          <label>
            <span>Assunto</span>
            <select value={ticket.category} disabled={busy !== null} onChange={(e) => update({ category: e.target.value })}>
              {(Object.keys(CATEGORY_LABEL) as TicketCategory[]).map((key) => <option key={key} value={key}>{CATEGORY_LABEL[key]}</option>)}
            </select>
          </label>
          <label>
            <span>Responsável</span>
            <select value={ticket.assignedTo || ''} disabled={busy !== null} onChange={(e) => update({ assignedTo: e.target.value || null })}>
              <option value="">Ninguém</option>
              {team.map((member) => <option key={member.id} value={member.id}>{member.id === me ? `${member.name} (você)` : member.name}</option>)}
            </select>
          </label>
          {ticket.assignedTo !== me && (
            <button type="button" className={styles.secondaryBtn} onClick={() => update({ assignedTo: me })} disabled={busy !== null}>
              <UserCheck size={15} /> Assumir
            </button>
          )}
        </div>
      )}

      <div className={styles.thread} ref={threadRef}>
        {ticket.messages.map((message) => {
          if (message.side === 'system') {
            return <div key={message.id} className={styles.systemMsg}><span>{message.body}</span> <time>{dateTime(message.createdAt)}</time></div>;
          }
          const mine = staff ? message.side === 'staff' : message.side === 'customer';
          return (
            <article key={message.id} className={`${styles.msg} ${mine ? styles.msgMine : ''} ${message.internal ? styles.msgInternal : ''}`}>
              <header>
                <strong>{message.authorName}</strong>
                {message.side === 'staff' && <span className={styles.teamTag}>Vórtice</span>}
                {message.internal && <span className={styles.internalTag}><Lock size={11} /> Nota interna</span>}
                <time>{dateTime(message.createdAt)}</time>
              </header>
              {message.body && <p>{message.body}</p>}
              {message.attachments.length > 0 && (
                <div className={styles.attachments}>
                  {message.attachments.map((file) => (
                    <a key={file.path} href={file.url} target="_blank" rel="noreferrer" className={styles.attachment}>
                      {file.type.startsWith('image/') && file.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={file.url} alt={file.name} />
                      ) : (
                        <FileText size={16} />
                      )}
                      <span>{file.name}</span>
                      <small>{fileSize(file.size)}</small>
                    </a>
                  ))}
                </div>
              )}
            </article>
          );
        })}
      </div>

      {!staff && ticket.status === 'resolved' && (
        <div className={styles.resolveBox}>
          {confirming ? (
            <>
              <strong>Como foi o atendimento?</strong>
              <div className={styles.stars} role="radiogroup" aria-label="Nota">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button key={value} type="button" role="radio" aria-checked={rating === value} aria-label={`${value} estrela${value > 1 ? 's' : ''}`} onClick={() => setRating(value)}>
                    <Star size={26} fill={value <= rating ? 'currentColor' : 'none'} />
                  </button>
                ))}
              </div>
              <textarea className={styles.input} rows={2} maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Quer deixar um comentário? (opcional)" />
              <div className={styles.rowActions}>
                <button type="button" className={styles.secondaryBtn} onClick={() => setConfirming(false)}>Voltar</button>
                <button type="button" className={styles.primaryBtn} onClick={confirm} disabled={busy !== null}>
                  {busy === 'confirm' && <Loader2 size={15} className={styles.spin} />} Encerrar chamado
                </button>
              </div>
            </>
          ) : (
            <>
              <strong>A equipe marcou este chamado como resolvido.</strong>
              <span>Resolveu o seu problema?</span>
              <div className={styles.rowActions}>
                <button type="button" className={styles.secondaryBtn} onClick={() => textRef.current?.focus()}>Ainda não</button>
                <button type="button" className={styles.primaryBtn} onClick={() => setConfirming(true)}><CheckCircle2 size={15} /> Sim, resolveu</button>
              </div>
            </>
          )}
        </div>
      )}

      {closed && (
        <div className={styles.closedBox}>
          <span>
            Chamado encerrado{ticket.closedAt ? ` em ${dateTime(ticket.closedAt)}` : ''}.
            {ticket.rating ? ` Avaliação: ${'★'.repeat(ticket.rating)}${'☆'.repeat(5 - ticket.rating)}` : ''}
            {ticket.ratingComment ? ` — "${ticket.ratingComment}"` : ''}
          </span>
          {!staff && <button type="button" className={styles.linkBtn} onClick={onNew}>Abrir um novo chamado</button>}
        </div>
      )}

      {canReply && (
        <div className={`${styles.composer} ${internal ? styles.composerInternal : ''}`}>
          {staff && (
            <div className={styles.composerTabs} role="tablist">
              <button type="button" role="tab" aria-selected={!internal} className={!internal ? styles.composerTabOn : ''} onClick={() => setInternal(false)}>Responder ao cliente</button>
              <button type="button" role="tab" aria-selected={internal} className={internal ? styles.composerTabOn : ''} onClick={() => setInternal(true)}><Lock size={12} /> Nota interna</button>
            </div>
          )}
          <textarea
            ref={textRef}
            className={styles.input}
            rows={3}
            maxLength={5000}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={internal ? 'Só a equipe da Vórtice vê esta nota.' : staff ? 'Escreva a resposta para o cliente...' : 'Escreva sua mensagem...'}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void send(); }}
          />
          <div className={styles.composerBar}>
            <FilePicker files={files} onChange={setFiles} onError={setError} disabled={busy !== null} />
            <span className={styles.grow} />
            {staff && !internal && (
              <select className={styles.replyStatus} value={replyStatus} onChange={(e) => setReplyStatus(e.target.value as '' | TicketStatus)} aria-label="Situação depois de responder">
                {REPLY_STATUS.map((option) => <option key={option.value} value={option.value}>{option.value ? `e marcar: ${option.label}` : option.label}</option>)}
              </select>
            )}
            <button type="button" className={styles.primaryBtn} onClick={send} disabled={busy !== null}>
              {busy === 'send' ? <Loader2 size={15} className={styles.spin} /> : <Send size={15} />} {internal ? 'Salvar nota' : 'Enviar'}
            </button>
          </div>
          {!staff && ticket.status === 'waiting_customer' && <small className={styles.hint}>A equipe está aguardando a sua resposta.</small>}
          {staff && !internal && <small className={styles.hint}>O cliente é avisado no sino{ticket.notifyWhatsapp ? ' e no WhatsApp' : ''}.</small>}
        </div>
      )}

      {error && <div className={styles.errorBox}>{error}</div>}
    </section>
  );
}
