/**
 * Primeiros passos de uma empresa nova (checklist do Início e dicas dos
 * lembretes do teste grátis). Arquivo puro: usado no navegador e no servidor.
 */

export type OnboardingKey = 'whatsapp' | 'team' | 'leads' | 'pipeline' | 'quick_replies';

export interface OnboardingStepInfo {
  key: OnboardingKey;
  title: string;
  description: string;
  href: string;
  cta: string;
  /** Frase curta para a mensagem de WhatsApp ("o próximo passo é ..."). */
  tip: string;
  /** Módulo do plano que o passo precisa (sem módulo: vale para todos). */
  module?: string;
}

export const ONBOARDING_STEPS: OnboardingStepInfo[] = [
  {
    key: 'whatsapp',
    title: 'Conecte o WhatsApp',
    description: 'As conversas dos clientes chegam em Mensagens e a equipe responde pelo sistema.',
    href: '/integrations',
    cta: 'Conectar',
    tip: 'conectar o WhatsApp da empresa em Integrações (leva 1 minuto, é só ler o QR Code)',
    module: 'crm',
  },
  {
    key: 'team',
    title: 'Cadastre a equipe',
    description: 'Cada pessoa com o próprio acesso e só as telas que precisa.',
    href: '/users',
    cta: 'Adicionar pessoa',
    tip: 'cadastrar a sua equipe em Equipe, cada um com o próprio acesso',
  },
  {
    key: 'leads',
    title: 'Traga os seus clientes',
    description: 'Importe uma planilha ou crie os primeiros leads à mão.',
    href: '/leads',
    cta: 'Ir para Leads',
    tip: 'importar a sua planilha de clientes em Leads (ou criar os primeiros à mão)',
    module: 'crm',
  },
  {
    key: 'pipeline',
    title: 'Monte o seu funil',
    description: 'Ajuste as etapas do jeito que você vende e mova um lead de etapa.',
    href: '/pipeline',
    cta: 'Abrir o Pipeline',
    tip: 'ajustar as etapas do funil no Pipeline e arrastar um lead de etapa',
    module: 'crm',
  },
  {
    key: 'quick_replies',
    title: 'Crie uma resposta rápida',
    description: 'Mensagens prontas que a equipe usa digitando "/" na conversa.',
    href: '/messages/respostas-rapidas',
    cta: 'Criar resposta',
    tip: 'criar as suas respostas rápidas em Mensagens: depois é só digitar "/" na conversa',
    module: 'crm',
  },
];

export interface OnboardingStep extends OnboardingStepInfo {
  done: boolean;
}

export interface OnboardingView {
  steps: OnboardingStep[];
  done: number;
  total: number;
  allDone: boolean;
}

/** Passos que valem para os módulos do plano. */
export function stepsForModules(modules: string[] | null | undefined): OnboardingStepInfo[] {
  return ONBOARDING_STEPS.filter((step) => !step.module || !modules || modules.includes(step.module));
}
