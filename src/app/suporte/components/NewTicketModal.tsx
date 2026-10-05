'use client';

import React, { useState } from 'react';
import { Loader2, Send, X } from 'lucide-react';
import styles from '../suporte.module.css';
import { CATEGORY_LABEL, CUSTOMER_PRIORITY, type TicketCategory, type TicketPriority } from '@/lib/support';
import { formatBrazilPhone, parseBrazilPhoneInput } from '@/lib/brazilian-fields';
import { api } from '../format';
import FilePicker from './FilePicker';

interface Props {
  defaultPhone: string;
  onCreated: (id: string) => void;
  onClose: () => void;
}

export default function NewTicketModal({ defaultPhone, onCreated, onClose }: Props) {
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState<TicketCategory>('duvida');
  const [priority, setPriority] = useState<TicketPriority>('normal');
  const [message, setMessage] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [notifyWhatsapp, setNotifyWhatsapp] = useState(Boolean(defaultPhone));
  const [phone, setPhone] = useState(parseBrazilPhoneInput(defaultPhone || ''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!subject.trim()) return setError('Dê um título ao chamado.');
    if (message.trim().length < 10) return setError('Descreva o que aconteceu (pelo menos 10 caracteres).');
    setBusy(true);
    setError('');
    const form = new FormData();
    form.append('subject', subject);
    form.append('category', category);
    form.append('priority', priority);
    form.append('message', message);
    form.append('notifyWhatsapp', String(notifyWhatsapp));
    form.append('phone', notifyWhatsapp ? phone : '');
    files.forEach((file) => form.append('files', file));
    try {
      const json = await api<{ data: { id: string } }>('/api/support/tickets', { method: 'POST', body: form });
      onCreated(json.data.id);
    } catch (failure) {
      setError((failure as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <form className={styles.modal} onClick={(e) => e.stopPropagation()} onSubmit={submit} role="dialog" aria-modal="true" aria-label="Abrir chamado">
        <header className={styles.modalHead}>
          <h2>Abrir chamado</h2>
          <button type="button" className={styles.iconBtn} onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </header>

        <div className={styles.modalBody}>
          <label className={styles.field}>
            <span>Título</span>
            <input className={styles.input} value={subject} maxLength={140} autoFocus onChange={(e) => setSubject(e.target.value)} placeholder="Ex.: O QR Code do WhatsApp não aparece" />
          </label>

          <label className={styles.field}>
            <span>Assunto</span>
            <select className={styles.input} value={category} onChange={(e) => setCategory(e.target.value as TicketCategory)}>
              {(Object.keys(CATEGORY_LABEL) as TicketCategory[]).map((key) => <option key={key} value={key}>{CATEGORY_LABEL[key]}</option>)}
            </select>
          </label>

          <div className={styles.field}>
            <span>Quanto isso atrapalha?</span>
            <div className={styles.urgency} role="radiogroup">
              {CUSTOMER_PRIORITY.map((option) => (
                <button key={option.value} type="button" role="radio" aria-checked={priority === option.value} className={`${styles.urgencyOption} ${priority === option.value ? styles.urgencyOn : ''} ${styles[`u_${option.value}`]}`} onClick={() => setPriority(option.value)}>
                  <strong>{option.label}</strong>
                  <small>{option.hint}</small>
                </button>
              ))}
            </div>
          </div>

          <label className={styles.field}>
            <span>Descreva o que aconteceu</span>
            <textarea className={styles.input} rows={6} maxLength={5000} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="O que você estava fazendo, o que esperava e o que apareceu na tela. Se puder, anexe um print." />
          </label>

          <FilePicker files={files} onChange={setFiles} onError={setError} disabled={busy} />

          <label className={styles.toggle}>
            <input type="checkbox" checked={notifyWhatsapp} onChange={(e) => setNotifyWhatsapp(e.target.checked)} />
            <span>
              <strong>Avisar pelo WhatsApp</strong>
              <small>Além do sino, você recebe cada resposta e mudança de situação no WhatsApp.</small>
            </span>
          </label>
          {notifyWhatsapp && (
            <label className={styles.field}>
              <span>WhatsApp</span>
              <input className={styles.input} inputMode="tel" value={formatBrazilPhone(phone)} onChange={(e) => setPhone(parseBrazilPhoneInput(e.target.value))} placeholder="+55 (11) 90000-0000" />
            </label>
          )}

          {error && <div className={styles.errorBox}>{error}</div>}
        </div>

        <footer className={styles.modalFoot}>
          <button type="button" className={styles.secondaryBtn} onClick={onClose}>Cancelar</button>
          <button type="submit" className={styles.primaryBtn} disabled={busy}>
            {busy ? <Loader2 size={15} className={styles.spin} /> : <Send size={15} />} Abrir chamado
          </button>
        </footer>
      </form>
    </div>
  );
}
