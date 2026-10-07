/**
 * Versão da Graph API da Meta usada em todo o sistema (WhatsApp oficial,
 * Redes Sociais, cadastro incorporado, modelos de Disparos). Cada versão
 * vale cerca de 2 anos; para trocar, basta META_GRAPH_VERSION no .env.local.
 */
export const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v23.0';

export const META_GRAPH_URL = `https://graph.facebook.com/${META_GRAPH_VERSION}`;
