/**
 * ============================================================
 * VTEC OS — Central de Ajuda (server-only)
 * ============================================================
 * Categorias, artigos e perguntas frequentes ficam no banco e são os
 * mesmos para todas as empresas. Só o administrador da plataforma
 * (Painel Master) edita. Sem a migration 202610080001, a Ajuda mostra o
 * conteúdo padrão do código, só para leitura.
 * ============================================================
 */

import { supabaseAdmin } from '@/lib/supabase-admin';
import { DEFAULT_ARTICLES, DEFAULT_CATEGORIES, DEFAULT_FAQS, type HelpSection } from '@/lib/help/defaults';
import { HELP_ICON_KEYS } from '@/lib/help/icons';
import { articleHash } from '@/lib/help/hash';
import { DEFAULT_ARTICLE_HISTORY } from '@/lib/help/default-history';
import type { ServiceResult } from '@/types';

export interface HelpCategory {
  id: string;
  slug: string;
  title: string;
  description: string;
  icon: string;
  color: string;
  position: number;
  published: boolean;
}

export interface HelpArticle {
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

export interface HelpFaq {
  id: string;
  question: string;
  answer: string;
  position: number;
  published: boolean;
}

export interface HelpContent {
  /** "database" = editável; "defaults" = migration ainda não rodou. */
  source: 'database' | 'defaults';
  categories: HelpCategory[];
  articles: HelpArticle[];
  faqs: HelpFaq[];
}

// tenant-scope: ok -- as tabelas da Ajuda são da plataforma, sem tenant_id.

const isMissingTable = (message?: string) => Boolean(message && /help_(categories|articles|faqs)|does not exist|schema cache/i.test(message));

function defaultsContent(): HelpContent {
  const categories = DEFAULT_CATEGORIES.map((category, index) => ({ ...category, id: category.slug, position: index, published: true }));
  const articles = DEFAULT_ARTICLES.map((article, index) => ({
    id: article.slug,
    category_id: article.category,
    slug: article.slug,
    title: article.title,
    summary: article.summary,
    sections: article.sections,
    tip: article.tip || '',
    video_url: '',
    position: index,
    published: true,
  }));
  const faqs = DEFAULT_FAQS.map((faq, index) => ({ ...faq, id: `faq-${index}`, position: index, published: true }));
  return { source: 'defaults', categories, articles, faqs };
}

/** Grava o conteúdo padrão que ainda não existe (pelo slug). Devolve quantos itens entraram. */
export async function seedMissingDefaults(): Promise<ServiceResult<{ categories: number; articles: number; faqs: number }>> {
  const { data: existingCategories, error } = await supabaseAdmin.from('help_categories').select('id, slug, position');
  if (error) return { success: false, error: error.message };

  const bySlug = new Map((existingCategories || []).map((row) => [row.slug as string, row.id as string]));
  let nextPosition = Math.max(-1, ...(existingCategories || []).map((row) => Number(row.position) || 0)) + 1;

  const newCategories = DEFAULT_CATEGORIES.filter((category) => !bySlug.has(category.slug)).map((category) => ({ ...category, position: nextPosition++ }));
  if (newCategories.length > 0) {
    const { data, error: insertError } = await supabaseAdmin.from('help_categories').insert(newCategories).select('id, slug');
    if (insertError) return { success: false, error: insertError.message };
    for (const row of data || []) bySlug.set(row.slug, row.id);
  }

  const { data: existingArticles } = await supabaseAdmin.from('help_articles').select('slug');
  const articleSlugs = new Set((existingArticles || []).map((row) => row.slug as string));
  const newArticles = DEFAULT_ARTICLES.filter((article) => !articleSlugs.has(article.slug)).map((article) => ({
    category_id: bySlug.get(article.category) ?? null,
    slug: article.slug,
    title: article.title,
    summary: article.summary,
    sections: article.sections,
    tip: article.tip || '',
    position: DEFAULT_ARTICLES.indexOf(article),
  }));
  // default_hash só existe depois da migration 202610240002 (sem ela, grava sem).
  const withHash = newArticles.map((row) => ({ ...row, default_hash: articleHash(row) }));
  if (newArticles.length > 0) {
    let { error: insertError } = await supabaseAdmin.from('help_articles').insert(withHash);
    if (insertError && /default_hash/.test(insertError.message)) ({ error: insertError } = await supabaseAdmin.from('help_articles').insert(newArticles));
    if (insertError) return { success: false, error: insertError.message };
  }
  await refreshDefaultArticles();

  // Perguntas frequentes só entram quando não há nenhuma (não têm slug).
  let faqCount = 0;
  const { count } = await supabaseAdmin.from('help_faqs').select('id', { count: 'exact', head: true });
  if (!count) {
    const { error: insertError } = await supabaseAdmin.from('help_faqs').insert(DEFAULT_FAQS.map((faq, index) => ({ ...faq, position: index })));
    if (insertError) return { success: false, error: insertError.message };
    faqCount = DEFAULT_FAQS.length;
  }

  return { success: true, data: { categories: newCategories.length, articles: newArticles.length, faqs: faqCount } };
}

/**
 * Tutoriais padrão atualizam sozinhos: artigo que ninguém editou no
 * Painel Master (texto igual a uma versão padrão já publicada) recebe o
 * texto novo; artigo padrão novo (que nunca existiu) é criado. Artigo
 * editado à mão nunca é tocado. Roda uma vez por processo (ao abrir a
 * Ajuda depois de um deploy) e no botão do Painel Master.
 */
export async function refreshDefaultArticles(): Promise<{ updated: string[]; added: string[] }> {
  const result = { updated: [] as string[], added: [] as string[] };
  const { data: rows, error } = await supabaseAdmin.from('help_articles').select('*');
  if (error || !rows) return result;
  const bySlug = new Map((rows as Record<string, unknown>[]).map((row) => [String(row.slug), row]));
  const hasHashColumn = rows.length === 0 || 'default_hash' in rows[0];
  const { data: categories } = await supabaseAdmin.from('help_categories').select('id, slug');
  const categoryId = new Map((categories || []).map((row) => [row.slug as string, row.id as string]));

  for (const [index, article] of DEFAULT_ARTICLES.entries()) {
    const content = { title: article.title, summary: article.summary, sections: article.sections, tip: article.tip || '' };
    const target = articleHash(content);
    const row = bySlug.get(article.slug);
    const history = DEFAULT_ARTICLE_HISTORY[article.slug] || [];

    if (!row) {
      // Só artigos que nunca existiram: um padrão antigo apagado de propósito não volta.
      if (history.length > 0) continue;
      const insert = { ...content, slug: article.slug, category_id: categoryId.get(article.category) ?? null, position: index, ...(hasHashColumn ? { default_hash: target } : {}) };
      const { error: insertError } = await supabaseAdmin.from('help_articles').insert(insert);
      if (!insertError) result.added.push(article.slug);
      continue;
    }

    const current = articleHash(row as { title: string; summary: string; sections: unknown; tip: string });
    if (current === target) continue;
    const untouched = (row.default_hash && row.default_hash === current) || history.includes(current);
    if (!untouched) continue;
    const { error: updateError } = await supabaseAdmin
      .from('help_articles')
      .update({ ...content, updated_at: new Date().toISOString(), ...(hasHashColumn ? { default_hash: target } : {}) })
      .eq('id', String(row.id));
    if (!updateError) result.updated.push(article.slug);
  }
  return result;
}

const refreshHolder = globalThis as typeof globalThis & { __vtecHelpRefresh?: Promise<unknown> };

// Evita gravar o conteúdo padrão duas vezes se várias pessoas abrirem a Ajuda juntas.
let seeding: Promise<unknown> | null = null;

export async function fetchHelpContent(options: { includeDrafts?: boolean } = {}): Promise<HelpContent> {
  const load = () => Promise.all([
    supabaseAdmin.from('help_categories').select('*').order('position').order('created_at'),
    supabaseAdmin.from('help_articles').select('*').order('position').order('created_at'),
    supabaseAdmin.from('help_faqs').select('*').order('position').order('created_at'),
  ]);

  let [categories, articles, faqs] = await load();
  if (categories.error || articles.error || faqs.error) {
    const message = categories.error?.message || articles.error?.message || faqs.error?.message;
    if (isMissingTable(message)) return defaultsContent();
    throw new Error(message);
  }

  if ((categories.data || []).length === 0 && (articles.data || []).length === 0) {
    seeding = seeding || seedMissingDefaults().finally(() => { seeding = null; });
    await seeding;
    [categories, articles, faqs] = await load();
  } else if (!refreshHolder.__vtecHelpRefresh) {
    refreshHolder.__vtecHelpRefresh = refreshDefaultArticles().catch(() => undefined);
    const refreshed = (await refreshHolder.__vtecHelpRefresh) as { updated: string[]; added: string[] } | undefined;
    if (refreshed && (refreshed.updated.length || refreshed.added.length)) [categories, articles, faqs] = await load();
  }

  const keep = <T extends { published: boolean }>(rows: T[] | null) => (rows || []).filter((row) => options.includeDrafts || row.published);
  return {
    source: 'database',
    categories: keep(categories.data as HelpCategory[]),
    articles: keep(articles.data as HelpArticle[]).map((article) => ({ ...article, sections: Array.isArray(article.sections) ? article.sections : [] })),
    faqs: keep(faqs.data as HelpFaq[]),
  };
}

// ── Validação ────────────────────────────────────────────────

const str = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function slugify(text: string) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function parseSlug(body: Record<string, unknown>) {
  const slug = slugify(str(body.slug, 80) || str(body.title, 80));
  return SLUG.test(slug) ? slug : '';
}

export function parseCategory(body: Record<string, unknown>) {
  const title = str(body.title, 80);
  if (!title) return { error: 'Informe o título da categoria.' } as const;
  const slug = parseSlug(body);
  if (!slug) return { error: 'Endereço (slug) inválido.' } as const;
  const icon = HELP_ICON_KEYS.includes(str(body.icon, 30)) ? str(body.icon, 30) : 'book';
  const color = /^#[0-9a-f]{6}$/i.test(str(body.color, 7)) ? str(body.color, 7) : '#3b82f6';
  return {
    data: {
      slug,
      title,
      description: str(body.description, 240),
      icon,
      color,
      published: body.published !== false,
    },
  } as const;
}

export function parseArticle(body: Record<string, unknown>) {
  const title = str(body.title, 120);
  if (!title) return { error: 'Informe o título do artigo.' } as const;
  const slug = parseSlug(body);
  if (!slug) return { error: 'Endereço (slug) inválido.' } as const;

  const rawSections = Array.isArray(body.sections) ? body.sections.slice(0, 40) : [];
  const sections = rawSections
    .map((section) => {
      const item = (section || {}) as Record<string, unknown>;
      return { title: str(item.title, 160), text: str(item.text, 12000) };
    })
    .filter((section) => section.title || section.text);
  if (sections.length === 0) return { error: 'Adicione pelo menos uma seção com texto.' } as const;

  const videoUrl = str(body.video_url, 500);
  if (videoUrl && !/^https?:\/\//i.test(videoUrl)) return { error: 'O link do vídeo precisa começar com http:// ou https://.' } as const;

  return {
    data: {
      slug,
      title,
      category_id: str(body.category_id, 40) || null,
      summary: str(body.summary, 300),
      sections,
      tip: str(body.tip, 1000),
      video_url: videoUrl,
      published: body.published !== false,
    },
  } as const;
}

export function parseFaq(body: Record<string, unknown>) {
  const question = str(body.question, 240);
  const answer = str(body.answer, 3000);
  if (!question || !answer) return { error: 'Preencha a pergunta e a resposta.' } as const;
  return { data: { question, answer, published: body.published !== false } } as const;
}

// ── Gravação (Painel Master) ─────────────────────────────────

export type HelpTable = 'help_categories' | 'help_articles' | 'help_faqs';

const friendly = (message: string) => (/duplicate key|unique/i.test(message) ? 'Já existe um item com esse endereço (slug). Escolha outro.' : message);

export async function saveHelpItem(table: HelpTable, id: string | null, row: Record<string, unknown>): Promise<ServiceResult<Record<string, unknown>>> {
  const now = new Date().toISOString();
  if (id) {
    const { data, error } = await supabaseAdmin.from(table).update({ ...row, updated_at: now }).eq('id', id).select().maybeSingle();
    if (error) return { success: false, error: friendly(error.message) };
    if (!data) return { success: false, error: 'Item não encontrado.' };
    return { success: true, data };
  }

  // Novo item vai para o fim da lista (da categoria, no caso de artigo).
  let positionQuery = supabaseAdmin.from(table).select('position').order('position', { ascending: false }).limit(1);
  if (table === 'help_articles' && row.category_id) positionQuery = positionQuery.eq('category_id', row.category_id as string);
  const { data: last } = await positionQuery;
  const position = (Number(last?.[0]?.position) || 0) + 1;

  const { data, error } = await supabaseAdmin.from(table).insert({ ...row, position }).select().single();
  if (error) return { success: false, error: friendly(error.message) };
  return { success: true, data };
}

export async function deleteHelpItem(table: HelpTable, id: string): Promise<ServiceResult> {
  const { error } = await supabaseAdmin.from(table).delete().eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/** Grava a ordem: cada id recebe a posição do seu índice na lista. */
export async function reorderHelpItems(table: HelpTable, ids: string[]): Promise<ServiceResult> {
  const results = await Promise.all(
    ids.slice(0, 200).map((id, index) => supabaseAdmin.from(table).update({ position: index }).eq('id', id))
  );
  const failed = results.find((result) => result.error);
  if (failed?.error) return { success: false, error: failed.error.message };
  return { success: true };
}
