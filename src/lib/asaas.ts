/**
 * ============================================================
 * VTEC OS — API do Asaas (cobrança das empresas clientes)
 * ============================================================
 * A Vórtice cobra os clientes pela conta dela no Asaas. A chave e o
 * ambiente ficam no Painel Master > Plataforma (ou ASAAS_API_KEY /
 * ASAAS_ENV no .env). Teste (sandbox) e produção têm endereços e chaves
 * separados: chave de um com o endereço do outro dá erro de autenticação.
 * Server-only.
 * ============================================================
 */

import { platformSettings } from '@/lib/platform-settings';

const BASE_URL = {
  sandbox: 'https://api-sandbox.asaas.com/v3',
  production: 'https://api.asaas.com/v3',
} as const;

export class AsaasError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** Já dá para cobrar? (chave do Asaas configurada) */
export async function asaasReady() {
  const settings = await platformSettings();
  return Boolean(settings.asaasApiKey);
}

type Query = Record<string, string | number | undefined>;

async function request<T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, options: { body?: unknown; query?: Query } = {}): Promise<T> {
  const settings = await platformSettings();
  if (!settings.asaasApiKey) throw new AsaasError('A cobrança pelo Asaas não está configurada (Painel Master > Plataforma).', 400);
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(options.query || {})) if (value !== undefined && value !== '') params.set(key, String(value));
  const url = `${BASE_URL[settings.asaasEnv]}${path}${params.size ? `?${params}` : ''}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        access_token: settings.asaasApiKey,
        'Content-Type': 'application/json',
        'User-Agent': 'vtec-os',
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(15_000),
      cache: 'no-store',
    });
  } catch {
    throw new AsaasError('Não foi possível falar com o Asaas agora.', 503);
  }
  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const errors = Array.isArray(json.errors) ? (json.errors as { description?: string; code?: string }[]) : [];
    const detail = errors.map((item) => item.description || item.code).filter(Boolean).join(' ');
    if (response.status === 401) throw new AsaasError('O Asaas recusou a chave. Confira a chave e o ambiente (teste ou produção) no Painel Master > Plataforma.', 401);
    throw new AsaasError(detail || `O Asaas respondeu ${response.status}.`, response.status);
  }
  return json as T;
}

// ── Tipos usados aqui (só os campos que o sistema lê) ─────────

export type AsaasCycle = 'MONTHLY' | 'YEARLY';

export interface AsaasCustomer {
  id: string;
  name: string;
  email?: string | null;
  cpfCnpj?: string | null;
}

export interface AsaasSubscription {
  id: string;
  customer: string;
  value: number;
  cycle: AsaasCycle;
  nextDueDate: string;
  status: string;
  externalReference?: string | null;
}

export type AsaasPaymentStatus =
  | 'PENDING'
  | 'RECEIVED'
  | 'CONFIRMED'
  | 'OVERDUE'
  | 'REFUNDED'
  | 'RECEIVED_IN_CASH'
  | 'REFUND_REQUESTED'
  | 'REFUND_IN_PROGRESS'
  | 'CHARGEBACK_REQUESTED'
  | 'CHARGEBACK_DISPUTE'
  | 'AWAITING_CHARGEBACK_REVERSAL'
  | 'DUNNING_REQUESTED'
  | 'DUNNING_RECEIVED'
  | 'AWAITING_RISK_ANALYSIS'
  | string;

export interface AsaasPayment {
  id: string;
  customer: string;
  subscription?: string | null;
  value: number;
  status: AsaasPaymentStatus;
  dueDate: string;
  paymentDate?: string | null;
  invoiceUrl?: string | null;
  billingType?: string;
  externalReference?: string | null;
  deleted?: boolean;
}

interface List<T> {
  data: T[];
  hasMore: boolean;
  totalCount: number;
}

/** Pago (o dinheiro entrou ou o cartão foi aprovado). */
export const PAID_STATUSES = ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH', 'DUNNING_RECEIVED'];
/** Em aberto: ainda precisa pagar. */
export const OPEN_STATUSES = ['PENDING', 'OVERDUE', 'AWAITING_RISK_ANALYSIS'];

// ── Chamadas ─────────────────────────────────────────────────

export const asaas = {
  /** Conferir a chave sem mexer em nada. */
  ping: () => request<List<AsaasCustomer>>('GET', '/customers', { query: { limit: 1 } }),

  createCustomer: (input: { name: string; cpfCnpj: string; email?: string | null; mobilePhone?: string | null; externalReference: string }) =>
    request<AsaasCustomer>('POST', '/customers', { body: input }),

  updateCustomer: (id: string, input: { name?: string; cpfCnpj?: string; email?: string | null; mobilePhone?: string | null }) =>
    request<AsaasCustomer>('PUT', `/customers/${encodeURIComponent(id)}`, { body: input }),

  /** billingType UNDEFINED: o cliente escolhe Pix, boleto ou cartão na fatura. */
  createSubscription: (input: { customer: string; value: number; nextDueDate: string; cycle: AsaasCycle; description: string; externalReference: string }) =>
    request<AsaasSubscription>('POST', '/subscriptions', { body: { billingType: 'UNDEFINED', ...input } }),

  /** updatePendingPayments: a fatura em aberto também muda de valor. */
  updateSubscription: (id: string, input: { value?: number; cycle?: AsaasCycle; description?: string; nextDueDate?: string }) =>
    request<AsaasSubscription>('PUT', `/subscriptions/${encodeURIComponent(id)}`, { body: { ...input, updatePendingPayments: true } }),

  deleteSubscription: (id: string) => request<{ deleted: boolean }>('DELETE', `/subscriptions/${encodeURIComponent(id)}`),

  /** Muda o vencimento de uma cobrança em aberto. */
  updatePaymentDueDate: (id: string, dueDate: string) =>
    request<AsaasPayment>('PUT', `/payments/${encodeURIComponent(id)}`, { body: { dueDate } }),

  subscriptionPayments: (id: string, query: { status?: string; limit?: number } = {}) =>
    request<List<AsaasPayment>>('GET', `/subscriptions/${encodeURIComponent(id)}/payments`, { query: { limit: 20, ...query } }),
};
