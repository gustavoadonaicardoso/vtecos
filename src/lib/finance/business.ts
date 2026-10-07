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

export type BusinessType = 'alimentacao' | 'restaurante' | 'varejo' | 'servicos' | 'industria' | 'outro';

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

export interface BusinessPreset {
  type: BusinessType;
  label: string;
  description: string;
  terms: Terms;
  categories: IngredientCategoryDef[];
  /** Exemplos usados nos campos (placeholder) e na ajuda da tela. */
  examples: { ingredient: string; ingredientUnit: string; product: string; base: string; yieldUnit: string };
}

const cat = (key: string, label: string, group: CategoryGroup): IngredientCategoryDef => ({ key, label, group });

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
export const GROUP_LABEL: Record<CategoryGroup, string> = { material: 'Entra como material', packaging: 'Entra como embalagem', other: 'Entra como outros custos' };

export const presetFor = (type: BusinessType | null | undefined) => BUSINESS_PRESETS.find((preset) => preset.type === type) || BUSINESS_PRESETS[0];
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
