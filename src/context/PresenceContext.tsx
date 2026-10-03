"use client";

/**
 * ============================================================
 * VÓRTICE CRM — Presença em tempo real (Online / Visto por último)
 * ============================================================
 * - Online: Supabase Realtime Presence. Cada aba aberta entra no canal
 *   com a chave do usuário; ao fechar a aba ou sair, a conexão cai e
 *   todo mundo vê o usuário sair em segundos. Várias abas do mesmo
 *   usuário contam como um só.
 * - Visto por último: /api/presence grava profiles.last_seen_at a cada
 *   minuto e quando a aba é fechada (sendBeacon).
 * - Se o Realtime não conectar (rede bloqueando websocket), cai para o
 *   batimento: online = visto nos últimos 2,5 minutos.
 * ============================================================
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { PRESENCE_STALE_MS, formatLastSeen } from '@/lib/presence';

const HEARTBEAT_MS = 60_000;

interface PresenceContextValue {
  /** Online agora. lastSeenAt (do perfil) só é usado quando o Realtime está indisponível. */
  isOnline: (userId: string | null | undefined, lastSeenAt?: string | null) => boolean;
  /** Última vez conectado, combinando o banco com saídas vistas nesta sessão. */
  lastSeen: (userId: string | null | undefined, lastSeenAt?: string | null) => string | null;
  /** "Online" ou "Visto há X min". */
  statusLabel: (userId: string | null | undefined, lastSeenAt?: string | null) => string;
  onlineCount: number;
  realtime: boolean;
}

const PresenceContext = createContext<PresenceContextValue | null>(null);

function sendHeartbeat(useBeacon = false) {
  try {
    if (useBeacon && typeof navigator !== 'undefined' && navigator.sendBeacon) {
      navigator.sendBeacon('/api/presence');
      return;
    }
    fetch('/api/presence', { method: 'POST', keepalive: true }).catch(() => {});
  } catch {
    // Presença nunca deve quebrar a navegação.
  }
}

export function PresenceProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id;
  // Um canal de presença por empresa: ninguém vê quem está online em outra.
  const tenantId = user?.workspace?.tenant_id || user?.tenant_id || 'sem-empresa';
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());
  const [leftAt, setLeftAt] = useState<Record<string, string>>({});
  const [realtime, setRealtime] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const previousOnline = useRef<Set<string>>(new Set());

  // Atualiza os textos "Visto há X min" sem esperar outro evento.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!userId) {
      setOnlineIds(new Set());
      setRealtime(false);
      previousOnline.current = new Set();
      return;
    }

    sendHeartbeat();
    const heartbeat = setInterval(() => sendHeartbeat(), HEARTBEAT_MS);
    const onPageHide = () => sendHeartbeat(true);
    const onVisible = () => { if (document.visibilityState === 'visible') sendHeartbeat(); };
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('visibilitychange', onVisible);

    const channel = supabase?.channel(`presence:${tenantId}`, { config: { presence: { key: userId } } });

    channel
      ?.on('presence', { event: 'sync' }, () => {
        const current = new Set(Object.keys(channel.presenceState()));
        const departed = [...previousOnline.current].filter((id) => !current.has(id));
        if (departed.length > 0) {
          const stamp = new Date().toISOString();
          setLeftAt((value) => ({ ...value, ...Object.fromEntries(departed.map((id) => [id, stamp])) }));
        }
        previousOnline.current = current;
        setOnlineIds(current);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setRealtime(true);
          channel.track({ user_id: userId, online_at: new Date().toISOString() }).catch(() => {});
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setRealtime(false);
        }
      });

    return () => {
      clearInterval(heartbeat);
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('visibilitychange', onVisible);
      sendHeartbeat();
      if (channel) {
        channel.untrack().catch(() => {});
        supabase?.removeChannel(channel);
      }
    };
  }, [userId, tenantId]);

  const lastSeen = useCallback(
    (id: string | null | undefined, lastSeenAt?: string | null) => {
      if (!id) return null;
      const candidates = [lastSeenAt, leftAt[id]].filter((value): value is string => Boolean(value));
      if (candidates.length === 0) return null;
      return candidates.sort().at(-1) ?? null;
    },
    [leftAt]
  );

  const isOnline = useCallback(
    (id: string | null | undefined, lastSeenAt?: string | null) => {
      if (!id) return false;
      if (id === userId) return true;
      if (realtime) return onlineIds.has(id);
      const seen = lastSeen(id, lastSeenAt);
      return seen ? now - new Date(seen).getTime() < PRESENCE_STALE_MS : false;
    },
    [lastSeen, now, onlineIds, realtime, userId]
  );

  const statusLabel = useCallback(
    (id: string | null | undefined, lastSeenAt?: string | null) =>
      isOnline(id, lastSeenAt) ? 'Online' : formatLastSeen(lastSeen(id, lastSeenAt), now),
    [isOnline, lastSeen, now]
  );

  const value = useMemo<PresenceContextValue>(
    () => ({
      isOnline,
      lastSeen,
      statusLabel,
      onlineCount: realtime ? onlineIds.size : userId ? 1 : 0,
      realtime,
    }),
    [isOnline, lastSeen, onlineIds.size, realtime, statusLabel, userId]
  );

  return <PresenceContext.Provider value={value}>{children}</PresenceContext.Provider>;
}

export function usePresence() {
  const context = useContext(PresenceContext);
  if (!context) throw new Error('usePresence precisa estar dentro de PresenceProvider');
  return context;
}
