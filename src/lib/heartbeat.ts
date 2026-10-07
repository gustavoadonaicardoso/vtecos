/**
 * Batimento dos agendadores que rodam dentro do servidor (Automações,
 * Disparos, Agendamento, Redes Sociais). Cada ciclo registra a hora; a
 * verificação de status (mesmo processo) acusa o agendador parado.
 * Mora em globalThis pelo mesmo motivo dos próprios agendadores.
 */

type Beat = { at: number; error: string | null };
const holder = globalThis as typeof globalThis & { __vtecHeartbeats?: Record<string, Beat> };
const beats = holder.__vtecHeartbeats ?? {};
holder.__vtecHeartbeats = beats;

export function beat(name: string, error?: unknown) {
  beats[name] = { at: Date.now(), error: error ? (error instanceof Error ? error.message : String(error)).slice(0, 300) : null };
}

export const lastBeat = (name: string): Beat | null => beats[name] ?? null;
