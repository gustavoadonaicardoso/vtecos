'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import styles from './display.module.css';
import { DisplayMediaLayer, useDisplayMedia } from './DisplayMedia';
import { DEFAULT_QUEUE_SETTINGS, deskName, spokenCall, ticketCode, type QueueSettings } from '@/lib/queue';

interface CalledTicket {
  id: string;
  number: number;
  priority: boolean;
  name: string;
  desk: string | null;
  status: string;
  calledAt: string;
  callCount: number;
}

/** Aviso de duas notas gerado no próprio navegador (não depende de arquivo externo). */
function playChime(ctx: AudioContext) {
  const start = ctx.currentTime + 0.05;
  [
    [880, 0],
    [1320, 0.22],
  ].forEach(([frequency, delay]) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, start + delay);
    gain.gain.exponentialRampToValueAtTime(0.4, start + delay + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + delay + 1.1);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start + delay);
    osc.stop(start + delay + 1.2);
  });
}

function speak(text: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'pt-BR';
  utterance.rate = 0.95;
  const voice = window.speechSynthesis.getVoices().find((item) => item.lang?.toLowerCase().startsWith('pt'));
  if (voice) utterance.voice = voice;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

export default function DisplayPage() {
  const [current, setCurrent] = useState<CalledTicket | null>(null);
  const [history, setHistory] = useState<CalledTicket[]>([]);
  const [settings, setSettings] = useState<QueueSettings>(DEFAULT_QUEUE_SETTINGS);
  const [waiting, setWaiting] = useState(0);
  // Mesmo HTML no servidor e no primeiro render do navegador: a hora entra depois.
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  // Chave da empresa na URL (/display?k=...): o painel mostra só a fila dela.
  const [displayKey, setDisplayKey] = useState<string | null>(null);
  const [missingKey, setMissingKey] = useState(false);
  const { mode: mediaMode, media, active: mediaActive, notifyCall } = useDisplayMedia(displayKey);
  const [mediaSlot, setMediaSlot] = useState<HTMLDivElement | null>(null);
  const [highlightCall, setHighlightCall] = useState(false);
  // O navegador só libera som depois de um toque/clique na tela.
  const [soundOn, setSoundOn] = useState(false);

  const audioCtx = useRef<AudioContext | null>(null);
  const lastCallKey = useRef<string | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const live = useRef({ notifyCall, settings, soundOn });
  useEffect(() => {
    live.current = { notifyCall, settings, soundOn };
  }, [notifyCall, settings, soundOn]);

  const enableSound = useCallback(() => {
    try {
      audioCtx.current ??= new AudioContext();
      void audioCtx.current.resume();
      setSoundOn(true);
    } catch {
      // Navegador sem Web Audio: segue só com a voz (se houver).
      setSoundOn(true);
    }
  }, []);

  const announce = useCallback((ticket: CalledTicket) => {
    const { notifyCall: hideMedia, settings: cfg, soundOn: canPlay } = live.current;
    hideMedia();
    setHighlightCall(true);
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setHighlightCall(false), 8000);
    if (!canPlay) return;
    if (audioCtx.current) playChime(audioCtx.current);
    if (cfg.voiceEnabled) setTimeout(() => speak(spokenCall(ticket, cfg.deskLabel)), 1300);
  }, []);

  const fetchTickets = useCallback(async (key: string) => {
    try {
      const response = await fetch(`/api/queue/display/tickets?key=${encodeURIComponent(key)}`, { cache: 'no-store' });
      if (!response.ok) {
        if (response.status === 404) setMissingKey(true);
        return;
      }
      const payload: { settings: QueueSettings | null; tickets: CalledTicket[]; waiting: number } = await response.json();
      if (payload.settings) setSettings(payload.settings);
      setWaiting(payload.waiting ?? 0);
      const list = payload.tickets || [];
      const calling = list.find((ticket) => ticket.status === 'calling') || list[0] || null;
      setCurrent(calling);
      setHistory(list.filter((ticket) => ticket.id !== calling?.id).slice(0, 5));

      // Senha nova chamada (ou chamada de novo): aviso, voz e a mídia sai da frente.
      const callKey = calling && calling.status === 'calling' ? `${calling.id}-${calling.calledAt}` : '';
      if (lastCallKey.current !== null && callKey && callKey !== lastCallKey.current) announce(calling!);
      lastCallKey.current = callKey || lastCallKey.current || '';
    } catch {
      // Sem rede: mantém o que está na tela e tenta de novo no próximo ciclo.
    }
  }, [announce]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    const key = new URLSearchParams(window.location.search).get('k');
    queueMicrotask(() => {
      if (!key) setMissingKey(true);
      else setDisplayKey(key);
    });
    return () => clearInterval(timer);
  }, []);

  // A fila é consultada pelo servidor a cada 3s (não há leitura anônima no banco).
  useEffect(() => {
    if (!displayKey) return;
    queueMicrotask(() => void fetchTickets(displayKey));
    const poll = setInterval(() => void fetchTickets(displayKey), 3000);
    return () => clearInterval(poll);
  }, [displayKey, fetchTickets]);

  if (missingKey) {
    return (
      <div className={styles.container} style={{ placeItems: 'center', display: 'grid' }}>
        <p className={styles.footerText}>Painel sem empresa. Abra o link da TV pela tela de Senhas do sistema.</p>
      </div>
    );
  }

  const color = settings.primaryColor || '#4f00cb';

  return (
    <div className={styles.container} onClick={soundOn ? undefined : enableSound}>
      <header className={styles.header}>
        <div className={styles.logo}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={settings.logoUrl || '/brand/vortice-logo.png'} alt={settings.appName || 'Vórtice Tecnologia'} className={styles.logoImage} />
        </div>
        <div className={styles.clock}>
          {currentTime ? currentTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--:--'}
        </div>
      </header>

      <main className={styles.mainDisplay}>
        <div className={`${styles.currentTicketCard} ${highlightCall ? styles.calling : ''}`}>
          <span className={styles.label}>{current?.priority ? 'Senha preferencial' : 'Senha atual'}</span>
          <h1 key={current ? `${current.id}-${current.calledAt}` : 'none'} className={styles.ticketNumber} style={{ color }}>
            {current ? ticketCode(current.number, current.priority) : '--'}
          </h1>
          {current?.name && <div className={styles.clientName}>{current.name}</div>}
          <div className={styles.deskInfo} style={{ color }}>
            {current ? deskName(settings.deskLabel, current.desk).toUpperCase() : 'AGUARDANDO...'}
          </div>
          {waiting > 0 && <div className={styles.waitingInfo}>{waiting === 1 ? '1 pessoa aguardando' : `${waiting} pessoas aguardando`}</div>}
        </div>

        <div className={styles.history}>
          {mediaActive && mediaMode === 'minimized' && <div ref={setMediaSlot} className={styles.mediaSlot} />}
          <h2 className={styles.historyTitle}>Últimas senhas</h2>
          {history.length > 0 ? (
            history.map((ticket) => (
              <div key={ticket.id} className={styles.historyItem}>
                <div className={styles.historyContent}>
                  <span className={styles.historyTicket}>
                    {ticketCode(ticket.number, ticket.priority)}
                    {ticket.name && <span className={styles.historyName}>{ticket.name}</span>}
                  </span>
                  <span className={styles.historyTime}>
                    {new Date(ticket.calledAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <span className={styles.historyDesk} style={{ color }}>{deskName(settings.deskLabel, ticket.desk)}</span>
              </div>
            ))
          ) : (
            <p className={styles.emptyHistory}>Sem histórico</p>
          )}
        </div>
      </main>

      <DisplayMediaLayer
        mode={mediaActive ? mediaMode : 'hidden'}
        media={media}
        slot={mediaSlot}
        ticketBadge={
          current ? (
            <div className={styles.mediaTicketBadge}>
              <span>Senha</span>
              <strong style={{ color }}>{ticketCode(current.number, current.priority)}</strong>
              <span>{deskName(settings.deskLabel, current.desk)}</span>
            </div>
          ) : null
        }
      />

      <footer className={styles.footer}>
        <div className={styles.footerText}>{settings.welcomeText || 'ATENÇÃO AO NÚMERO CHAMADO NO PAINEL'}</div>
        {settings.bannerUrl && (
          <div className={styles.banner}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={settings.bannerUrl} alt="Banner" className={styles.bannerImage} />
          </div>
        )}
      </footer>

      <button
        type="button"
        className={`${styles.soundHint} ${soundOn ? styles.soundOn : ''}`}
        onClick={(e) => { e.stopPropagation(); if (soundOn) { setSoundOn(false); } else { enableSound(); } }}
        aria-label={soundOn ? 'Desligar o som' : 'Ativar o som'}
      >
        {soundOn ? <Volume2 size={18} /> : <><VolumeX size={18} /> Toque na tela para ativar o som</>}
      </button>
    </div>
  );
}
