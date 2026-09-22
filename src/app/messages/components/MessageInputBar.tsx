import React from 'react';
import { BookOpen, FileText, Mic, Paperclip, Pencil, Send, Smile, Trash2 } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import styles from '../messages.module.css';
import { EMOJIS, META_TEMPLATES } from '../constants';
import type { MetaTemplate, QuickTemplate } from '../types';

interface MessageInputBarProps {
  isRecording: boolean;
  recordingTime: number;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  onCancelRecording: () => void;
  onConfirmRecording: () => void;
  inputText: string;
  onInputTextChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  showEmoji: boolean;
  onToggleEmoji: () => void;
  onInsertEmoji: (emoji: string) => void;
  useSignature: boolean;
  onToggleSignature: () => void;
  canUseQuickMessages: boolean;
  showQuickMsgs: boolean;
  onToggleQuickMsgs: () => void;
  quickTemplates: QuickTemplate[];
  onUseQuickMsg: (content: string) => void;
  showTemplates: boolean;
  onToggleTemplates: () => void;
  onUseTemplate: (tpl: MetaTemplate) => void;
  onSendMessage: () => void;
  onStartRecording: () => void;
}

export default function MessageInputBar({
  isRecording, recordingTime, canvasRef, onCancelRecording, onConfirmRecording,
  inputText, onInputTextChange, onKeyDown,
  showEmoji, onToggleEmoji, onInsertEmoji,
  useSignature, onToggleSignature,
  canUseQuickMessages, showQuickMsgs, onToggleQuickMsgs, quickTemplates, onUseQuickMsg,
  showTemplates, onToggleTemplates, onUseTemplate,
  onSendMessage, onStartRecording,
}: MessageInputBarProps) {
  return (
    <div className={styles.premiumInputArea}>
      <div className={styles.inputContainer}>
        {isRecording ? (
          <div className={styles.recordingOverlay}>
            <div className={styles.recordingPulse}></div>
            <span className={styles.timeLabel}>{recordingTime}s</span>
            <canvas ref={canvasRef} width={120} height={30} />
            <button className={styles.cancelRecBtn} onClick={onCancelRecording}><Trash2 size={20} /></button>
            <button className={styles.confirmRecBtn} onClick={onConfirmRecording}><Send size={18} /></button>
          </div>
        ) : (
          <>
            <button className={styles.actionBtn} title="Anexar Arquivo"><Paperclip size={22} /></button>

            <div className={styles.textareaWrapper}>
              <textarea
                rows={1}
                placeholder="Digite sua mensagem..."
                value={inputText}
                onChange={(e) => onInputTextChange(e.target.value)}
                onKeyDown={onKeyDown}
                className={styles.pInput}
              />
            </div>

            <div className={styles.tools}>
              {/* Emoji Popover */}
              <div className={styles.popoverWrapper}>
                <button className={styles.actionBtn} onClick={onToggleEmoji} title="Emojis"><Smile size={22} /></button>
                <AnimatePresence>
                  {showEmoji && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className={styles.popover}>
                      <div className={styles.emojiGrid}>
                        {EMOJIS.slice(0, 32).map(e => <button key={e} onClick={() => onInsertEmoji(e)}>{e}</button>)}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <button className={`${styles.actionBtn} ${useSignature ? styles.activeTool : ''}`} onClick={onToggleSignature} title="Ativar/Desativar Assinatura"><Pencil size={22} /></button>

              {/* Quick Messages Popover — templates do banco */}
              {canUseQuickMessages && (
                <div className={styles.popoverWrapper}>
                  <button className={styles.actionBtn} onClick={onToggleQuickMsgs} title="Mensagens Rápidas"><FileText size={22} /></button>
                  <AnimatePresence>
                    {showQuickMsgs && (
                      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className={styles.popoverList}>
                        <h4>Mensagens Rápidas</h4>
                        {quickTemplates.length === 0 && (
                          <span style={{ opacity: 0.5, fontSize: '0.82rem', padding: '8px' }}>Nenhum template disponível.</span>
                        )}
                        {quickTemplates.map(t => (
                          <button key={t.id} onClick={() => onUseQuickMsg(t.content)}>
                            <strong style={{ display: 'block', fontSize: '0.8rem', marginBottom: '2px' }}>{t.name}</strong>
                            {t.content.slice(0, 60)}{t.content.length > 60 ? '…' : ''}
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* Meta Templates Popover */}
              <div className={styles.popoverWrapper}>
                <button className={styles.actionBtn} onClick={onToggleTemplates} title="Templates Meta Business"><BookOpen size={22} /></button>
                <AnimatePresence>
                  {showTemplates && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className={styles.popoverList}>
                      <h4>Templates Meta (Oficial)</h4>
                      {META_TEMPLATES.map(t => <button key={t.id} onClick={() => onUseTemplate(t)}><strong>{t.name}</strong><span>{t.text.slice(0, 30)}...</span></button>)}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <button
                className={inputText.trim() ? styles.sendBtnMain : styles.micBtnMain}
                onClick={inputText.trim() ? onSendMessage : onStartRecording}
              >
                {inputText.trim() ? <Send size={20} /> : <Mic size={22} />}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
