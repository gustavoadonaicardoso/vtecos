"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Call, Device } from '@twilio/voice-sdk';
import { Phone, PhoneOff, Mic, MicOff, Grid3X3 as DialerIcon, X, History, Download, Clock } from 'lucide-react';
import styles from './Dialer.module.css';
import { formatPhone, toE164 } from '@/lib/dialer/phone';

interface DialerProps {
  onClose?: () => void;
}

interface CallItem {
  id: string;
  contactNumber: string;
  status: string;
  duration: number | null;
  hasRecording: boolean;
  createdAt: string;
}

const STATUS_TEXT: Record<string, string> = {
  completed: 'Atendida',
  'in-progress': 'Em andamento',
  'no-answer': 'Não atendeu',
  busy: 'Ocupado',
  failed: 'Falhou',
  canceled: 'Cancelada',
  queued: 'Na fila',
};

async function fetchToken(): Promise<{ token?: string; phoneNumber?: string; notConnected?: boolean; error?: string }> {
  try {
    const response = await fetch('/api/twilio/token', { cache: 'no-store' });
    const json = await response.json().catch(() => ({}));
    if (response.status === 409) return { notConnected: true };
    if (!response.ok || !json.token) return { error: json.error || 'Não foi possível ligar o discador.' };
    return { token: json.token, phoneNumber: json.phoneNumber };
  } catch {
    return { error: 'Sem conexão com o servidor.' };
  }
}

/**
 * Discador manual (ícone de telefone no topo): liga pelo número da
 * empresa, direto do navegador. Não recebe ligações -- quem recebe as
 * ligações das campanhas é a tela Discador.
 */
export default function Dialer({ onClose }: DialerProps) {
  const deviceRef = useRef<Device | null>(null);
  const [call, setCall] = useState<Call | null>(null);
  const [number, setNumber] = useState('');
  const [status, setStatus] = useState('Conectando…');
  const [ready, setReady] = useState(false);
  const [notConnected, setNotConnected] = useState(false);
  const [fromNumber, setFromNumber] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [view, setView] = useState<'dialer' | 'history'>('dialer');
  const [history, setHistory] = useState<CallItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await fetchToken();
      if (cancelled) return;
      if (result.notConnected) {
        setNotConnected(true);
        setStatus('Não conectado');
        return;
      }
      if (!result.token) {
        setStatus(result.error || 'Erro de conexão');
        return;
      }
      const { Device } = await import('@twilio/voice-sdk');
      if (cancelled) return;
      const device = new Device(result.token, { logLevel: 1, codecPreferences: ['opus', 'pcmu'] as never });
      device.on('tokenWillExpire', () => {
        fetchToken().then((next) => next.token && device.updateToken(next.token)).catch(() => undefined);
      });
      device.on('error', (error: { code?: number }) => setStatus(error?.code === 20101 ? 'Sessão expirada: feche e abra de novo' : 'Erro no discador'));
      deviceRef.current = device;
      setFromNumber(result.phoneNumber || '');
      setReady(true);
      setStatus('Pronto');
    })();
    return () => {
      cancelled = true;
      deviceRef.current?.destroy();
      deviceRef.current = null;
    };
  }, []);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const response = await fetch('/api/calls', { cache: 'no-store' });
      const json = await response.json().catch(() => ({}));
      setHistory(Array.isArray(json.data) ? json.data : []);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  const showHistory = () => {
    setView('history');
    void loadHistory();
  };

  const handleMakeCall = async () => {
    const device = deviceRef.current;
    if (!device || call) return;
    const to = toE164(number);
    if (!to) {
      setStatus('Número inválido: use DDD + número');
      return;
    }
    try {
      setStatus('Chamando…');
      const newCall = await device.connect({ params: { To: to } });
      newCall.on('accept', () => setStatus('Em chamada'));
      const ended = () => {
        setStatus('Chamada encerrada');
        setCall(null);
        setIsMuted(false);
        setTimeout(() => setStatus('Pronto'), 2000);
      };
      newCall.on('disconnect', ended);
      newCall.on('cancel', ended);
      newCall.on('error', () => { setStatus('Falha na chamada'); setCall(null); });
      setCall(newCall);
    } catch {
      setStatus('Falha na chamada: libere o microfone');
    }
  };

  const handleHangup = () => call?.disconnect();

  const toggleMute = () => {
    if (!call) return;
    call.mute(!call.isMuted());
    setIsMuted(call.isMuted());
  };

  // Durante a ligação, o teclado manda os tons (menus de atendimento).
  const pressKey = (digit: string) => {
    if (call) call.sendDigits(digit);
    else setNumber((current) => current + digit);
  };

  return (
    <div className={styles.dialerWrapper}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.statusIndicator}>
            <div className={`${styles.dot} ${status === 'Em chamada' ? styles.active : ''}`} style={!ready ? { background: '#94a3b8' } : undefined} />
            <span>{status}</span>
          </div>
          <div className={styles.tabs}>
            <button className={`${styles.tabBtn} ${view === 'dialer' ? styles.tabActive : ''}`} onClick={() => setView('dialer')} aria-label="Teclado">
              <DialerIcon size={14} />
            </button>
            <button className={`${styles.tabBtn} ${view === 'history' ? styles.tabActive : ''}`} onClick={showHistory} aria-label="Histórico">
              <History size={14} />
            </button>
          </div>
        </div>
        <button onClick={onClose} className={styles.closeBtn} aria-label="Fechar"><X size={18} /></button>
      </div>

      {view === 'dialer' ? (
        <>
          <div className={styles.display}>
            {notConnected ? (
              <div className={styles.notice}>
                <strong>Discador não conectado</strong>
                <span>Um administrador conecta a conta Twilio da empresa em Integrações &gt; Discador.</span>
              </div>
            ) : (
              <>
                <input
                  type="tel"
                  value={number}
                  onChange={(e) => setNumber(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void handleMakeCall(); }}
                  placeholder="DDD + número"
                  className={styles.numberInput}
                  disabled={Boolean(call)}
                />
                {fromNumber && <small className={styles.fromNumber}>Saindo de {formatPhone(fromNumber)}</small>}
              </>
            )}
          </div>

          <div className={styles.keypad}>
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((digit) => (
              <button key={digit} onClick={() => pressKey(digit)} className={styles.key} disabled={notConnected}>
                {digit}
              </button>
            ))}
          </div>

          <div className={styles.controls}>
            {call ? (
              <>
                <button onClick={toggleMute} className={`${styles.controlBtn} ${isMuted ? styles.muted : ''}`} aria-label={isMuted ? 'Ativar microfone' : 'Silenciar'}>
                  {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
                </button>
                <button onClick={handleHangup} className={`${styles.controlBtn} ${styles.hangup}`} aria-label="Desligar">
                  <PhoneOff size={20} />
                </button>
              </>
            ) : (
              <button onClick={handleMakeCall} className={`${styles.controlBtn} ${styles.call}`} disabled={!ready || !number.trim()} aria-label="Ligar">
                <Phone size={20} />
              </button>
            )}
          </div>
        </>
      ) : (
        <div className={styles.historyList}>
          {loadingHistory ? (
            <div className={styles.emptyState}>Carregando…</div>
          ) : history.length === 0 ? (
            <div className={styles.emptyState}>Nenhuma chamada recente</div>
          ) : (
            history.map((item) => (
              <div key={item.id} className={styles.historyItem}>
                <div className={styles.itemInfo}>
                  <div className={styles.itemPhone}>{formatPhone(item.contactNumber)}</div>
                  <div className={styles.itemMeta}>
                    <Clock size={10} />
                    <span>{new Date(item.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                    <span> · {STATUS_TEXT[item.status] || item.status}</span>
                    {item.duration ? <span> · {Math.floor(item.duration / 60)}:{(item.duration % 60).toString().padStart(2, '0')}</span> : null}
                  </div>
                </div>
                <div className={styles.itemActions}>
                  {item.hasRecording && (
                    <a href={`/api/calls/recording?log=${item.id}&download=1`} className={styles.actionBtn} title="Baixar gravação" aria-label="Baixar gravação">
                      <Download size={14} />
                    </a>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
