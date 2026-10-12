'use client';

import React, { useRef, useState } from 'react';
import { CornerDownRight, Loader2, Paperclip, Send, X } from 'lucide-react';
import { sizeLabel } from '@/lib/email/format';
import styles from '../email.module.css';
import { api, type Account, type ComposeDraft, type Template } from '../types';

const MAX_BYTES = 20 * 1024 * 1024;
const TITLE: Record<ComposeDraft['mode'], string> = { new: 'Novo e-mail', reply: 'Responder', replyAll: 'Responder a todos', forward: 'Encaminhar' };

interface ComposerProps {
  draft: ComposeDraft;
  accounts: Account[];
  templates: Template[];
  onClose: () => void;
  onSent: (accountId: string) => void;
}

export default function Composer({ draft, accounts, templates, onClose, onSent }: ComposerProps) {
  const [accountId, setAccountId] = useState(draft.accountId);
  const [to, setTo] = useState(draft.to);
  const [cc, setCc] = useState(draft.cc);
  const [bcc, setBcc] = useState('');
  const [showCopies, setShowCopies] = useState(Boolean(draft.cc));
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const [files, setFiles] = useState<File[]>([]);
  const [keepAttachments, setKeepAttachments] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  // Resposta/encaminhamento sai sempre pela caixa do e-mail original.
  const locked = draft.mode !== 'new';
  const account = accounts.find((item) => item.id === accountId);
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  const parentFiles = draft.mode === 'forward' ? draft.parent?.attachments.filter((item) => item.available) || [] : [];

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const next = [...files, ...Array.from(list)];
    if (next.reduce((sum, file) => sum + file.size, 0) > MAX_BYTES) {
      setError('Os anexos passam de 20 MB. Mande um link ou divida em mais e-mails.');
      return;
    }
    setError('');
    setFiles(next);
  };

  const applyTemplate = (id: string) => {
    const template = templates.find((item) => item.id === id);
    if (!template) return;
    if (template.subject && (!subject || draft.mode === 'new')) setSubject(template.subject);
    setBody((current) => (current.trim() ? `${current.replace(/\s+$/, '')}\n\n${template.body}` : template.body));
  };

  const send = async () => {
    if (!accountId) return setError('Escolha a caixa que vai enviar.');
    if (!to.trim()) return setError('Informe para quem vai o e-mail.');
    setSending(true);
    setError('');
    const form = new FormData();
    form.set('accountId', accountId);
    form.set('to', to);
    form.set('cc', cc);
    form.set('bcc', bcc);
    form.set('subject', subject);
    form.set('body', body);
    if (draft.parent) {
      form.set('mode', draft.mode === 'forward' ? 'forward' : 'reply');
      form.set('parentId', draft.parent.id);
      form.set('keepAttachments', String(keepAttachments));
    }
    for (const file of files) form.append('files', file, file.name);
    try {
      await api('/api/email/send', { method: 'POST', body: form });
      onSent(accountId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível enviar.');
      setSending(false);
    }
  };

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label={TITLE[draft.mode]}>
      <div className={styles.modal}>
        <div className={styles.modalHead}>
          <h2>{TITLE[draft.mode]}</h2>
          <button type="button" className={styles.iconBtn} onClick={onClose} aria-label="Fechar" disabled={sending}><X size={18} /></button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.recipient}>
            <span>De</span>
            <select className={styles.input} value={accountId} onChange={(e) => setAccountId(e.target.value)} disabled={locked} aria-label="Caixa que envia">
              {accounts.map((item) => (
                <option key={item.id} value={item.id}>{item.fromName ? `${item.fromName} <${item.emailAddress}>` : item.emailAddress}{item.kind === 'personal' ? ' (pessoal)' : ''}</option>
              ))}
            </select>
          </div>
          <div className={styles.recipient}>
            <span>Para</span>
            <input className={styles.input} value={to} onChange={(e) => setTo(e.target.value)} placeholder="nome@empresa.com, outro@email.com" aria-label="Para" autoFocus={draft.mode === 'new' || draft.mode === 'forward'} />
            {!showCopies && <button type="button" className={styles.linkBtn} onClick={() => setShowCopies(true)}>Cc/Cco</button>}
          </div>
          {showCopies && (
            <>
              <div className={styles.recipient}><span>Cc</span><input className={styles.input} value={cc} onChange={(e) => setCc(e.target.value)} aria-label="Com cópia" /></div>
              <div className={styles.recipient}><span>Cco</span><input className={styles.input} value={bcc} onChange={(e) => setBcc(e.target.value)} aria-label="Com cópia oculta" placeholder="Ninguém vê quem está aqui" /></div>
            </>
          )}
          <div className={styles.row3}>
            <label className={styles.field}>
              <span>Assunto</span>
              <input className={styles.input} value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={300} />
            </label>
            <label className={styles.field}>
              <span>Modelo</span>
              <select className={styles.input} value="" onChange={(e) => applyTemplate(e.target.value)} disabled={!templates.length}>
                <option value="">{templates.length ? 'Usar um modelo...' : 'Nenhum modelo'}</option>
                {templates.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
          </div>
          <textarea
            className={`${styles.input} ${styles.composeBody}`}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Escreva sua mensagem..."
            aria-label="Mensagem"
            autoFocus={draft.mode === 'reply' || draft.mode === 'replyAll'}
          />
          {account?.signature && <p className={styles.hint}>A assinatura da caixa vai no final: “{account.signature.split('\n')[0]}{account.signature.includes('\n') ? '…' : ''}”</p>}
          {draft.parent && (
            <p className={styles.quoteNote}>
              <CornerDownRight size={14} /> {draft.mode === 'forward' ? 'O e-mail original vai junto, abaixo da sua mensagem.' : 'A mensagem respondida vai citada abaixo.'}
            </p>
          )}
          {parentFiles.length > 0 && (
            <label className={styles.quoteNote}>
              <input type="checkbox" checked={keepAttachments} onChange={(e) => setKeepAttachments(e.target.checked)} />
              Encaminhar também os anexos ({parentFiles.map((item) => item.name).join(', ')})
            </label>
          )}
          <div className={styles.files}>
            <button type="button" className={styles.attachBtn} onClick={() => fileInput.current?.click()}><Paperclip size={14} /> Anexar</button>
            <input ref={fileInput} type="file" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
            {files.map((file, index) => (
              <span key={`${file.name}-${index}`} className={styles.fileChip}>
                <span>{file.name}</span> <small>{sizeLabel(file.size)}</small>
                <button type="button" onClick={() => setFiles(files.filter((_, i) => i !== index))} aria-label={`Tirar ${file.name}`}><X size={12} /></button>
              </span>
            ))}
          </div>
          {error && <div className={styles.errorBox}>{error}</div>}
        </div>
        <div className={styles.modalFoot}>
          <span className={styles.footInfo}>{files.length ? `${files.length} anexo(s) · ${sizeLabel(totalBytes)} de 20 MB` : 'Separe vários e-mails com vírgula.'}</span>
          <button type="button" className={styles.secondaryBtn} onClick={onClose} disabled={sending}>Cancelar</button>
          <button type="button" className={styles.primaryBtn} onClick={send} disabled={sending}>
            {sending ? <Loader2 size={16} className={styles.spin} /> : <Send size={16} />} Enviar
          </button>
        </div>
      </div>
    </div>
  );
}
