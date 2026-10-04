'use client';

import type { HelpSection } from './defaults';

export interface HelpCategoryView {
  id: string;
  slug: string;
  title: string;
  description: string;
  icon: string;
  color: string;
  position: number;
  published: boolean;
}

export interface HelpArticleView {
  id: string;
  category_id: string | null;
  slug: string;
  title: string;
  summary: string;
  sections: HelpSection[];
  tip: string;
  video_url: string;
  position: number;
  published: boolean;
  updated_at?: string;
}

export interface HelpFaqView {
  id: string;
  question: string;
  answer: string;
  position: number;
  published: boolean;
}

export interface HelpData {
  source: 'database' | 'defaults';
  categories: HelpCategoryView[];
  articles: HelpArticleView[];
  faqs: HelpFaqView[];
  contact?: { whatsapp: string | null; email: string | null; website: string | null };
}

// Uma busca por sessão de página: a Ajuda inteira é pequena.
let cache: Promise<HelpData> | null = null;

export function loadHelp(force = false): Promise<HelpData> {
  if (!cache || force) {
    cache = fetch('/api/help', { cache: 'no-store' })
      .then(async (response) => {
        const json = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(json.error || 'Não foi possível carregar a Central de Ajuda.');
        return json.data as HelpData;
      })
      .catch((error) => {
        cache = null;
        throw error;
      });
  }
  return cache;
}

/** Texto pesquisável de um artigo (sem formatação). */
export function articleText(article: HelpArticleView) {
  return [article.title, article.summary, article.tip, ...article.sections.flatMap((section) => [section.title, section.text])]
    .join(' ')
    .toLowerCase();
}

export function normalize(text: string) {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
