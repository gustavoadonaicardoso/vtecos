/**
 * Mídia do Painel de Senhas: tipos e regras compartilhados entre a
 * recepção (configuração), as rotas e o /display.
 */

export type DisplayMediaMode = 'fullscreen' | 'minimized' | 'hidden';

export interface DisplayPhase {
  mode: DisplayMediaMode;
  seconds: number;
}

export interface DisplayConfig {
  enabled: boolean;
  /** Rotina que se repete: ex. tela inteira 45s → minimizada 90s → oculta 30s. */
  cycle: DisplayPhase[];
  /** Quando uma senha é chamada, a mídia some por este tempo para a senha aparecer. */
  callInterruptSeconds: number;
}

export interface DisplayMediaItem {
  id: string;
  type: 'image' | 'video';
  url: string;
  title: string;
  duration_seconds: number;
  position: number;
  active: boolean;
}

export const MODE_LABELS: Record<DisplayMediaMode, string> = {
  fullscreen: 'Tela inteira',
  minimized: 'Minimizada',
  hidden: 'Oculta',
};

export const DEFAULT_DISPLAY_CONFIG: DisplayConfig = {
  enabled: false,
  cycle: [
    { mode: 'fullscreen', seconds: 45 },
    { mode: 'minimized', seconds: 90 },
    { mode: 'hidden', seconds: 30 },
  ],
  callInterruptSeconds: 15,
};

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
export const VIDEO_TYPES = ['video/mp4', 'video/webm'];
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

const clamp = (value: unknown, min: number, max: number, fallback: number) => {
  const number = Math.round(Number(value));
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
};

export function normalizeDisplayConfig(raw: unknown): DisplayConfig {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Partial<DisplayConfig>;
  const cycle = Array.isArray(value.cycle)
    ? value.cycle
        .filter((phase): phase is DisplayPhase => Boolean(phase) && ['fullscreen', 'minimized', 'hidden'].includes((phase as DisplayPhase).mode))
        .slice(0, 12)
        .map((phase) => ({ mode: phase.mode, seconds: clamp(phase.seconds, 5, 3600, 30) }))
    : [];
  return {
    enabled: typeof value.enabled === 'boolean' ? value.enabled : DEFAULT_DISPLAY_CONFIG.enabled,
    cycle: cycle.length > 0 ? cycle : DEFAULT_DISPLAY_CONFIG.cycle,
    callInterruptSeconds: clamp(value.callInterruptSeconds, 0, 300, DEFAULT_DISPLAY_CONFIG.callInterruptSeconds),
  };
}
