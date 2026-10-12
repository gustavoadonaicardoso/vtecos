'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ArchiveRestore, ArrowLeft, Forward, ImageOff, Loader2, MailOpen, Paperclip, Reply, ReplyAll, Star, Trash2 } from 'lucide-react';
import { displayName, formatAddressList, sizeLabel } from '@/lib/email/format';
import styles from '../email.module.css';
import { fullDate, type MessageFull, type Thread } from '../types';

const REMOTE_IMAGES = /(src|background)\s*=\s*["']?\s*https?:|url\(\s*["']?https?:/i;

/** HTML do e-mail num iframe isolado: sem scripts; imagens de fora só quando a pessoa pede. */
function HtmlBody({ html, allowImages }: { html: string; allowImages: boolean }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(120);
  const imgSrc = allowImages ? 'data: cid: https: http:' : 'data: cid:';
  const doc = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${imgSrc}; style-src 'unsafe-inline'; font-src data:"><base target="_blank"><style>html,body{margin:0;padding:0}body{padding:12px;font:14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#1f2937;background:#fff;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{max-width:100%}pre{white-space:pre-wrap}blockquote{margin:0 0 0 .8ex;border-left:2px solid #ccc;padding-left:1ex;color:#555}</style></head><body>${html}</body></html>`;

  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    let observer: ResizeObserver | null = null;
    const measure = () => {
      const body = element.contentDocument?.body;
      if (body) setHeight(Math.min(Math.max(body.scrollHeight + 4, 60), 20000));
    };
    const onLoad = () => {
      measure();
      const body = element.contentDocument?.body;
      if (body && typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(measure);
        observer.observe(body);
      }
      // Imagens que terminam de carregar depois mudam a altura.
      element.contentDocument?.querySelectorAll('img').forEach((img) => img.addEventListener('load', measure));
    };
    element.addEventListener('load', onLoad);
    return () => {
      element.removeEventListener('load', onLoad);
      observer?.disconnect();
    };
  }, [doc]);

  return <iframe ref={frame} className={styles.htmlFrame} style={{ height }} srcDoc={doc} sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox" title="Conteúdo do e-mail" />;
}

function MailCard({ message, open, onToggle }: { message: MessageFull; open: boolean; onToggle: () => void }) {
  const [allowImages, setAllowImages] = useState(false);
  const hasRemote = Boolean(message.bodyHtml && REMOTE_IMAGES.test(message.bodyHtml));
  const from = message.fromName || message.fromAddress;
  const recipients = [message.to.length ? `para ${formatAddressList(message.to)}` : '', message.cc.length ? `cc ${formatAddressList(message.cc)}` : '', message.bcc.length ? `cco ${formatAddressList(message.bcc)}` : '']
    .filter(Boolean)
    .join(' · ');

  return (
    <article className={`${styles.mail} ${message.direction === 'out' ? styles.mailOut : ''}`}>
      <button type="button" className={styles.mailHead} onClick={onToggle} aria-expanded={open}>
        <span className={styles.avatar} aria-hidden>{displayName({ name: message.fromName, address: message.fromAddress }).slice(0, 1)}</span>
        <span className={styles.mailWho}>
          <strong>{from}{message.sentByName ? ` (${message.sentByName})` : ''}</strong>
          <small>{open ? `${message.fromAddress}${recipients ? ` · ${recipients}` : ''}` : message.snippet}</small>
        </span>
        <span className={styles.mailWhen}>{fullDate(message.sentAt)}</span>
      </button>
      {open && (
        <div className={styles.mailBody}>
          {hasRemote && !allowImages && (
            <div className={styles.imagesBar}>
              <ImageOff size={14} /> Imagens de fora bloqueadas (protege sua privacidade).
              <button type="button" className={styles.linkBtn} onClick={() => setAllowImages(true)}>Mostrar imagens</button>
            </div>
          )}
          {message.bodyHtml ? <HtmlBody html={message.bodyHtml} allowImages={allowImages} /> : <pre className={styles.textBody}>{message.bodyText || '(sem texto)'}</pre>}
          {message.attachments.length > 0 && (
            <div className={styles.attachments}>
              {message.attachments.map((item) =>
                item.available ? (
                  <a key={item.index} className={styles.attachment} href={`/api/email/attachments?message=${message.id}&index=${item.index}`} download={item.name}>
                    <Paperclip size={13} /> <span>{item.name}</span> <small>{sizeLabel(item.size)}</small>
                  </a>
                ) : (
                  <span key={item.index} className={`${styles.attachment} ${styles.attachmentOff}`} title="Grande demais: abra no seu provedor de e-mail">
                    <Paperclip size={13} /> <span>{item.name}</span> <small>indisponível</small>
                  </span>
                )
              )}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

interface ReaderProps {
  thread: Thread | null;
  loading: boolean;
  error: string;
  onBack: () => void;
  onReply: (message: MessageFull, mode: 'reply' | 'replyAll' | 'forward') => void;
  onAction: (action: 'star' | 'unstar' | 'unread' | 'trash' | 'restore' | 'delete') => void;
}

export default function Reader(props: ReaderProps) {
  const { thread, loading, error, onBack } = props;
  if (loading) return <div className={styles.placeholder}><Loader2 size={22} className={styles.spin} /><p>Abrindo...</p></div>;
  if (error) return <div className={styles.placeholder}><p className={styles.errorBox}>{error}</p><button type="button" className={styles.secondaryBtn} onClick={onBack}><ArrowLeft size={15} /> Voltar</button></div>;
  if (!thread) return <div className={styles.placeholder}><MailOpen size={30} /><p>Escolha um e-mail para ler.</p></div>;
  // Conversa nova (ou com mensagem nova): começa de novo com as abertas certas.
  return <ThreadView key={`${thread.openedId}:${thread.messages.length}`} {...props} thread={thread} />;
}

function ThreadView({ thread, onBack, onReply, onAction }: ReaderProps & { thread: Thread }) {
  // Abre a última e a que foi clicada; as outras ficam resumidas.
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set([thread.openedId, thread.messages[thread.messages.length - 1]?.id].filter(Boolean) as string[]));

  const last = thread.messages[thread.messages.length - 1];
  const opened = thread.messages.find((item) => item.id === thread.openedId) || last;
  const inTrash = opened.folder === 'trash';
  const starred = thread.messages.some((item) => item.isStarred);
  const replyTarget = [...thread.messages].reverse().find((item) => item.direction === 'in') || last;

  return (
    <div>
      <div className={styles.readerHead}>
        <button type="button" className={`${styles.iconBtn} ${styles.backBtn}`} onClick={onBack} aria-label="Voltar para a lista"><ArrowLeft size={18} /></button>
        <div className={styles.readerTitle}>
          <h2>{opened.subject || '(sem assunto)'}</h2>
          <p>{thread.account.name} · {thread.account.emailAddress}{thread.messages.length > 1 ? ` · ${thread.messages.length} mensagens` : ''}</p>
        </div>
        <div className={styles.readerActions}>
          <button type="button" className={styles.iconBtn} onClick={() => onAction(starred ? 'unstar' : 'star')} aria-label={starred ? 'Tirar dos favoritos' : 'Favoritar'} title={starred ? 'Tirar dos favoritos' : 'Favoritar'}>
            <Star size={17} className={starred ? styles.starOn : ''} fill={starred ? 'currentColor' : 'none'} />
          </button>
          <button type="button" className={styles.iconBtn} onClick={() => onAction('unread')} aria-label="Marcar como não lido" title="Marcar como não lido"><MailOpen size={17} /></button>
          {inTrash ? (
            <>
              <button type="button" className={styles.iconBtn} onClick={() => onAction('restore')} aria-label="Restaurar" title="Restaurar"><ArchiveRestore size={17} /></button>
              <button type="button" className={styles.iconBtn} onClick={() => onAction('delete')} aria-label="Excluir de vez" title="Excluir de vez"><Trash2 size={17} color="var(--bad)" /></button>
            </>
          ) : (
            <button type="button" className={styles.iconBtn} onClick={() => onAction('trash')} aria-label="Mover para a lixeira" title="Mover para a lixeira"><Trash2 size={17} /></button>
          )}
        </div>
      </div>

      <div className={styles.threadList}>
        {thread.messages.map((message) => (
          <MailCard
            key={message.id}
            message={message}
            open={openIds.has(message.id)}
            onToggle={() => setOpenIds((current) => {
              const next = new Set(current);
              if (next.has(message.id)) next.delete(message.id);
              else next.add(message.id);
              return next;
            })}
          />
        ))}
      </div>

      {!inTrash && (
        <div className={styles.replyBar}>
          <button type="button" className={styles.primaryBtn} onClick={() => onReply(replyTarget, 'reply')}><Reply size={16} /> Responder</button>
          <button type="button" className={styles.secondaryBtn} onClick={() => onReply(replyTarget, 'replyAll')}><ReplyAll size={16} /> Responder a todos</button>
          <button type="button" className={styles.secondaryBtn} onClick={() => onReply(last, 'forward')}><Forward size={16} /> Encaminhar</button>
        </div>
      )}
    </div>
  );
}
