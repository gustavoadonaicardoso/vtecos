import type { ContactStatus } from '@/lib/dialer/types';

export async function request<T>(url: string, init?: RequestInit): Promise<{ data?: T; error?: string }> {
  try {
    const response = await fetch(url, { cache: 'no-store', ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } });
    const json = await response.json().catch(() => ({}));
    return response.ok ? { data: json.data as T } : { error: json.error || 'Não foi possível concluir.' };
  } catch {
    return { error: 'Sem conexão com o servidor.' };
  }
}

/** 75 → "1:15". */
export const clock = (seconds: number | null | undefined) => {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = String(total % 60).padStart(2, '0');
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
};

/** Cor de cada situação na barra de progresso. */
export const STATUS_COLOR: Record<ContactStatus, string> = {
  completed: '#10b981',
  connected: '#14b8a6',
  dialing: '#2dd4bf',
  no_answer: '#f59e0b',
  busy: '#fb923c',
  voicemail: '#a78bfa',
  abandoned: '#ef4444',
  failed: '#f43f5e',
  pending: 'transparent',
};
