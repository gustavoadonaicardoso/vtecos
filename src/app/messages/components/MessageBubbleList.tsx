import React from 'react';
import { AlertCircle, Clock, Mail, MessageCircle, MessageSquare } from 'lucide-react';
import styles from '../messages.module.css';
import type { ChatMessage } from '../types';
import AudioPlayer from './AudioPlayer';

interface MessageBubbleListProps {
  activeMessages: ChatMessage[];
  selectedChatName: string;
  selectedChannel: string;
  onSelectChannel: (channel: string) => void;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
}

export default function MessageBubbleList({ activeMessages, selectedChatName, selectedChannel, onSelectChannel, messagesEndRef }: MessageBubbleListProps) {
  return (
    <div className={styles.messagesArea}>
      {activeMessages.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyItems: 'center', paddingTop: '100px', flex: 1, gap: '20px', color: 'var(--foreground)', opacity: 0.9 }}>
          <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '24px', borderRadius: '50%' }}>
            <MessageSquare size={48} color="#3b82f6" />
          </div>
          <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 600 }}>Iniciar Nova Conversa</h3>
          <p style={{ fontSize: '0.9rem', textAlign: 'center', maxWidth: '300px', opacity: 0.7, margin: 0 }}>
            Selecione o canal para enviar a primeira mensagem para {selectedChatName.split(' ')[0]}:
          </p>
          <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
            <button
              onClick={() => onSelectChannel('WhatsApp')}
              style={{ padding: '12px 24px', borderRadius: '12px', border: '2px solid', borderColor: selectedChannel === 'WhatsApp' ? '#25D366' : 'var(--border)', background: selectedChannel === 'WhatsApp' ? 'rgba(37, 211, 102, 0.1)' : 'transparent', color: selectedChannel === 'WhatsApp' ? '#25D366' : 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, transition: 'all 0.2s' }}
            >
              <MessageCircle size={20} /> WhatsApp
            </button>
            <button
              onClick={() => onSelectChannel('E-mail')}
              style={{ padding: '12px 24px', borderRadius: '12px', border: '2px solid', borderColor: selectedChannel === 'E-mail' ? '#3b82f6' : 'var(--border)', background: selectedChannel === 'E-mail' ? 'rgba(59, 130, 246, 0.1)' : 'transparent', color: selectedChannel === 'E-mail' ? '#3b82f6' : 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, transition: 'all 0.2s' }}
            >
              <Mail size={20} /> E-mail
            </button>
          </div>
        </div>
      ) : (
        activeMessages.map(msg => (
          <div key={msg.id} className={`${styles.message} ${msg.sent ? styles.sent : styles.received} ${msg.status === 'failed' ? styles.failedMsg : ''}`}>
            {msg.type === 'text' && <span>{msg.text}</span>}
            {msg.type === 'audio' && <AudioPlayer url={msg.audioUrl || ''} duration={5} />}
            <div className={styles.msgFooter}>
              <span className={styles.msgTime}>{msg.time}</span>
              {msg.sent && (
                <div className={styles.checks}>
                  {msg.status === 'sending' && (
                    <Clock size={13} style={{ opacity: 0.5, animation: 'spin 1.5s linear infinite' }} />
                  )}
                  {(msg.status === 'sent' || msg.status === 'received' || !msg.status) && (
                    <svg width="16" height="11" viewBox="0 0 16 11" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M15 1L5.375 10L1 5.90909" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M11 1L5.375 6.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                  {msg.status === 'failed' && (
                    <AlertCircle size={13} color="#ef4444" />
                  )}
                </div>
              )}
            </div>
          </div>
        ))
      )}
      <div ref={messagesEndRef} style={{ height: 1 }} />
    </div>
  );
}
