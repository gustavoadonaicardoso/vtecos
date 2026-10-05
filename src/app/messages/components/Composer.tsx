import React, { useEffect, useRef, useState } from 'react';
import { FileText, Loader2, Mic, Paperclip, PenLine, Send, Settings2, Smile, Square, Trash2 } from 'lucide-react';
import styles from '../messages.module.css';
import type { QuickReply } from '../types';
import { EMOJIS } from '../format';

interface ComposerProps {
  disabledReason: string | null;
  canUseQuickReplies: boolean;
  canManageQuickReplies: boolean;
  quickReplies: QuickReply[];
  fill: (text: string) => string;
  agentName: string;
  sending: boolean;
  onSend: (text: string) => Promise<boolean>;
  onSendFile: (file: File, caption?: string) => Promise<void>;
  onManageQuickReplies: () => void;
}

const SIGNATURE_KEY = 'vtec_chat_signature';

function readSignaturePref() {
  try {
    return localStorage.getItem(SIGNATURE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Formato de áudio que o navegador grava (ogg/opus quando possível). */
function recorderMime() {
  if (typeof MediaRecorder === 'undefined') return '';
  return ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/webm'].find((type) => MediaRecorder.isTypeSupported(type)) || '';
}

export default function Composer(props: ComposerProps) {
  const { disabledReason, canUseQuickReplies, canManageQuickReplies, quickReplies, fill, agentName, sending, onSend, onSendFile, onManageQuickReplies } = props;
  const [text, setText] = useState('');
  const [popover, setPopover] = useState<'emoji' | 'quick' | null>(null);
  const [signature, setSignature] = useState(readSignaturePref);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [uploading, setUploading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const toolsRef = useRef<HTMLDivElement>(null);
  const recorder = useRef<{ media: MediaRecorder; stream: MediaStream; chunks: Blob[]; cancel: boolean; timer: ReturnType<typeof setInterval> } | null>(null);

  // Popovers fecham ao clicar fora.
  useEffect(() => {
    if (!popover) return;
    const close = (event: MouseEvent) => {
      if (!toolsRef.current?.contains(event.target as Node)) setPopover(null);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [popover]);

  // Caixa de texto cresce até 6 linhas.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [text]);

  useEffect(() => () => {
    if (recorder.current) {
      clearInterval(recorder.current.timer);
      recorder.current.stream.getTracks().forEach((track) => track.stop());
    }
  }, []);

  const toggleSignature = () => {
    setSignature((value) => {
      try {
        localStorage.setItem(SIGNATURE_KEY, value ? '0' : '1');
      } catch {}
      return !value;
    });
  };

  const submit = async () => {
    const body = text.trim();
    if (!body || sending || disabledReason) return;
    const final = signature && agentName ? `*${agentName}:*\n${body}` : body;
    setText('');
    setPopover(null);
    const ok = await onSend(final);
    if (!ok) setText(body);
  };

  const sendFile = async (file: File) => {
    setUploading(true);
    await onSendFile(file, text.trim() && file.type.startsWith('image/') ? text.trim() : undefined);
    if (file.type.startsWith('image/')) setText('');
    setUploading(false);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = recorderMime();
      const media = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: Blob[] = [];
      const timer = setInterval(() => setSeconds((value) => value + 1), 1000);
      recorder.current = { media, stream, chunks, cancel: false, timer };
      media.ondataavailable = (event) => event.data.size > 0 && chunks.push(event.data);
      media.onstop = () => {
        const current = recorder.current;
        stream.getTracks().forEach((track) => track.stop());
        recorder.current = null;
        if (!current || current.cancel || chunks.length === 0) return;
        const type = (media.mimeType || 'audio/webm').split(';')[0];
        const ext = type.includes('ogg') ? 'ogg' : 'webm';
        void sendFile(new File([new Blob(chunks, { type: media.mimeType || type })], `audio-${Date.now()}.${ext}`, { type }));
      };
      media.start();
      setSeconds(0);
      setRecording(true);
    } catch (error) {
      const name = error instanceof DOMException ? error.name : '';
      alert(
        name === 'NotAllowedError' || name === 'SecurityError'
          ? 'O microfone está bloqueado. Clique no cadeado ao lado do endereço do site e permita o Microfone.'
          : name === 'NotFoundError'
            ? 'Nenhum microfone encontrado.'
            : 'Não foi possível usar o microfone.'
      );
    }
  };

  const stopRecording = (cancel: boolean) => {
    const current = recorder.current;
    if (!current) return;
    clearInterval(current.timer);
    current.cancel = cancel;
    current.media.stop();
    setRecording(false);
  };

  if (disabledReason) {
    return <div className={styles.composerBlocked}>{disabledReason}</div>;
  }

  if (recording) {
    return (
      <div className={styles.composer}>
        <div className={styles.recording}>
          <span className={styles.recDot} />
          Gravando {Math.floor(seconds / 60)}:{(seconds % 60).toString().padStart(2, '0')}
          <button type="button" className={styles.iconBtn} onClick={() => stopRecording(true)} aria-label="Descartar áudio"><Trash2 size={18} /></button>
          <button type="button" className={styles.sendBtn} onClick={() => stopRecording(false)} aria-label="Enviar áudio"><Square size={14} fill="currentColor" /></button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.composer}>
      <div className={styles.composerTools} ref={toolsRef}>
        <input ref={fileRef} type="file" hidden onChange={(e) => { const file = e.target.files?.[0]; if (file) void sendFile(file); e.target.value = ''; }} />
        <button type="button" className={styles.iconBtn} onClick={() => fileRef.current?.click()} disabled={uploading} title="Anexar arquivo ou imagem" aria-label="Anexar arquivo">
          {uploading ? <Loader2 size={18} className={styles.spin} /> : <Paperclip size={18} />}
        </button>

        <div className={styles.popWrap}>
          <button type="button" className={`${styles.iconBtn} ${popover === 'emoji' ? styles.iconOn : ''}`} onClick={() => setPopover(popover === 'emoji' ? null : 'emoji')} aria-label="Emojis"><Smile size={18} /></button>
          {popover === 'emoji' && (
            <div className={styles.popover}>
              <div className={styles.emojiGrid}>
                {EMOJIS.map((emoji) => <button key={emoji} type="button" onClick={() => { setText((value) => value + emoji); textareaRef.current?.focus(); }}>{emoji}</button>)}
              </div>
            </div>
          )}
        </div>

        {canUseQuickReplies && (
          <div className={styles.popWrap}>
            <button type="button" className={`${styles.iconBtn} ${popover === 'quick' ? styles.iconOn : ''}`} onClick={() => setPopover(popover === 'quick' ? null : 'quick')} title="Respostas rápidas" aria-label="Respostas rápidas"><FileText size={18} /></button>
            {popover === 'quick' && (
              <div className={`${styles.popover} ${styles.quickPop}`}>
                <div className={styles.popHead}>
                  <strong>Respostas rápidas</strong>
                  {canManageQuickReplies && <button type="button" className={styles.linkBtn} onClick={() => { setPopover(null); onManageQuickReplies(); }}><Settings2 size={13} /> Gerenciar</button>}
                </div>
                {quickReplies.length === 0 && <p className={styles.muted}>{canManageQuickReplies ? 'Nenhuma ainda. Clique em Gerenciar para criar.' : 'Nenhuma resposta rápida liberada para você.'}</p>}
                {quickReplies.map((reply) => (
                  <button key={reply.id} type="button" className={styles.quickItem} onClick={() => { setText(fill(reply.content)); setPopover(null); textareaRef.current?.focus(); }}>
                    <strong>{reply.name}</strong>
                    <span>{fill(reply.content)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <button type="button" className={`${styles.iconBtn} ${signature ? styles.iconOn : ''}`} onClick={toggleSignature} title={signature ? 'Assinatura ligada: seu nome vai no topo da mensagem' : 'Ligar assinatura (seu nome no topo da mensagem)'} aria-pressed={signature} aria-label="Assinatura">
          <PenLine size={18} />
        </button>
      </div>

      <textarea
        ref={textareaRef}
        rows={1}
        className={styles.textarea}
        placeholder="Escreva uma mensagem"
        title="Enter envia, Shift+Enter quebra linha"
        value={text}
        maxLength={4096}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void submit();
          }
        }}
      />

      {text.trim() ? (
        <button type="button" className={styles.sendBtn} onClick={() => void submit()} disabled={sending} aria-label="Enviar mensagem">
          {sending ? <Loader2 size={18} className={styles.spin} /> : <Send size={18} />}
        </button>
      ) : (
        <button type="button" className={styles.sendBtn} onClick={startRecording} disabled={uploading} aria-label="Gravar áudio" title="Gravar áudio">
          <Mic size={18} />
        </button>
      )}
      {signature && <span className={styles.signatureHint}>Assinando como {agentName}</span>}
    </div>
  );
}

