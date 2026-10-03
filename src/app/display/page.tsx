'use client';

import { useEffect, useState, useRef } from 'react';
import styles from './display.module.css';
import { DisplayMediaLayer, useDisplayMedia } from './DisplayMedia';

interface Ticket {
  id: string;
  number: number;
  name?: string;
  desk: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface QueueSettings {
  logo_url: string;
  banner_url: string;
  app_name: string;
  primary_color: string;
  secondary_color: string;
  welcome_text: string;
}

export default function DisplayPage() {
  const [currentTicket, setCurrentTicket] = useState<Ticket | null>(null);
  const [history, setHistory] = useState<Ticket[]>([]);
  const [settings, setSettings] = useState<QueueSettings | null>(null);
  // Keep the server render and the client's first render identical. The real
  // time is populated after hydration, when the browser has mounted the page.
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Chave da empresa na URL (/display?k=...): o painel mostra só a fila dela.
  const [displayKey, setDisplayKey] = useState<string | null>(null);
  const [missingKey, setMissingKey] = useState(false);
  const { mode: mediaMode, media, active: mediaActive, notifyCall } = useDisplayMedia(displayKey);
  const [mediaSlot, setMediaSlot] = useState<HTMLDivElement | null>(null);
  // fetchTickets roda dentro do efeito de montagem; o ref sempre aponta pra versão atual.
  const notifyCallRef = useRef(notifyCall);
  notifyCallRef.current = notifyCall;
  const lastCallKey = useRef<string | null>(null);
  // Destaque animado no cartão da senha logo depois de uma chamada.
  const [highlightCall, setHighlightCall] = useState(false);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchTickets = async (key: string) => {
    try {
      const response = await fetch(`/api/queue/display/tickets?key=${encodeURIComponent(key)}`, { cache: 'no-store' });
      if (!response.ok) {
        if (response.status === 404) setMissingKey(true);
        return;
      }
      const payload: { settings: QueueSettings | null; tickets: Ticket[] } = await response.json();
      if (payload.settings) setSettings(payload.settings);
      const data = payload.tickets;

      if (data && data.length > 0) {
        const calling = data.find(t => t.status === 'calling') || data[0];
        setCurrentTicket(calling);

        // Senha nova chamada (ou rechamada): toca o aviso e tira a mídia da frente.
        const callKey = calling.status === 'calling' ? `${calling.id}-${calling.updated_at}` : null;
        if (callKey && lastCallKey.current !== null && callKey !== lastCallKey.current) {
          audioRef.current?.play().catch(() => {});
          notifyCallRef.current();
          setHighlightCall(true);
          if (highlightTimer.current) clearTimeout(highlightTimer.current);
          highlightTimer.current = setTimeout(() => setHighlightCall(false), 8000);
        }
        lastCallKey.current = callKey ?? lastCallKey.current ?? '';

        setHistory(data.filter(t => t.id !== calling.id));
      } else {
        setCurrentTicket(null);
        setHistory([]);
        if (lastCallKey.current === null) lastCallKey.current = '';
      }
    } catch {
      // Sem rede: mantém o que está na tela e tenta de novo no próximo ciclo.
    }
  };

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    const key = new URLSearchParams(window.location.search).get('k');
    queueMicrotask(() => {
      if (!key) setMissingKey(true);
      else setDisplayKey(key);
    });
    return () => clearInterval(timer);
  }, []);

  // A fila é consultada pelo servidor a cada 3s (não há mais leitura anônima no banco).
  useEffect(() => {
    if (!displayKey) return;
    queueMicrotask(() => void fetchTickets(displayKey));
    const poll = setInterval(() => void fetchTickets(displayKey), 3000);
    return () => clearInterval(poll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayKey]);

  if (missingKey) {
    return (
      <div className={styles.container} style={{ placeItems: 'center', display: 'grid' }}>
        <p className={styles.footerText}>Painel sem empresa. Abra o link do painel pela tela de Senhas do sistema.</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Invisible audio element for the chime */}
      <audio ref={audioRef} src="https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3" preload="auto" />

      <header className={styles.header}>
        <div className={styles.logo}>
          {/* Logo configurada no painel (queue_settings) ou a da Vórtice. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={settings?.logo_url || '/brand/vortice-logo.png'} alt={settings?.app_name || 'Vórtice Tecnologia'} className={styles.logoImage} />
        </div>
        <div className={styles.clock}>
          {currentTime
            ? currentTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
            : '--:--'}
        </div>
      </header>

      <main className={styles.mainDisplay}>
        <div className={`${styles.currentTicketCard} ${highlightCall ? styles.calling : ''}`}>
          <span className={styles.label}>Senha Atual</span>
          <h1 key={currentTicket?.id ?? 'none'} className={styles.ticketNumber} style={{ color: settings?.primary_color || '#4f00cb' }}>
            {currentTicket ? currentTicket.number.toString().padStart(2, '0') : '--'}
          </h1>
          {currentTicket?.name && (
            <div className={styles.clientName}>
              {currentTicket.name}
            </div>
          )}
          <div className={styles.deskInfo} style={{ color: settings?.primary_color || '#7c3aed' }}>
            {currentTicket ? `GUICHÊ ${currentTicket.desk}` : 'AGUARDANDO...'}
          </div>
        </div>

        <div className={styles.history}>
          {mediaActive && mediaMode === 'minimized' && <div ref={setMediaSlot} className={styles.mediaSlot} />}
          <h2 className={styles.historyTitle}>Últimas Senhas</h2>
          {history.length > 0 ? (
            history.map((ticket) => (
              <div key={ticket.id} className={styles.historyItem}>
                <div className={styles.historyContent}>
                  <span className={styles.historyTicket}>
                    #{ticket.number.toString().padStart(2, '0')}
                    {ticket.name && <span className={styles.historyName}>{ticket.name}</span>}
                  </span>
                  <span className={styles.historyTime}>
                    {new Date(ticket.updated_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <span className={styles.historyDesk}>Guichê {ticket.desk}</span>
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
          currentTicket ? (
            <div className={styles.mediaTicketBadge}>
              <span>Senha</span>
              <strong style={{ color: settings?.primary_color || '#4f00cb' }}>{currentTicket.number.toString().padStart(2, '0')}</strong>
              <span>Guichê {currentTicket.desk}</span>
            </div>
          ) : null
        }
      />

      <footer className={styles.footer}>
        <div className={styles.footerText}>
          {settings?.welcome_text || 'ATENÇÃO AO NÚMERO CHAMADO NO PAINEL'}
        </div>
        {settings?.banner_url && (
          <div className={styles.banner}>
            <img src={settings.banner_url} alt="Banner" className={styles.bannerImage} />
          </div>
        )}
      </footer>
    </div>
  );
}
