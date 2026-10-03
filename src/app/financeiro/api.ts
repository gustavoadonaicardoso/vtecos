/** Chamadas do módulo Custos & Precificação (navegador). */

/** Equipe Vórtice escolhe a empresa pelo ?tenant=; login de cliente não precisa. */
export function finUrl(path: string, tenantId: string | null, query: Record<string, string> = {}) {
  const params = new URLSearchParams(query);
  if (tenantId) params.set('tenant', tenantId);
  const search = params.toString();
  return `/api/financeiro${path}${search ? `?${search}` : ''}`;
}

export async function finRequest<T>(
  path: string,
  tenantId: string | null,
  init: { method?: string; body?: unknown; query?: Record<string, string> } = {}
): Promise<T> {
  const response = await fetch(finUrl(path, tenantId, init.query), {
    method: init.method || 'GET',
    headers: init.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: 'no-store',
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error || 'Não foi possível concluir.');
  return (json.errors ? { ...json } : json.data) as T;
}

/** Aceita "12,5", "1.234,56", "R$ 10" e números. */
export function toNum(value: string | number | null | undefined, fallback = 0) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  if (!value) return fallback;
  const clean = value.replace(/\s/g, '').replace(/^R\$/i, '').replace(/%$/, '');
  const normalized = clean.includes(',') ? clean.replace(/\./g, '').replace(',', '.') : clean;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Número para campo de texto em pt-BR ("12,5"). */
export function numText(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '';
  return String(Math.round(value * 10000) / 10000).replace('.', ',');
}

export function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function monthLabel(month: string) {
  const [year, monthNumber] = month.split('-').map(Number);
  const label = new Date(year, monthNumber - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function shiftMonth(month: string, delta: number) {
  const [year, monthNumber] = month.split('-').map(Number);
  const date = new Date(year, monthNumber - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}
