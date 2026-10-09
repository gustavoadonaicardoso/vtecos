/**
 * Impressões digitais (articleHash) de todas as versões já publicadas
 * do conteúdo padrão da Central de Ajuda, por artigo. Um artigo no banco
 * com uma destas impressões nunca foi editado à mão: pode receber o
 * texto novo sozinho. Gerado a partir do histórico do git de
 * src/lib/help/defaults.ts -- ao mudar um artigo padrão, acrescente aqui
 * a impressão da versão anterior (a que está no ar).
 */
export const DEFAULT_ARTICLE_HISTORY: Record<string, string[]> = {
  'automacoes': ['01eac17b35babcdb', '24c8afd9dbdb083d', '35ab6dfd40617093', 'a7024cbeb5bdc340', 'd4103bcee3e62dfa'],
  'chamados-suporte': ['00ede920232aee66'],
  'conectar-redes-sociais': ['04a9c410840e7805', '32ec6f383fe5ef22'],
  'configuracoes-da-conta': ['ed278d8ca98ea088'],
  'custos-e-precificacao': ['002a9fea5fcc9fbc', '9838f47a1686045e'],
  'discador': ['716fb1ac28bdd0c9'],
  'disparos': ['674c4741e23550fb', 'caa0ff85c901e227'],
  'equipe-e-permissoes': ['4faa066eec057aa4', 'd5a11671f5482616', 'df7c96c8033999fe'],
  'gestao-de-leads': ['835aead334f91cf8', '8ca85b8407094581', 'f775719117699453'],
  'integracao-captura-leads': ['9362f55de09bce0f', 'e271e2f397918dab'],
  'integracao-google-sheets': ['73f562f996e99a1f'],
  'integracao-ia': ['4ba3ba97744862ca'],
  'integracao-twilio': ['73d70647b548fcc1', 'c0cd9f7c339d0fb1'],
  'integracao-webhooks': ['de10e7b7872b3904'],
  'integracao-whatsapp-api': ['4efef91340c7e641', '6d2dd9786756a6c7'],
  'integracao-whatsapp-web': ['901ac67603392908'],
  'mensagens-whatsapp': ['0e5d16bfdf5a6861', '6f00341294ad56d9'],
  'metas-relatorios-projetos': ['84d9d00d2e1c1ffa', 'c83d409445af7e2d', 'dc1828556a9b14db'],
  'primeiros-passos': ['7ff6b28a6ab50f36', 'bceafc1631a6a03d'],
  'seguranca-e-conta': ['0eb21e75c078bfd4'],
  'senhas-totem-tv': ['06a2054509c3e09a', '735a25b4e8956afd'],
};
