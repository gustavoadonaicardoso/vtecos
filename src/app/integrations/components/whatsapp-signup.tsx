'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import styles from '../integrations.module.css';
import { api, BusyIcon, type Feedback } from './shared';

type FacebookSdk = {
  init: (options: Record<string, unknown>) => void;
  login: (callback: (response: { authResponse?: { code?: string } | null }) => void, options: Record<string, unknown>) => void;
};

declare global {
  interface Window {
    FB?: FacebookSdk;
    fbAsyncInit?: () => void;
  }
}

interface SignupConfig { appId: string; configId: string; graphVersion: string }

/** Marca do Facebook ("f") para o botão de login. */
function FacebookMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07Z" />
    </svg>
  );
}

/** Carrega o SDK do Facebook uma vez e inicia com o app da Vórtice. */
function loadSdk(config: SignupConfig): Promise<FacebookSdk> {
  return new Promise((resolve, reject) => {
    const init = () => {
      window.FB!.init({ appId: config.appId, autoLogAppEvents: true, xfbml: false, version: config.graphVersion });
      resolve(window.FB!);
    };
    if (window.FB) return init();
    window.fbAsyncInit = init;
    if (!document.getElementById('facebook-jssdk')) {
      const script = document.createElement('script');
      script.id = 'facebook-jssdk';
      script.src = 'https://connect.facebook.net/pt_BR/sdk.js';
      script.async = true;
      script.defer = true;
      script.crossOrigin = 'anonymous';
      script.onerror = () => reject(new Error('Não foi possível carregar o login do Facebook. Desative bloqueadores de anúncio e tente de novo.'));
      document.body.appendChild(script);
    }
  });
}

/**
 * Botão "Conectar com Facebook" (cadastro incorporado da Meta). O Facebook
 * devolve um código (login) e, por mensagem da janela, a conta e o número
 * escolhidos; com os três, o servidor conclui a conexão.
 */
export function WhatsAppSignupButton({ onDone, onFeedback }: { onDone: (message: string) => Promise<void>; onFeedback: (feedback: Feedback) => void }) {
  const [config, setConfig] = useState<SignupConfig | null>(null);
  const [sdk, setSdk] = useState<FacebookSdk | null>(null);
  const [busy, setBusy] = useState(false);
  const session = useRef<{ code?: string; phoneNumberId?: string; wabaId?: string; done?: boolean }>({});
  const timer = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    api<SignupConfig | null>('/api/integrations/whatsapp')
      .then(async (data) => {
        if (!alive || !data) return;
        setConfig(data);
        setSdk(await loadSdk(data));
      })
      .catch((error) => alive && onFeedback({ type: 'error', text: error instanceof Error ? error.message : 'Login do Facebook indisponível.' }));
    return () => { alive = false; };
  }, [onFeedback]);

  const finish = useCallback(async () => {
    const { code, phoneNumberId, wabaId, done } = session.current;
    if (done || !code || !phoneNumberId || !wabaId) return;
    session.current.done = true;
    if (timer.current) window.clearTimeout(timer.current);
    try {
      const result = await api<{ displayPhone: string; verifiedName: string; warning?: string }>('/api/integrations/whatsapp', {
        method: 'POST',
        body: JSON.stringify({ code, phoneNumberId, wabaId }),
      });
      await onDone(`WhatsApp conectado: ${result.displayPhone}${result.verifiedName ? ` (${result.verifiedName})` : ''}. As mensagens já chegam em Mensagens.${result.warning ? ` Atenção: ${result.warning}` : ''}`);
    } catch (error) {
      onFeedback({ type: 'error', text: error instanceof Error ? error.message : 'Não foi possível concluir a conexão.' });
    } finally {
      setBusy(false);
    }
  }, [onDone, onFeedback]);

  // A conta e o número escolhidos chegam por mensagem da janela do Facebook.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      let host = '';
      try { host = new URL(event.origin).hostname; } catch { return; }
      if (!/(^|\.)facebook\.com$/.test(host)) return;
      let data: { type?: string; event?: string; data?: { phone_number_id?: string; waba_id?: string; current_step?: string } };
      try { data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data; } catch { return; }
      if (data?.type !== 'WA_EMBEDDED_SIGNUP') return;
      if (data.event === 'CANCEL') {
        setBusy(false);
        onFeedback({ type: 'error', text: 'Cadastro interrompido no Facebook. Clique em Conectar com Facebook para tentar de novo.' });
        return;
      }
      if (data.data?.phone_number_id && data.data.waba_id) {
        session.current.phoneNumberId = String(data.data.phone_number_id);
        session.current.wabaId = String(data.data.waba_id);
        void finish();
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [finish, onFeedback]);

  const launch = () => {
    if (!sdk || !config) return;
    session.current = {};
    setBusy(true);
    onFeedback(null);
    sdk.login((response) => {
      const code = response?.authResponse?.code;
      if (!code) {
        setBusy(false);
        onFeedback({ type: 'error', text: 'Login cancelado no Facebook.' });
        return;
      }
      session.current.code = code;
      void finish();
      // Login feito, mas o número não chegou: o cadastro não foi até o fim.
      timer.current = window.setTimeout(() => {
        if (session.current.done) return;
        setBusy(false);
        onFeedback({ type: 'error', text: 'O Facebook não informou o número escolhido. Refaça o cadastro e vá até o fim (escolher a conta e o número).' });
      }, 15_000);
    }, {
      config_id: config.configId,
      response_type: 'code',
      override_default_response_type: true,
      extras: { setup: {}, featureType: '', sessionInfoVersion: '3' },
    });
  };

  return (
    <button type="button" className={styles.facebookBtn} onClick={launch} disabled={!sdk || busy}>
      <BusyIcon busy={busy || (!sdk && Boolean(config))} icon={<FacebookMark />} /> {busy ? 'Conectando…' : 'Conectar com Facebook'}
    </button>
  );
}
