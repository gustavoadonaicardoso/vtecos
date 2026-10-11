/**
 * Textos da cobrança (Painel Master, Configurações > Plano e a faixa de
 * aviso). Arquivo puro: usado no navegador.
 */

export type BillingStatus = 'manual' | 'trial' | 'active' | 'past_due' | 'suspended' | 'canceled';

export interface BillingSummaryView {
  status: BillingStatus;
  automatic: boolean;
  cycle: 'MONTHLY' | 'YEARLY';
  planName: string | null;
  value: number | null;
  trialEndsAt: string | null;
  trialDaysLeft: number | null;
  nextDue: string | null;
  invoiceUrl: string | null;
  overdueSince: string | null;
  suspendOn: string | null;
  suspendedAt: string | null;
  lastPaidAt: string | null;
  graceUntil: string | null;
}

export interface InvoiceView {
  id: string;
  value: number;
  dueDate: string;
  status: string;
  paidAt: string | null;
  invoiceUrl: string | null;
}

export const BILLING_STATUS_LABEL: Record<BillingStatus, string> = {
  manual: 'Cobrança manual',
  trial: 'Teste grátis',
  active: 'Em dia',
  past_due: 'Em atraso',
  suspended: 'Suspensa por falta de pagamento',
  canceled: 'Assinatura cancelada',
};

/** Tom do selo: ok (verde), warn (amarelo), bad (vermelho), info (azul), muted. */
export const BILLING_TONE: Record<BillingStatus, 'ok' | 'warn' | 'bad' | 'info' | 'muted'> = {
  manual: 'muted',
  trial: 'info',
  active: 'ok',
  past_due: 'warn',
  suspended: 'bad',
  canceled: 'muted',
};

export const INVOICE_STATUS_LABEL: Record<string, string> = {
  PENDING: 'Em aberto',
  OVERDUE: 'Vencida',
  RECEIVED: 'Paga',
  CONFIRMED: 'Paga (cartão)',
  RECEIVED_IN_CASH: 'Paga (dinheiro)',
  REFUNDED: 'Estornada',
  REFUND_REQUESTED: 'Estorno pedido',
  REFUND_IN_PROGRESS: 'Estornando',
  CHARGEBACK_REQUESTED: 'Contestada',
  CHARGEBACK_DISPUTE: 'Em disputa',
  AWAITING_CHARGEBACK_REVERSAL: 'Contestação em análise',
  DUNNING_REQUESTED: 'Em negativação',
  DUNNING_RECEIVED: 'Paga (negativação)',
  AWAITING_RISK_ANALYSIS: 'Em análise',
};

export const isPaidInvoice = (status: string) => ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH', 'DUNNING_RECEIVED'].includes(status);

/** AAAA-MM-DD ou ISO → dd/mm/aaaa */
export function brDate(value: string | null | undefined) {
  if (!value) return '';
  const day = value.slice(0, 10);
  return `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;
}

export const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const cycleText = (cycle: string) => (cycle === 'YEARLY' ? 'anual' : 'mensal');

/** Uma frase sobre a situação, para o cliente. */
export function billingSentence(summary: BillingSummaryView): string {
  switch (summary.status) {
    case 'trial':
      return summary.trialDaysLeft === 0
        ? `Seu teste grátis acaba hoje. Pague a primeira fatura para continuar usando sem interrupção.`
        : `Seu teste grátis acaba em ${summary.trialDaysLeft} dia${summary.trialDaysLeft === 1 ? '' : 's'}${summary.trialEndsAt ? ` (${brDate(summary.trialEndsAt)})` : ''}. Pague a primeira fatura para continuar usando sem interrupção.`;
    case 'past_due':
      return `A fatura venceu em ${brDate(summary.overdueSince)}. Pague até ${brDate(summary.suspendOn ? addDaysIso(summary.suspendOn, -1) : null)} para o acesso não ser suspenso.`;
    case 'suspended':
      return 'O acesso foi suspenso por falta de pagamento. Pague a fatura em aberto para liberar na hora.';
    case 'active':
      return summary.nextDue ? `Próxima fatura vence em ${brDate(summary.nextDue)}.` : 'Pagamentos em dia.';
    case 'canceled':
      return 'A assinatura foi cancelada. Fale com a Vórtice para voltar a usar.';
    default:
      return 'A cobrança da sua empresa é feita diretamente com a Vórtice.';
  }
}

function addDaysIso(date: string, days: number) {
  const base = new Date(`${date.slice(0, 10)}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}
