import React from 'react';
import { AlertCircle, Check, CheckCheck, Clock, FileDown, Loader2, RotateCcw } from 'lucide-react';
import styles from '../messages.module.css';
import type { ChatMessage } from '../types';
import { dayLabel, timeOf } from '../format';
import AudioPlayer from './AudioPlayer';

interface MessageListProps {
  messages: ChatMessage[] | null;
  leadName: string;
  now: number;
  retrying: string | null;
  onRetry: (message: ChatMessage) => void;
  endRef: React.RefObject<HTMLDivElement | null>;
}

function StatusIcon({ message }: { message: ChatMessage }) {
  if (message.status === 'sending') return <Clock size={12} aria-label="Enviando" />;
  if (message.status === 'failed') return <AlertCircle size={13} className={styles.failIcon} aria-label="Não enviada" />;
  if (message.status === 'read') return <CheckCheck size={14} className={styles.readIcon} aria-label="Lida" />;
  if (message.status === 'delivered' || message.status === 'received') return <CheckCheck size={14} aria-label="Entregue" />;
  return <Check size={14} aria-label="Enviada" />;
}

export default function MessageList({ messages, leadName, now, retrying, onRetry, endRef }: MessageListProps) {
  if (!messages) {
    return <div className={styles.messages}><p className={styles.muted}><Loader2 size={14} className={styles.spin} /> Carregando conversa...</p></div>;
  }

  return (
    <div className={styles.messages} role="log" aria-live="polite">
      {messages.length === 0 && (
        <div className={styles.firstMessage}>
          <strong>Nenhuma mensagem com {leadName.split(' ')[0]} ainda.</strong>
          <span>Escreva abaixo para iniciar a conversa pelo WhatsApp da empresa.</span>
        </div>
      )}
      {messages.map((message, index) => {
        const day = dayLabel(message.createdAt, now);
        const showDay = index === 0 || dayLabel(messages[index - 1].createdAt, now) !== day;
        return (
          <React.Fragment key={message.id}>
            {showDay && <div className={styles.day}><span>{day}</span></div>}
            <div className={`${styles.bubble} ${message.sent ? styles.out : styles.in} ${message.status === 'failed' ? styles.bubbleFailed : ''}`}>
              {message.type === 'image' && message.mediaUrl && (
                <a href={message.mediaUrl} target="_blank" rel="noreferrer" className={styles.imageLink}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={message.mediaUrl} alt="Imagem da conversa" loading="lazy" />
                </a>
              )}
              {message.type === 'audio' && message.mediaUrl && <AudioPlayer url={message.mediaUrl} />}
              {message.type === 'document' && message.mediaUrl && (
                <a href={message.mediaUrl} target="_blank" rel="noreferrer" className={styles.docLink}>
                  <FileDown size={18} /> <span>{message.text || 'Arquivo'}</span>
                </a>
              )}
              {message.text && message.type !== 'document' && <p className={styles.text}>{message.text}</p>}
              <span className={styles.meta}>
                {timeOf(message.createdAt)}
                {message.sent && <StatusIcon message={message} />}
              </span>
              {message.sent && message.status === 'failed' && message.type === 'text' && (
                <button type="button" className={styles.retry} onClick={() => onRetry(message)} disabled={retrying === message.id}>
                  {retrying === message.id ? <Loader2 size={12} className={styles.spin} /> : <RotateCcw size={12} />} Não enviada. Tentar de novo
                </button>
              )}
              {message.sent && message.status === 'failed' && message.type !== 'text' && <span className={styles.failNote}>Não enviado. Envie o arquivo de novo.</span>}
            </div>
          </React.Fragment>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}
