import React from 'react';
import { Paperclip, Pencil, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';
import styles from '../chat.module.css';
import { FILE_MESSAGE_PATTERN } from '../utils';
import type { InternalMessage, Profile } from '../types';

interface MessageListProps {
  groupedMessages: { [date: string]: InternalMessage[] };
  currentUserId: string | undefined;
  selectedProfile: Profile | undefined;
  onEditMessage: (messageId: string, text: string) => void;
  onRequestDeleteMessage: (messageId: string) => void;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
}

const renderMessageText = (text: string) => {
  const fileMatch = text.match(FILE_MESSAGE_PATTERN);
  if (fileMatch) {
    return (
      <a href={fileMatch[1]} target="_blank" rel="noopener noreferrer" className={styles.fileAttachment}>
        <Paperclip size={16} />
        <span style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {fileMatch[2]}
        </span>
      </a>
    );
  }
  return text;
};

export default function MessageList({ groupedMessages, currentUserId, selectedProfile, onEditMessage, onRequestDeleteMessage, messagesEndRef }: MessageListProps) {
  return (
    <div className={styles.messagesArea}>
      {Object.keys(groupedMessages).length > 0 ? (
        Object.entries(groupedMessages).map(([date, msgs]) => (
          <React.Fragment key={date}>
            <div className={styles.dateDivider}>
              <span>{date === new Date().toLocaleDateString('pt-BR') ? 'Hoje' : date}</span>
            </div>
            {msgs.map((msg) => {
              const isSent = msg.sender_id === currentUserId;
              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`${styles.msgWrapper} ${isSent ? styles.msgWrapperSent : styles.msgWrapperReceived}`}
                >
                  <div className={`${styles.message} ${isSent ? styles.sent : styles.received}`}>
                    {msg.profiles?.name && !isSent && selectedProfile?.isGroup && (
                      <div style={{ fontSize: '0.75rem', fontWeight: 'bold', marginBottom: '4px', opacity: 0.8 }}>
                        {msg.profiles.name}
                      </div>
                    )}
                    {renderMessageText(msg.text)}
                    <span className={styles.msgTime}>
                      {msg.is_edited && <span style={{ fontStyle: 'italic', marginRight: '6px', opacity: 0.8 }}>Editada</span>}
                      {new Date(msg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {isSent && (
                      <button
                        className={styles.msgDeleteBtn}
                        onClick={() => onEditMessage(msg.id, msg.text)}
                        title="Editar mensagem"
                      >
                        <Pencil size={13} />
                      </button>
                    )}
                    <button
                      className={styles.msgDeleteBtn}
                      onClick={() => onRequestDeleteMessage(msg.id)}
                      title="Apagar mensagem"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </React.Fragment>
        ))
      ) : (
        <div className={styles.emptyState}>
          <p>Inicie uma conversa com {selectedProfile?.name.split(' ')[0]}.</p>
        </div>
      )}
      <div ref={messagesEndRef} />
    </div>
  );
}
