import React from 'react';
import { Paperclip, Pencil, Send, Smile, X } from 'lucide-react';
import EmojiPicker, { Theme } from 'emoji-picker-react';
import styles from '../chat.module.css';

interface MessageInputProps {
  editingMsgId: string | null;
  onCancelEdit: () => void;
  showEmojiPicker: boolean;
  onToggleEmojiPicker: () => void;
  onEmojiClick: (emojiData: any) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isUploading: boolean;
  inputText: string;
  onInputTextChange: (value: string) => void;
  onSendMessage: (e?: React.FormEvent) => void;
}

export default function MessageInput({ editingMsgId, onCancelEdit, showEmojiPicker, onToggleEmojiPicker, onEmojiClick, fileInputRef, onFileUpload, isUploading, inputText, onInputTextChange, onSendMessage }: MessageInputProps) {
  return (
    <div className={styles.inputArea}>
      {editingMsgId && (
        <div style={{ padding: '8px 16px', background: 'rgba(59, 130, 246, 0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', borderRadius: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#3b82f6' }}>
            <Pencil size={14} />
            <span style={{ fontSize: '0.85rem' }}>Editando mensagem...</span>
          </div>
          <button onClick={onCancelEdit} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--foreground)', opacity: 0.6 }}>
            <X size={16} />
          </button>
        </div>
      )}
      {showEmojiPicker && (
        <div className={styles.emojiPickerContainer}>
          <EmojiPicker
            onEmojiClick={onEmojiClick}
            theme={Theme.AUTO}
            searchPlaceHolder="Buscar emoji..."
          />
        </div>
      )}
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        onChange={onFileUpload}
      />
      <form className={styles.inputContainer} onSubmit={onSendMessage}>
        <button
          type="button"
          className={styles.actionBtn}
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
        >
          <Paperclip size={20} />
        </button>
        <button
          type="button"
          className={styles.actionBtn}
          onClick={onToggleEmojiPicker}
        >
          <Smile size={20} />
        </button>
        <textarea
          rows={1}
          placeholder={isUploading ? "Enviando arquivo..." : "Escreva sua mensagem..."}
          value={inputText}
          disabled={isUploading}
          onChange={(e) => onInputTextChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              onSendMessage();
            }
          }}
        />
        <button
          type="submit"
          className={styles.sendBtn}
          disabled={(!inputText.trim() && !isUploading) || isUploading}
        >
          <Send size={18} />
        </button>
      </form>
    </div>
  );
}
