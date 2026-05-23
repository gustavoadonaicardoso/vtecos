"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Device } from '@twilio/voice-sdk';
import { Phone, PhoneOff, Mic, MicOff, Grid3X3 as DialerIcon, X, History, Download, Play, Clock } from 'lucide-react';
import styles from './Dialer.module.css';
import { useAuth } from '@/context/AuthContext';
import { fetchCallHistory, CallLog } from '@/services/calls.service';

interface DialerProps {
  onClose?: () => void;
}

export default function Dialer({ onClose }: DialerProps) {
  const { user } = useAuth();
  const [device, setDevice] = useState<Device | null>(null);
  const [call, setCall] = useState<any>(null);
  const [number, setNumber] = useState('');
  const [status, setStatus] = useState('Pronto');
  const [isMuted, setIsMuted] = useState(false);
  const [view, setView] = useState<'dialer' | 'history'>('dialer');
  const [history, setHistory] = useState<CallLog[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    async function initDevice() {
      try {
        const identity = user?.name || 'Agente';
        const response = await fetch(`/api/twilio/token?identity=${encodeURIComponent(identity)}`);
        
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Server error: ${response.status} - ${errorText.substring(0, 50)}`);
        }
        
        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
          throw new Error("Server returned non-JSON response");
        }

        const { token } = await response.json();

        const newDevice = new Device(token, {
          logLevel: 1,
          edge: 'ashburn', // Or appropriate edge
        });

        newDevice.on('registered', () => setStatus('Conectado'));
        newDevice.on('error', (error) => {
          console.error('Twilio Error:', error);
          if (error.code === 20101) {
            setStatus('Credenciais Inválidas');
          } else {
            setStatus('Erro');
          }
        });

        await newDevice.register();
        setDevice(newDevice);
      } catch (err) {
        console.error('Failed to init Twilio device', err);
        setStatus('Erro de conexão');
      }
    }

    initDevice();

    return () => {
      device?.destroy();
    };
  }, []);

  const loadHistory = useCallback(async () => {
    if (!user) return;
    setLoadingHistory(true);
    const data = await fetchCallHistory(user.id);
    setHistory(data);
    setLoadingHistory(false);
  }, [user]);

  useEffect(() => {
    if (view === 'history') {
      loadHistory();
    }
  }, [view, loadHistory]);

  const handleMakeCall = async () => {
    if (!device || !number) return;

    try {
      setStatus('Chamando...');
      const params = { To: number };
      const newCall = await device.connect({ params });

      newCall.on('accept', () => setStatus('Em chamada'));
      newCall.on('disconnect', () => {
        setStatus('Chamada encerrada');
        setCall(null);
        setTimeout(() => setStatus('Pronto'), 2000);
      });

      setCall(newCall);
    } catch (err) {
      console.error('Call failed', err);
      setStatus('Falha na chamada');
    }
  };

  const handleHangup = () => {
    if (call) {
      call.disconnect();
    }
  };

  const toggleMute = () => {
    if (call) {
      const muted = !isMuted;
      call.mute(muted);
      setIsMuted(muted);
    }
  };

  const appendNumber = (digit: string) => {
    setNumber(prev => prev + digit);
  };

  const downloadRecording = async (recordingUrl: string, date: string) => {
    if (!user) return;
    
    try {
      const response = await fetch(recordingUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      // Format: user_id_date.mp3
      const formattedDate = new Date(date).toISOString().split('T')[0];
      a.download = `${user.id}_${formattedDate}.mp3`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Download failed', err);
    }
  };

  return (
    <div className={styles.dialerWrapper}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.statusIndicator}>
            <div className={`${styles.dot} ${status === 'Em chamada' ? styles.active : ''}`} />
            <span>{status}</span>
          </div>
          <div className={styles.tabs}>
            <button 
              className={`${styles.tabBtn} ${view === 'dialer' ? styles.tabActive : ''}`}
              onClick={() => setView('dialer')}
            >
              <DialerIcon size={14} />
            </button>
            <button 
              className={`${styles.tabBtn} ${view === 'history' ? styles.tabActive : ''}`}
              onClick={() => setView('history')}
            >
              <History size={14} />
            </button>
          </div>
        </div>
        <button onClick={onClose} className={styles.closeBtn}><X size={18} /></button>
      </div>

      {view === 'dialer' ? (
        <>
          <div className={styles.display}>
            {status === 'Credenciais Inválidas' ? (
              <div className={styles.configAlert}>
                <p>Configuração Necessária</p>
                <span>Insira suas chaves no arquivo <code>.env.local</code></span>
              </div>
            ) : (
              <input 
                type="text" 
                value={number} 
                onChange={(e) => setNumber(e.target.value)}
                placeholder="Digite o número"
                className={styles.numberInput}
              />
            )}
          </div>

          <div className={styles.keypad}>
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((digit) => (
              <button 
                key={digit} 
                onClick={() => appendNumber(digit)}
                className={styles.key}
              >
                {digit}
              </button>
            ))}
          </div>

          <div className={styles.controls}>
            {call ? (
              <>
                <button onClick={toggleMute} className={`${styles.controlBtn} ${isMuted ? styles.muted : ''}`}>
                  {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
                </button>
                <button onClick={handleHangup} className={`${styles.controlBtn} ${styles.hangup}`}>
                  <PhoneOff size={20} />
                </button>
              </>
            ) : (
              <button onClick={handleMakeCall} className={`${styles.controlBtn} ${styles.call}`}>
                <Phone size={20} />
              </button>
            )}
          </div>
        </>
      ) : (
        <div className={styles.historyList}>
          {loadingHistory ? (
            <div className={styles.emptyState}>Carregando...</div>
          ) : history.length === 0 ? (
            <div className={styles.emptyState}>Nenhuma chamada recente</div>
          ) : (
            history.map((item) => (
              <div key={item.id} className={styles.historyItem}>
                <div className={styles.itemInfo}>
                  <div className={styles.itemPhone}>{item.contact_number}</div>
                  <div className={styles.itemMeta}>
                    <Clock size={10} />
                    <span>{new Date(item.created_at).toLocaleString('pt-BR')}</span>
                    {item.duration && <span> · {Math.floor(item.duration / 60)}:{(item.duration % 60).toString().padStart(2, '0')}</span>}
                  </div>
                </div>
                <div className={styles.itemActions}>
                  {item.recording_url && (
                    <button 
                      onClick={() => downloadRecording(item.recording_url!, item.created_at)}
                      className={styles.actionBtn}
                      title="Baixar Gravação"
                    >
                      <Download size={14} />
                    </button>
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
