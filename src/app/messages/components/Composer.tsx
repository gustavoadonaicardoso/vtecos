import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Loader2, Mic, Paperclip, PenLine, Search, Send, Settings2, Smile, Square, Trash2, Zap } from 'lucide-react';
import styles from '../messages.module.css';
import type { QuickReply } from '../types';
import { EMOJIS } from '../format';
import { matchQuickReplies, slashQueryAt } from '@/lib/quick-replies';
import { usesAccessPassword } from '@/lib/message-variables';

interface ComposerProps {
  disabledReason: string | null;
  canUseQuickReplies: boolean;
  canManageQuickReplies: boolean;
  quickReplies: QuickReply[];
  /** Troca as variáveis. `password` undefined = prévia (senha aparece como ••••••). */
  fill: (text: string, password?: string | null) => string;
  /** Lê a senha de acesso do lead (só quando a resposta usa {{senha_acesso}}). */
  loadAccessPassword?: () => Promise<string | null>;
  agentName: string;
  sending: boolean;
  onSend: (text: string) => Promise<boolean>;
  onSendFile: (file: File, caption?: string) => Promise<void>;
}

export const QUICK_REPLIES_PAGE = '/messages/respostas-rapidas';

/** Uma resposta rápida na lista: atalho, nome e começo da mensagem já preenchida. */
function QuickOption({ reply, preview, active, onPick, onHover }: { reply: QuickReply; preview: string; active?: boolean; onPick: () => void; onHover?: () => void }) {
  return (
    <button
      type="button"
      className={`${styles.quickItem} ${active ? styles.quickItemOn : ''}`}
      // mousedown: escolhe antes de a caixa de texto perder o foco.
      onMouseDown={(event) => { event.preventDefault(); onPick(); }}
      onMouseEnter={onHover}
      role="option"
      aria-selected={active}
    >
      <span className={styles.quickItemHead}>
        {reply.shortcut && <code className={styles.shortcutTag}>/{reply.shortcut}</code>}
        <strong>{reply.name}</strong>
      </span>
      <span className={styles.quickItemText}>{preview}</span>
    </button>
  );
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
  const { disabledReason, canUseQuickReplies, canManageQuickReplies, quickReplies, fill, loadAccessPassword, agentName, sending, onSend, onSendFile } = props;
  const [text, setText] = useState('');
  const [popover, setPopover] = useState<'emoji' | 'quick' | null>(null);
  const [quickSearch, setQuickSearch] = useState('');
  // "/termo" sendo digitado antes do cursor; dismissed = Esc fechou a lista daquela "/".
  const [slash, setSlash] = useState<{ start: number; term: string } | null>(null);
  const [slashIndex, setSlashIndex] = useState(0);
  const [dismissed, setDismissed] = useState<number | null>(null);
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

  const quickEnabled = canUseQuickReplies && quickReplies.length > 0;
  const slashMatches = useMemo(
    () => (slash && quickEnabled && dismissed !== slash.start ? matchQuickReplies(quickReplies, slash.term) : []),
    [slash, quickEnabled, dismissed, quickReplies],
  );
  const searchMatches = useMemo(() => matchQuickReplies(quickReplies, quickSearch, 200), [quickReplies, quickSearch]);
  const slashOpen = slashMatches.length > 0;

  /** Confere se o cursor está logo depois de uma "/termo". */
  const readSlash = (value: string, caret: number) => {
    const found = slashQueryAt(value, caret);
    if (!found || slash?.start !== found.start || slash.term !== found.term) setSlashIndex(0);
    setSlash(found);
    if (!found || (dismissed !== null && found.start !== dismissed)) setDismissed(null);
  };

  /** Coloca o texto da resposta no lugar de [from, to) e põe o cursor no fim dele. */
  const placeText = (from: number, to: number, insert: string) => {
    const next = text.slice(0, from) + insert + text.slice(to);
    setText(next.slice(0, 4096));
    setSlash(null);
    const caret = Math.min(from + insert.length, 4096);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(caret, caret);
    });
  };

  /** Texto final da resposta (com a senha de acesso, se a resposta usar). */
  const filled = async (reply: QuickReply) => {
    if (!usesAccessPassword(reply.content) || !loadAccessPassword) return fill(reply.content, null);
    const password = await loadAccessPassword().catch(() => null);
    return fill(reply.content, password);
  };

  /** Escolha pela "/": troca a "/termo" pela mensagem. */
  const pickSlash = async (reply: QuickReply) => {
    if (!slash) return;
    const caret = textareaRef.current?.selectionStart ?? text.length;
    const start = slash.start;
    const end = Math.max(caret, slash.start + 1 + slash.term.length);
    placeText(start, end, await filled(reply));
  };

  /** Escolha pelo botão: entra onde está o cursor (ou no fim). */
  const pickFromMenu = async (reply: QuickReply) => {
    const el = textareaRef.current;
    const from = el ? el.selectionStart : text.length;
    const to = el ? el.selectionEnd : text.length;
    const before = text.slice(0, from);
    const spacer = before && !/\s$/.test(before) ? ' ' : '';
    setPopover(null);
    setQuickSearch('');
    placeText(from, to, spacer + (await filled(reply)));
  };

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
    setSlash(null);
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
        const ext = type.includes('ogg') ? 'ogg' : type.includes('mp4') || type.includes('aac') ? 'm4a' : 'webm';
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
            <button
              type="button"
              className={`${styles.iconBtn} ${popover === 'quick' ? styles.iconOn : ''}`}
              onClick={() => { setQuickSearch(''); setPopover(popover === 'quick' ? null : 'quick'); }}
              title="Respostas rápidas (ou digite / no campo de mensagem)"
              aria-label="Respostas rápidas"
            >
              <Zap size={18} />
            </button>
            {popover === 'quick' && (
              <div className={`${styles.popover} ${styles.quickPop}`}>
                <div className={styles.popHead}>
                  <strong>Respostas rápidas</strong>
                  <Link href={QUICK_REPLIES_PAGE} className={styles.linkBtn}><Settings2 size={13} /> {canManageQuickReplies ? 'Configurar' : 'Ver todas'}</Link>
                </div>
                {quickReplies.length > 0 && (
                  <label className={styles.quickSearch}>
                    <Search size={14} />
                    <input
                      autoFocus
                      value={quickSearch}
                      onChange={(e) => setQuickSearch(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && searchMatches[0]) { e.preventDefault(); pickFromMenu(searchMatches[0]); }
                        if (e.key === 'Escape') setPopover(null);
                      }}
                      placeholder="Buscar por nome ou atalho"
                      aria-label="Buscar resposta rápida"
                    />
                  </label>
                )}
                {quickReplies.length === 0 && <p className={styles.muted}>{canManageQuickReplies ? 'Nenhuma ainda. Clique em Configurar para criar.' : 'Nenhuma resposta rápida liberada para você.'}</p>}
                {quickReplies.length > 0 && searchMatches.length === 0 && <p className={styles.muted}>Nada encontrado.</p>}
                <div role="listbox" aria-label="Respostas rápidas">
                  {searchMatches.map((reply) => (
                    <QuickOption key={reply.id} reply={reply} preview={fill(reply.content)} onPick={() => pickFromMenu(reply)} />
                  ))}
                </div>
                <p className={styles.quickTip}>Dica: digite <code>/</code> no campo de mensagem para buscar sem tirar a mão do teclado.</p>
              </div>
            )}
          </div>
        )}

        <button type="button" className={`${styles.iconBtn} ${signature ? styles.iconOn : ''}`} onClick={toggleSignature} title={signature ? 'Assinatura ligada: seu nome vai no topo da mensagem' : 'Ligar assinatura (seu nome no topo da mensagem)'} aria-pressed={signature} aria-label="Assinatura">
          <PenLine size={18} />
        </button>
      </div>

      {slashOpen && (
        <div className={styles.slashPop} role="listbox" aria-label="Respostas rápidas">
          <div className={styles.slashHead}>
            <span>Respostas rápidas{slash?.term ? <> para <code>/{slash.term}</code></> : ''}</span>
            <span className={styles.slashKeys}>↑↓ escolher · Enter inserir · Esc fechar</span>
          </div>
          {slashMatches.map((reply, index) => (
            <QuickOption key={reply.id} reply={reply} preview={fill(reply.content)} active={index === slashIndex} onPick={() => pickSlash(reply)} onHover={() => setSlashIndex(index)} />
          ))}
        </div>
      )}

      <textarea
        ref={textareaRef}
        rows={1}
        className={styles.textarea}
        placeholder={quickEnabled ? 'Escreva uma mensagem ou / para respostas rápidas' : 'Escreva uma mensagem'}
        title="Enter envia, Shift+Enter quebra linha"
        value={text}
        maxLength={4096}
        aria-autocomplete={quickEnabled ? 'list' : undefined}
        onChange={(e) => { setText(e.target.value); readSlash(e.target.value, e.target.selectionStart); }}
        onClick={(e) => readSlash(e.currentTarget.value, e.currentTarget.selectionStart)}
        onKeyUp={(e) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End') readSlash(e.currentTarget.value, e.currentTarget.selectionStart); }}
        onBlur={() => setSlash(null)}
        onKeyDown={(e) => {
          if (slashOpen && !e.nativeEvent.isComposing) {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              const step = e.key === 'ArrowDown' ? 1 : -1;
              setSlashIndex((index) => (index + step + slashMatches.length) % slashMatches.length);
              return;
            }
            if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab') {
              e.preventDefault();
              pickSlash(slashMatches[Math.min(slashIndex, slashMatches.length - 1)]);
              return;
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              setDismissed(slash?.start ?? null);
              return;
            }
          }
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

