'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Call, Device } from '@twilio/voice-sdk';

export type PhoneState = 'off' | 'starting' | 'ready' | 'error';

async function fetchToken(): Promise<string> {
  const response = await fetch('/api/twilio/token', { cache: 'no-store' });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json.token) throw new Error(json.error || 'Não foi possível ligar o telefone do navegador.');
  return json.token as string;
}

/**
 * Telefone do atendente no navegador (Twilio Voice SDK). Registrado, ele
 * recebe as ligações que o discador passa e atende sozinho: quem está
 * "Disponível" já está esperando a próxima conversa.
 */
export function useAgentPhone(handlers: { onIncoming: () => void; onEnded: () => void }) {
  const deviceRef = useRef<Device | null>(null);
  const callRef = useRef<Call | null>(null);
  const handlersRef = useRef(handlers);
  const [state, setState] = useState<PhoneState>('off');
  const [error, setError] = useState('');
  const [inCall, setInCall] = useState(false);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    handlersRef.current = handlers;
  });

  const stop = useCallback(() => {
    callRef.current?.disconnect();
    callRef.current = null;
    deviceRef.current?.destroy();
    deviceRef.current = null;
    setInCall(false);
    setState('off');
  }, []);

  const start = useCallback(async () => {
    if (deviceRef.current) return true;
    setState('starting');
    setError('');
    try {
      // Pede o microfone antes: sem ele a ligação atendida fica muda.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
    } catch {
      setState('error');
      setError('Libere o microfone para este site (ícone do cadeado na barra de endereço) e tente de novo.');
      return false;
    }
    try {
      const { Device } = await import('@twilio/voice-sdk');
      const device = new Device(await fetchToken(), { logLevel: 1, codecPreferences: ['opus', 'pcmu'] as never, closeProtection: true });
      device.on('incoming', (call: Call) => {
        if (callRef.current) {
          call.reject();
          return;
        }
        callRef.current = call;
        const ended = () => {
          if (callRef.current !== call) return;
          callRef.current = null;
          setInCall(false);
          setMuted(false);
          handlersRef.current.onEnded();
        };
        call.on('disconnect', ended);
        call.on('cancel', ended);
        call.on('error', ended);
        call.accept();
        setInCall(true);
        handlersRef.current.onIncoming();
      });
      device.on('tokenWillExpire', () => {
        fetchToken().then((token) => device.updateToken(token)).catch(() => undefined);
      });
      device.on('error', (deviceError: { code?: number; message?: string }) => {
        if (deviceError?.code === 20101 || deviceError?.code === 31204) {
          setError('A conexão com a Twilio expirou. Clique em "Ficar disponível" de novo.');
          stop();
          setState('error');
        }
      });
      await device.register();
      deviceRef.current = device;
      setState('ready');
      return true;
    } catch (startError) {
      setState('error');
      setError(startError instanceof Error ? startError.message : 'Não foi possível ligar o telefone do navegador.');
      return false;
    }
  }, [stop]);

  const hangUp = useCallback(() => callRef.current?.disconnect(), []);
  const toggleMute = useCallback(() => {
    const call = callRef.current;
    if (!call) return;
    call.mute(!call.isMuted());
    setMuted(call.isMuted());
  }, []);

  useEffect(() => () => {
    deviceRef.current?.destroy();
    deviceRef.current = null;
  }, []);

  return { state, error, inCall, muted, start, stop, hangUp, toggleMute };
}
