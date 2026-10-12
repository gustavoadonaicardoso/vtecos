/**
 * HTML dos e-mails recebidos, limpo antes de gravar (server-only).
 * Tira scripts, formulários, iframes e eventos (onclick...). A tela ainda
 * mostra o resultado num iframe isolado (sandbox, sem scripts), com as
 * imagens de fora bloqueadas até a pessoa pedir -- duas camadas.
 */

import sanitizeHtml from 'sanitize-html';

const TAGS = [
  'a', 'abbr', 'address', 'b', 'big', 'blockquote', 'br', 'caption', 'center', 'cite', 'code', 'col', 'colgroup',
  'dd', 'del', 'div', 'dl', 'dt', 'em', 'font', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img', 'ins', 'kbd',
  'li', 'mark', 'ol', 'p', 'pre', 'q', 's', 'small', 'span', 'strike', 'strong', 'sub', 'sup', 'table', 'tbody',
  'td', 'tfoot', 'th', 'thead', 'tr', 'tt', 'u', 'ul', 'style',
];

export function sanitizeEmailHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: TAGS,
    allowedAttributes: {
      '*': ['style', 'align', 'valign', 'width', 'height', 'bgcolor', 'color', 'dir', 'title', 'class'],
      a: ['href', 'name', 'target', 'rel'],
      img: ['src', 'alt', 'width', 'height', 'style'],
      font: ['face', 'size', 'color'],
      table: ['border', 'cellpadding', 'cellspacing', 'width', 'bgcolor', 'style', 'align'],
      td: ['colspan', 'rowspan', 'width', 'height', 'bgcolor', 'style', 'align', 'valign'],
      th: ['colspan', 'rowspan', 'width', 'height', 'bgcolor', 'style', 'align', 'valign'],
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedSchemesByTag: { img: ['http', 'https', 'data', 'cid'] },
    allowVulnerableTags: true, // <style> do próprio e-mail: fica preso no iframe isolado
    transformTags: {
      // Links sempre abrem fora, sem passar quem abriu.
      a: (tagName, attribs) => ({ tagName, attribs: { ...attribs, target: '_blank', rel: 'noopener noreferrer' } }),
    },
  });
}
