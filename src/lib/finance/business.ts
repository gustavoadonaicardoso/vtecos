/**
 * ============================================================
 * Custos & Precificação — ramo do negócio (navegador e servidor)
 * ============================================================
 * Cada empresa escolhe o ramo: isso define os nomes que aparecem nas
 * telas (ex.: "Composição do serviço" em vez de "Ficha técnica"), os
 * tipos de insumo e os exemplos. Depois dá para renomear qualquer termo
 * e criar os próprios tipos. Sem ramo escolhido vale o de alimentação
 * (era o único antes), então nada muda para quem já usava.
 * ============================================================
 */

import type { FinCurrency, FinFixedCost } from './types';

export type BusinessType = 'alimentacao' | 'restaurante' | 'varejo' | 'servicos' | 'software' | 'industria' | 'outro';

/** Como o tipo entra no custo da ficha: material, embalagem ou outros. */
export type CategoryGroup = 'material' | 'packaging' | 'other';

export interface IngredientCategoryDef {
  key: string;
  label: string;
  group: CategoryGroup;
}

export type TermKey = 'ingredients' | 'ingredient' | 'products' | 'product' | 'base' | 'bases' | 'composition' | 'yield' | 'prep';
export type Terms = Record<TermKey, string>;

/** O que cada termo significa (para a tela de personalizar). */
export const TERM_INFO: { key: TermKey; label: string; hint: string }[] = [
  { key: 'ingredients', label: 'O que você compra (plural)', hint: 'Nome da aba e da lista. Ex.: Insumos, Materiais, Mercadorias.' },
  { key: 'ingredient', label: 'O que você compra (singular)', hint: 'Ex.: insumo, material, mercadoria.' },
  { key: 'products', label: 'O que você vende (plural)', hint: 'Nome da aba. Ex.: Fichas técnicas, Serviços, Produtos.' },
  { key: 'product', label: 'O que você vende (singular)', hint: 'Ex.: ficha técnica, serviço, produto.' },
  { key: 'base', label: 'Parte pronta usada em outros (singular)', hint: 'Algo que você monta uma vez e usa dentro de vários itens. Ex.: preparo base, kit, componente.' },
  { key: 'bases', label: 'Parte pronta usada em outros (plural)', hint: 'Ex.: preparos base, kits, componentes.' },
  { key: 'composition', label: 'Lista do que vai em cada item', hint: 'Ex.: Receita, Materiais usados, Composição.' },
  { key: 'yield', label: 'Quanto cada item rende', hint: 'Ex.: Rendimento, Atendimentos, Lote produzido.' },
  { key: 'prep', label: 'Tempo de trabalho', hint: 'Ex.: Tempo de preparo, Duração do atendimento, Tempo de produção.' },
];

/** Textos das telas que mudam com o ramo (fora os termos editáveis). */
export interface PresetLabels {
  /** Nome de cada linha do custo no detalhe do item. */
  groups: Record<CategoryGroup, string>;
  loss: string;
  lossHint: string;
  labor: string;
  laborSetting: string;
  laborHint: string;
  notes: string;
  channels: string;
  channel: string;
  channelsHint: string;
  channelExample: string;
  /** "Custo dos produtos" no resultado do mês. */
  cogs: string;
  sales: string;
  revenue: string;
  /** "faturamento esperado" / "receita esperada" (rateio das despesas fixas). */
  expectedRevenue: string;
  fixedHint: string;
  fixedExample: string;
}

/** Despesa típica do ramo, para cadastrar com um clique (o valor fica com a pessoa). */
export interface CostSuggestion {
  name: string;
  category: string;
  currency: FinCurrency;
  recurrence: FinFixedCost['recurrence'];
  hint: string;
}

export interface BusinessPreset {
  type: BusinessType;
  label: string;
  description: string;
  terms: Terms;
  categories: IngredientCategoryDef[];
  /** Exemplos usados nos campos (placeholder) e na ajuda da tela. */
  examples: { ingredient: string; ingredientUnit: string; product: string; base: string; yieldUnit: string };
  labels?: Partial<PresetLabels>;
  costCategories?: string[];
  costSuggestions?: CostSuggestion[];
  /** Canais no lugar dos padrões, quando a empresa ainda não mexeu neles. */
  channels?: { name: string; fee_pct: number; fixed_fee: number; extra_cost: number }[];
  /** Unidades a mais no "rende" do item. */
  yieldUnits?: string[];
}

const cat = (key: string, label: string, group: CategoryGroup): IngredientCategoryDef => ({ key, label, group });

export const DEFAULT_LABELS: PresetLabels = {
  groups: { material: '', packaging: 'Embalagens', other: 'Outros custos' },
  loss: 'Perda / quebra',
  lossHint: 'O que se perde no preparo ou na produção.',
  labor: 'Mão de obra',
  laborSetting: 'Custo da hora de trabalho',
  laborHint: 'Salários (+ encargos) ÷ horas trabalhadas no mês.',
  notes: 'Observações e modo de fazer',
  channels: 'Canais de venda',
  channel: 'Canal',
  channelsHint: 'Cada canal cobra diferente: maquininha, comissão de marketplace ou aplicativo, frete ou embalagem extra na entrega. O primeiro canal da lista é o seu preço padrão.',
  channelExample: 'Rappi',
  cogs: 'Custo dos produtos',
  sales: 'Vendas',
  revenue: 'Faturamento',
  expectedRevenue: 'faturamento esperado',
  fixedHint: 'Fixas são as que chegam todo mês, vendendo ou não (aluguel, luz, salários, pró-labore). Anuais (IPTU, alvará, seguro) entram como 1/12 por mês. Avulsas entram só no mês em que aconteceram (conserto, compra de equipamento).',
  fixedExample: 'Aluguel da loja',
};

export const DEFAULT_COST_CATEGORIES = ['Aluguel', 'Energia', 'Água', 'Gás', 'Internet / telefone', 'Salários', 'Pró-labore', 'Contador', 'Impostos e taxas fixas', 'Marketing', 'Sistema / assinaturas', 'Manutenção', 'Equipamentos', 'Outros'];

const SOFTWARE_COST_CATEGORIES = [
  'Servidor e hospedagem',
  'Domínio e e-mail',
  'IA e ferramentas de desenvolvimento',
  'APIs e integrações',
  'Ferramentas e assinaturas',
  'Contador e impostos fixos',
  'Pró-labore',
  'Equipe e freelancers',
  'Marketing e vendas',
  'Equipamentos',
  'Internet / telefone',
  'Outros',
];

const tip = (name: string, category: string, currency: FinCurrency, recurrence: CostSuggestion['recurrence'], hint: string): CostSuggestion => ({ name, category, currency, recurrence, hint });

/** O que costuma ter quem cria e vende sistema sozinho ("vibe coder"). */
const SOFTWARE_SUGGESTIONS: CostSuggestion[] = [
  tip('VPS / servidor', 'Servidor e hospedagem', 'BRL', 'monthly', 'Onde o sistema roda (Hostinger, Contabo, DigitalOcean, Hetzner...). Se cobra em dólar, troque a moeda.'),
  tip('Supabase (banco de dados)', 'Servidor e hospedagem', 'USD', 'monthly', 'Plano + uso extra (banco, arquivos, banda). Veja a fatura do mês.'),
  tip('Hospedagem de testes (Vercel)', 'Servidor e hospedagem', 'USD', 'monthly', 'Só se usa plano pago para as prévias.'),
  tip('Backup e armazenamento extra', 'Servidor e hospedagem', 'USD', 'monthly', 'Cópias de segurança fora do servidor.'),
  tip('Domínio (.com.br)', 'Domínio e e-mail', 'BRL', 'yearly', 'Renovação anual no Registro.br: entra 1/12 por mês.'),
  tip('E-mail profissional', 'Domínio e e-mail', 'BRL', 'monthly', 'Google Workspace, Zoho, Hostinger...'),
  tip('Claude', 'IA e ferramentas de desenvolvimento', 'USD', 'monthly', 'Assinatura usada para programar.'),
  tip('ChatGPT', 'IA e ferramentas de desenvolvimento', 'USD', 'monthly', 'Assinatura usada para programar, textos e suporte.'),
  tip('Cursor / Copilot / editor com IA', 'IA e ferramentas de desenvolvimento', 'USD', 'monthly', 'Ferramenta de código com IA.'),
  tip('GitHub', 'IA e ferramentas de desenvolvimento', 'USD', 'monthly', 'Só se usa plano pago.'),
  tip('IA do sistema (Gemini/OpenAI) — base', 'APIs e integrações', 'USD', 'monthly', 'A parte da conta de IA que não dá para separar por cliente. O consumo de cada cliente vai em Recursos.'),
  tip('Twilio (número e mensalidade)', 'APIs e integrações', 'USD', 'monthly', 'Números de telefone da plataforma. Minutos por cliente vão em Recursos.'),
  tip('WhatsApp / Meta da própria empresa', 'APIs e integrações', 'BRL', 'monthly', 'Mensagens que você mesmo dispara (vendas, avisos).'),
  tip('Contador', 'Contador e impostos fixos', 'BRL', 'monthly', 'Honorários mensais.'),
  tip('DAS do MEI / taxas fixas do CNPJ', 'Contador e impostos fixos', 'BRL', 'monthly', 'Se é MEI, o imposto é fixo: coloque aqui e deixe "Impostos sobre a venda" em 0%.'),
  tip('Certificado digital (e-CNPJ)', 'Contador e impostos fixos', 'BRL', 'yearly', 'Renovação anual.'),
  tip('Pró-labore (seu salário)', 'Pró-labore', 'BRL', 'monthly', 'Quanto você precisa tirar por mês. Sem isso o "lucro" é o seu salário disfarçado.'),
  tip('Freelancer / ajudante', 'Equipe e freelancers', 'BRL', 'monthly', 'Suporte, design, vendas.'),
  tip('Anúncios (Meta / Google)', 'Marketing e vendas', 'BRL', 'monthly', 'Verba mensal de anúncios.'),
  tip('Mensalidade do gateway de pagamento', 'Marketing e vendas', 'BRL', 'monthly', 'Se o Asaas/Stripe/Mercado Pago cobra mensalidade. As taxas por cobrança vão em "Formas de cobrança".'),
  tip('Canva / Notion / design', 'Ferramentas e assinaturas', 'USD', 'monthly', 'Ferramentas do dia a dia.'),
  tip('Conta Apple Developer', 'Ferramentas e assinaturas', 'USD', 'yearly', 'Só se publica app para iPhone.'),
  tip('Computador (reserva para trocar)', 'Equipamentos', 'BRL', 'monthly', 'Valor do computador ÷ meses de uso. Ex.: R$ 7.200 ÷ 36 = R$ 200.'),
  tip('Internet e celular', 'Internet / telefone', 'BRL', 'monthly', 'A parte usada para o trabalho.'),
];

export const BUSINESS_PRESETS: BusinessPreset[] = [
  {
    type: 'alimentacao',
    label: 'Alimentação e confeitaria',
    description: 'Doces, bolos, salgados, marmitas, padaria.',
    terms: { ingredients: 'Insumos', ingredient: 'insumo', products: 'Fichas técnicas', product: 'ficha técnica', base: 'preparo base', bases: 'preparos base', composition: 'Receita', yield: 'Rendimento', prep: 'Tempo de preparo' },
    categories: [cat('ingrediente', 'Ingrediente', 'material'), cat('embalagem', 'Embalagem', 'packaging'), cat('outro', 'Outro material', 'other')],
    examples: { ingredient: 'Farinha de trigo', ingredientUnit: 'kg', product: 'Bolo de chocolate', base: 'Massa de chocolate', yieldUnit: 'fatias' },
  },
  {
    type: 'restaurante',
    label: 'Restaurante, bar e lanchonete',
    description: 'Pratos, lanches, bebidas e delivery.',
    terms: { ingredients: 'Insumos', ingredient: 'insumo', products: 'Cardápio', product: 'prato', base: 'preparo base', bases: 'preparos base', composition: 'Ficha técnica', yield: 'Porções', prep: 'Tempo de preparo' },
    categories: [cat('ingrediente', 'Ingrediente', 'material'), cat('bebida', 'Bebida e revenda', 'material'), cat('embalagem', 'Embalagem e descartável', 'packaging'), cat('outro', 'Outro', 'other')],
    examples: { ingredient: 'Carne moída', ingredientUnit: 'kg', product: 'X-burguer', base: 'Molho da casa', yieldUnit: 'porções' },
  },
  {
    type: 'varejo',
    label: 'Loja e revenda',
    description: 'Compra e revende: roupas, presentes, cosméticos, eletrônicos.',
    terms: { ingredients: 'Mercadorias', ingredient: 'mercadoria', products: 'Produtos à venda', product: 'produto', base: 'kit', bases: 'kits', composition: 'Itens do produto', yield: 'Quantidade', prep: 'Tempo de montagem' },
    categories: [cat('mercadoria', 'Mercadoria para revenda', 'material'), cat('embalagem', 'Embalagem', 'packaging'), cat('outro', 'Frete e outros', 'other')],
    examples: { ingredient: 'Camiseta básica branca', ingredientUnit: 'un', product: 'Camiseta personalizada', base: 'Kit presente', yieldUnit: 'un' },
  },
  {
    type: 'servicos',
    label: 'Serviços',
    description: 'Salão, estética, clínica, oficina, limpeza, agência.',
    terms: { ingredients: 'Materiais', ingredient: 'material', products: 'Serviços', product: 'serviço', base: 'etapa', bases: 'etapas', composition: 'Materiais usados', yield: 'Atendimentos', prep: 'Duração do atendimento' },
    categories: [cat('produto', 'Produto de uso', 'material'), cat('descartavel', 'Descartável', 'packaging'), cat('equipamento', 'Desgaste de equipamento', 'other')],
    examples: { ingredient: 'Tintura profissional', ingredientUnit: 'ml', product: 'Coloração completa', base: 'Higienização', yieldUnit: 'atendimento' },
  },
  {
    type: 'software',
    label: 'Software, SaaS e sistemas',
    description: 'Vende assinatura de sistema, app ou plataforma (por mês, por cliente).',
    terms: { ingredients: 'Recursos', ingredient: 'recurso', products: 'Planos', product: 'plano', base: 'módulo', bases: 'módulos', composition: 'Custo de cada cliente', yield: 'Clientes atendidos', prep: 'Suporte por cliente no mês' },
    categories: [
      cat('infra', 'Servidor, banco e armazenamento', 'material'),
      cat('api', 'APIs por uso (WhatsApp, IA, SMS, ligações)', 'material'),
      cat('licenca', 'Licença ou ferramenta por usuário', 'packaging'),
      cat('outro', 'Outro custo por cliente', 'other'),
    ],
    examples: { ingredient: 'Mensagens de WhatsApp (Meta)', ingredientUnit: 'mil', product: 'Plano Profissional', base: 'Módulo de IA', yieldUnit: 'cliente' },
    labels: {
      groups: { material: 'Servidor e APIs', packaging: 'Licenças por usuário', other: 'Outros custos' },
      loss: 'Folga para picos de uso',
      lossHint: 'Margem de segurança para o cliente que usa mais que a média.',
      labor: 'Suporte e implantação',
      laborSetting: 'Quanto vale sua hora',
      laborHint: 'Pró-labore ÷ horas trabalhadas no mês. Multiplica pelos minutos de suporte que cada cliente pede por mês.',
      notes: 'Observações (o que o plano inclui, limites)',
      channels: 'Formas de cobrança',
      channel: 'Forma de cobrança',
      channelsHint: 'Quanto o gateway fica de cada mensalidade: Pix, boleto, cartão recorrente (Asaas, Stripe, Mercado Pago...). Confira a taxa do seu gateway. A primeira da lista é o preço padrão do plano.',
      channelExample: 'Cartão recorrente (Asaas)',
      cogs: 'Custo por cliente (servidor e APIs)',
      sales: 'Mensalidades',
      revenue: 'Receita do mês',
      expectedRevenue: 'receita esperada',
      fixedHint: 'Fixas são as que você paga mesmo sem cliente novo: VPS, domínio, Claude, ChatGPT, contador, pró-labore. Em dólar ou euro viram reais pela cotação + IOF. Anuais (domínio, certificado) entram como 1/12 por mês. O que cresce a cada cliente (mensagens, IA, ligações, espaço) vai em Recursos, dentro de cada plano.',
      fixedExample: 'VPS / servidor',
    },
    costCategories: SOFTWARE_COST_CATEGORIES,
    costSuggestions: SOFTWARE_SUGGESTIONS,
    channels: [
      { name: 'Pix direto na conta', fee_pct: 0, fixed_fee: 0, extra_cost: 0 },
      { name: 'Boleto / Pix pelo gateway', fee_pct: 0, fixed_fee: 1.99, extra_cost: 0 },
      { name: 'Cartão recorrente', fee_pct: 3.49, fixed_fee: 0.49, extra_cost: 0 },
    ],
    yieldUnits: ['cliente', 'usuário', 'licença', 'empresa'],
  },
  {
    type: 'industria',
    label: 'Indústria, artesanato e confecção',
    description: 'Fabrica peças: roupas, móveis, velas, cosméticos, impressão.',
    terms: { ingredients: 'Matérias-primas', ingredient: 'matéria-prima', products: 'Produtos', product: 'produto', base: 'componente', bases: 'componentes', composition: 'Composição', yield: 'Lote produzido', prep: 'Tempo de produção' },
    categories: [cat('materia_prima', 'Matéria-prima', 'material'), cat('aviamento', 'Aviamento e acessório', 'material'), cat('embalagem', 'Embalagem', 'packaging'), cat('outro', 'Outro', 'other')],
    examples: { ingredient: 'Tecido de algodão', ingredientUnit: 'm', product: 'Vestido midi', base: 'Forro pronto', yieldUnit: 'peças' },
  },
  {
    type: 'outro',
    label: 'Outro negócio',
    description: 'Monte do seu jeito: os nomes e tipos são todos editáveis.',
    terms: { ingredients: 'Insumos', ingredient: 'insumo', products: 'Produtos', product: 'produto', base: 'componente', bases: 'componentes', composition: 'Composição', yield: 'Quantidade produzida', prep: 'Tempo de produção' },
    categories: [cat('insumo', 'Insumo', 'material'), cat('embalagem', 'Embalagem', 'packaging'), cat('outro', 'Outro', 'other')],
    examples: { ingredient: 'Matéria-prima', ingredientUnit: 'un', product: 'Meu produto', base: 'Componente', yieldUnit: 'un' },
  },
];

export const DEFAULT_BUSINESS: BusinessType = 'alimentacao';

export const presetFor = (type: BusinessType | null | undefined) => BUSINESS_PRESETS.find((preset) => preset.type === type) || BUSINESS_PRESETS[0];

/** Textos do ramo; "material" sem nome usa o termo do que a empresa compra. */
export function labelsFor(business: Pick<FinBusiness, 'type' | 'terms'>): PresetLabels {
  const own = presetFor(business.type).labels || {};
  const groups = { ...DEFAULT_LABELS.groups, ...own.groups };
  return { ...DEFAULT_LABELS, ...own, groups: { ...groups, material: groups.material || business.terms.ingredients } };
}

export const costCategoriesFor = (type: BusinessType | null | undefined) => presetFor(type).costCategories || DEFAULT_COST_CATEGORIES;
export const isBusinessType = (value: unknown): value is BusinessType => BUSINESS_PRESETS.some((preset) => preset.type === value);

/** "Matéria-prima" → "materia_prima". */
export function categoryKey(label: string) {
  return label.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'tipo';
}

/** Primeira letra maiúscula (termos guardados em minúscula no meio da frase). */
export const capitalize = (text: string) => (text ? text.charAt(0).toUpperCase() + text.slice(1) : text);

export interface FinBusiness {
  /** null = ainda não escolheu (as telas usam alimentação e mostram a escolha). */
  type: BusinessType | null;
  /** Termos em uso (do ramo + os personalizados). */
  terms: Terms;
  /** Só o que a empresa renomeou. */
  customTerms: Partial<Terms>;
  categories: IngredientCategoryDef[];
}

/** Monta o perfil a partir do que está salvo (valores inválidos caem no padrão do ramo). */
export function resolveBusiness(row: { business_type?: unknown; terms?: unknown; ingredient_categories?: unknown } | null): FinBusiness {
  const type = isBusinessType(row?.business_type) ? row.business_type : null;
  const preset = presetFor(type);
  const customTerms: Partial<Terms> = {};
  const raw = row?.terms && typeof row.terms === 'object' ? (row.terms as Record<string, unknown>) : {};
  for (const info of TERM_INFO) {
    const value = typeof raw[info.key] === 'string' ? String(raw[info.key]).trim().slice(0, 40) : '';
    if (value) customTerms[info.key] = value;
  }
  const categories = Array.isArray(row?.ingredient_categories)
    ? (row.ingredient_categories as Record<string, unknown>[])
        .map((item) => ({ key: String(item?.key || ''), label: String(item?.label || '').trim().slice(0, 40), group: (['material', 'packaging', 'other'].includes(String(item?.group)) ? item.group : 'material') as CategoryGroup }))
        .filter((item) => /^[a-z0-9_-]{1,40}$/.test(item.key) && item.label)
    : [];
  return { type, terms: { ...preset.terms, ...customTerms }, customTerms, categories: categories.length ? categories : preset.categories };
}

/** Tipo de um insumo; tipos apagados ou antigos caem num rótulo legível. */
export function categoryInfo(business: Pick<FinBusiness, 'categories'>, key: string): IngredientCategoryDef {
  return business.categories.find((item) => item.key === key)
    || { key, label: key === 'embalagem' ? 'Embalagem' : key === 'outro' ? 'Outro' : capitalize(key.replace(/_/g, ' ')), group: key === 'embalagem' ? 'packaging' : key === 'outro' ? 'other' : 'material' };
}
