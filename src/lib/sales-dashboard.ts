/** Painel Master > Vendas: formato dos números (arquivo puro, usado na tela e no servidor). */

export interface SalesDashboard {
  generatedAt: string;
  mrr: { automatic: number; manual: number; total: number; arr: number; paying: number; avgTicket: number | null };
  trials: {
    active: number;
    endingSoon: number;
    list: { id: string; name: string; plan: string | null; endsOn: string; daysLeft: number; onboardingDone: number | null; onboardingTotal: number | null }[];
  };
  conversion: { windowDays: number; ended: number; converted: number; rate: number | null };
  overdue: {
    pastDue: { count: number; value: number };
    suspended: { count: number; value: number };
    list: { id: string; name: string; status: 'past_due' | 'suspended'; since: string | null; value: number; invoiceUrl: string | null }[];
  };
  canceled: { count: number; list: { id: string; name: string; plan: string | null }[] };
  months: { month: string; label: string; received: number; trialsStarted: number; trialsConverted: number }[];
  receivedThisMonth: number;
  recentPayments: { tenantId: string | null; tenantName: string; value: number; paidAt: string; billingType: string | null }[];
  byPlan: { plan: string; customers: number; mrr: number }[];
}

export const BILLING_TYPE_LABEL: Record<string, string> = {
  PIX: 'Pix',
  BOLETO: 'Boleto',
  CREDIT_CARD: 'Cartão',
  DEBIT_CARD: 'Débito',
  UNDEFINED: '—',
};
