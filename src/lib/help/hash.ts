import { createHash } from 'crypto';
import type { HelpSection } from '@/lib/help/defaults';

/** Impressão digital do texto de um artigo (título, resumo, seções e dica). */
export function articleHash(article: { title: string; summary: string; sections: HelpSection[] | unknown; tip?: string | null }) {
  const sections = Array.isArray(article.sections) ? (article.sections as HelpSection[]).map((section) => [String(section?.title ?? ''), String(section?.text ?? '')]) : [];
  return createHash('sha256').update(JSON.stringify([String(article.title ?? ''), String(article.summary ?? ''), sections, String(article.tip ?? '')])).digest('hex').slice(0, 16);
}
