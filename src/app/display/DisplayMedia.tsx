'use client';

/**
 * Mídia do Painel de Senhas (anúncios, imagens e vídeos).
 *
 * - useDisplayMedia: busca a playlist/rotina (/api/queue/display, a cada
 *   60s) e decide o modo atual: tela inteira, minimizada ou oculta, pela
 *   rotina configurada. Quando uma senha é chamada (notifyCall), a mídia
 *   some por alguns segundos e o relógio da rotina fica parado nesse tempo.
 * - DisplayMediaLayer: UM player fixo que muda de posição/tamanho conforme
 *   o modo (tela cheia, encaixado no "slot" da coluna lateral, ou
 *   invisível). Assim o vídeo não recomeça ao trocar de modo.
 */

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import styles from './display.module.css';
import { normalizeDisplayConfig, type DisplayConfig, type DisplayMediaItem, type DisplayMediaMode } from '@/lib/queue-display';

const POLL_MS = 60_000;
const MAX_VIDEO_MS = 10 * 60_000;

export function useDisplayMedia() {
  const [config, setConfig] = useState<DisplayConfig | null>(null);
  const [media, setMedia] = useState<DisplayMediaItem[]>([]);
  const [mode, setMode] = useState<DisplayMediaMode>('hidden');

  const phaseIndex = useRef(0);
  const phaseEndsAt = useRef(0);
  const interruptUntil = useRef(0);
  const lastTick = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch('/api/queue/display', { cache: 'no-store' });
        const result = await response.json().catch(() => ({}));
        if (cancelled || !response.ok) return;
        setConfig(normalizeDisplayConfig(result.data?.config));
        setMedia(Array.isArray(result.data?.media) ? result.data.media : []);
      } catch {
        // Sem rede: mantém o que já está tocando.
      }
    };
    load();
    const timer = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const active = Boolean(config?.enabled && media.length > 0);

  useEffect(() => {
    if (!active || !config) {
      setMode('hidden');
      return;
    }
    const cycle = config.cycle;
    phaseIndex.current = Math.min(phaseIndex.current, cycle.length - 1);
    if (!phaseEndsAt.current) phaseEndsAt.current = Date.now() + cycle[phaseIndex.current].seconds * 1000;
    lastTick.current = Date.now();

    const tick = () => {
      const now = Date.now();
      const delta = now - lastTick.current;
      lastTick.current = now;

      if (now < interruptUntil.current) {
        // Senha chamada: rotina pausada, mídia fora da frente.
        phaseEndsAt.current += delta;
        setMode('hidden');
        return;
      }
      if (now >= phaseEndsAt.current) {
        phaseIndex.current = (phaseIndex.current + 1) % cycle.length;
        phaseEndsAt.current = now + cycle[phaseIndex.current].seconds * 1000;
      }
      setMode(cycle[phaseIndex.current].mode);
    };
    tick();
    const timer = setInterval(tick, 500);
    return () => clearInterval(timer);
  }, [active, config]);

  const notifyCall = useCallback(() => {
    const seconds = config?.callInterruptSeconds ?? 15;
    if (seconds > 0) interruptUntil.current = Date.now() + seconds * 1000;
  }, [config?.callInterruptSeconds]);

  return { mode, media, active, notifyCall };
}

function MediaPlayer({ media }: { media: DisplayMediaItem[] }) {
  const [index, setIndex] = useState(0);
  const item = media[index % media.length];

  const next = useCallback(() => setIndex((value) => (value + 1) % Math.max(1, media.length)), [media.length]);

  // Playlist mudou (item removido/pausado): não aponta para fora da lista.
  useEffect(() => {
    if (index >= media.length) setIndex(0);
  }, [index, media.length]);

  useEffect(() => {
    if (!item) return;
    const ms = item.type === 'image' ? item.duration_seconds * 1000 : MAX_VIDEO_MS;
    const timer = setTimeout(next, ms);
    return () => clearTimeout(timer);
  }, [item, next]);

  if (!item) return null;
  const single = media.length === 1;

  return item.type === 'image' ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img key={item.id} src={item.url} alt={item.title || ''} className={styles.mediaContent} onError={() => setTimeout(next, 1000)} />
  ) : (
    <video
      key={item.id}
      src={item.url}
      className={styles.mediaContent}
      autoPlay
      muted
      playsInline
      loop={single}
      onEnded={single ? undefined : next}
      onError={() => setTimeout(next, 1000)}
    />
  );
}

interface LayerProps {
  mode: DisplayMediaMode;
  media: DisplayMediaItem[];
  slot: HTMLDivElement | null;
  ticketBadge: React.ReactNode;
}

export function DisplayMediaLayer({ mode, media, slot, ticketBadge }: LayerProps) {
  const [rect, setRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const lastRect = useRef<{ top: number; left: number; width: number; height: number } | null>(null);

  useLayoutEffect(() => {
    if (mode !== 'minimized' || !slot) return;
    const measure = () => {
      const box = slot.getBoundingClientRect();
      const next = { top: box.top, left: box.left, width: box.width, height: box.height };
      lastRect.current = next;
      setRect(next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(slot);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [mode, slot]);

  if (media.length === 0) return null;

  // Tela cheia em unidades de viewport: acompanha redimensionamento sem medir.
  const fullscreen = { top: 0, left: 0, width: '100vw', height: '100dvh' };
  const box =
    mode === 'fullscreen'
      ? fullscreen
      : mode === 'minimized'
        ? rect || lastRect.current || fullscreen
        : lastRect.current || fullscreen;

  return (
    <div
      className={`${styles.mediaLayer} ${styles[`media_${mode}`]}`}
      style={{ top: box.top, left: box.left, width: box.width, height: box.height }}
      aria-hidden={mode === 'hidden'}
    >
      <MediaPlayer media={media} />
      {mode === 'fullscreen' && ticketBadge}
    </div>
  );
}
