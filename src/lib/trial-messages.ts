/**
 * Mensagens de WhatsApp do teste grátis (textos padrão, variáveis e
 * montagem). Arquivo puro: usado no Painel Master e no servidor.
 */

export type TrialMessageKey = 'welcome' | 'day3' | 'day5' | 'day6' | 'paid';

export const TRIAL_MESSAGE_ORDER: TrialMessageKey[] = ['welcome', 'day3', 'day5', 'day6', 'paid'];

export const TRIAL_MESSAGE_INFO: Record<TrialMessageKey, { label: string; when: string }> = {
  welcome: { label: 'Boas-vindas', when: 'logo depois do cadastro (1º dia)' },
  day3: { label: 'Dica do 3º dia', when: 'quando faltam 5 dias para o fim do teste' },
  day5: { label: 'Lembrete do 5º dia', when: 'quando faltam 3 dias' },
  day6: { label: 'Fatura (6º dia)', when: 'quando faltam 2 dias, com o link da fatura' },
  paid: { label: 'Pagamento confirmado', when: 'quando a primeira fatura é paga' },
};

export const TRIAL_MESSAGE_DEFAULTS: Record<TrialMessageKey, string> = {
  welcome:
    'Olá, {nome}! 👋 Aqui é da Vórtice Tecnologia. Boas-vindas ao vtec os!\n\nO teste grátis da *{empresa}* no plano {plano} já está liberado até {fim}.\n\nPara começar com o pé direito, o primeiro passo é {proximo_passo}.\n\nAcesse: {link}\nQualquer dúvida, é só responder esta mensagem. 😉',
  day3:
    'Oi, {nome}! Tudo certo por aí? 😊\n\nPassando para lembrar que vale a pena {proximo_passo}. É isso que faz o sistema começar a trabalhar por você.\n\nSe quiser, a gente faz junto com você numa chamada rápida. É só responder aqui.',
  day5:
    '{nome}, faltam {dias} dias para o fim do teste da *{empresa}* ({fim}).\n\nAinda dá tempo de {proximo_passo}. Precisa de ajuda com alguma coisa? Responda esta mensagem que a gente te ajuda.',
  day6:
    '{nome}, o teste grátis da *{empresa}* termina em {fim}.\n\nPara continuar usando o vtec os sem interrupção, é só pagar a primeira fatura ({valor}, {ciclo}) por Pix, boleto ou cartão:\n{fatura}\n\nSe preferir outro plano ou tiver alguma dúvida, é só responder aqui. 🙏',
  paid:
    'Pagamento confirmado! 🎉 Obrigado, {nome}. O plano {plano} da *{empresa}* segue liberado.\n\nConte com a gente: qualquer dúvida, é só chamar aqui.',
};

export const TRIAL_MESSAGE_VARIABLES: { key: string; label: string; sample: string }[] = [
  { key: 'nome', label: 'Primeiro nome', sample: 'Ana' },
  { key: 'empresa', label: 'Empresa', sample: 'Doces da Ana' },
  { key: 'plano', label: 'Plano', sample: 'Essencial' },
  { key: 'valor', label: 'Valor da fatura', sample: 'R$ 59,00' },
  { key: 'ciclo', label: 'Mensal ou anual', sample: 'mensal' },
  { key: 'fim', label: 'Fim do teste', sample: '18/10/2026' },
  { key: 'dias', label: 'Dias que faltam', sample: '3' },
  { key: 'fatura', label: 'Link da fatura', sample: 'https://www.asaas.com/i/abc123' },
  { key: 'proximo_passo', label: 'Próximo passo que falta', sample: 'conectar o WhatsApp da empresa em Integrações (leva 1 minuto, é só ler o QR Code)' },
  { key: 'link', label: 'Endereço do sistema', sample: 'https://app.vorticetecnologia.com.br' },
];

export const TRIAL_MESSAGE_MAX = 1500;

/** Troca {variavel} pelo valor. Variável desconhecida fica como está. */
export function renderTrialMessage(template: string, vars: Record<string, string>) {
  return template.replace(/\{([a-z_]+)\}/g, (match, key: string) => (key in vars ? vars[key] : match)).trim();
}

export const sampleVars = () => Object.fromEntries(TRIAL_MESSAGE_VARIABLES.map((item) => [item.key, item.sample]));

/**
 * Qual mensagem do teste é a da vez, pelos dias que faltam. Devolve a
 * mais recente que já venceu (as anteriores não enviadas são puladas,
 * para não mandar várias de uma vez).
 */
export function dueTrialStep(daysLeft: number, sent: Partial<Record<TrialMessageKey, unknown>>): { send: TrialMessageKey | null; skip: TrialMessageKey[] } {
  if (daysLeft < 0) return { send: null, skip: [] };
  const due: TrialMessageKey[] = ['welcome'];
  if (daysLeft <= 5) due.push('day3');
  if (daysLeft <= 3) due.push('day5');
  if (daysLeft <= 2) due.push('day6');
  const pending = due.filter((key) => !sent[key]);
  if (!pending.length) return { send: null, skip: [] };
  return { send: pending[pending.length - 1], skip: pending.slice(0, -1) };
}
