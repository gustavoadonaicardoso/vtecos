/**
 * Tipo de arquivo para guardar em bucket público. Tipos que o navegador
 * executa (HTML, SVG, XML, JavaScript) viram download comum: quem abrir o
 * link baixa o arquivo em vez de rodar um script.
 */
const ACTIVE_TYPES = /^(text\/html|application\/xhtml\+xml|image\/svg\+xml|text\/xml|application\/xml|text\/(x-)?javascript|application\/(x-)?javascript|text\/ecmascript|application\/ecmascript)\b/i;

export function safeContentType(type?: string | null): string {
  const value = (type || '').trim().toLowerCase();
  if (!value || ACTIVE_TYPES.test(value)) return 'application/octet-stream';
  return value;
}
