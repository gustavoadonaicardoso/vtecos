'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Eye,
  EyeOff,
  ExternalLink,
  FileText,
  FolderPlus,
  HelpCircle,
  Loader2,
  Plus,
  RefreshCcw,
  Save,
  Trash2,
} from 'lucide-react';
import master from '../master.module.css';
import styles from './HelpTab.module.css';
import { HELP_ICONS, HELP_ICON_KEYS, type HelpIconKey } from '@/lib/help/icons';
import type { HelpArticleView, HelpCategoryView, HelpData, HelpFaqView } from '@/lib/help/client';
import RichText from '@/components/help/RichText';

type Selection =
  | { kind: 'article'; id: string | null; categoryId?: string | null }
  | { kind: 'category'; id: string | null }
  | { kind: 'faqs' };

type ArticleDraft = Omit<HelpArticleView, 'id' | 'position'>;
type CategoryDraft = Omit<HelpCategoryView, 'id' | 'position'>;

const EMPTY_ARTICLE: ArticleDraft = {
  category_id: null,
  slug: '',
  title: '',
  summary: '',
  sections: [{ title: '', text: '' }],
  tip: '',
  video_url: '',
  published: true,
};

const EMPTY_CATEGORY: CategoryDraft = { slug: '', title: '', description: '', icon: 'book', color: '#3b82f6', published: true };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: init?.body ? { 'Content-Type': 'application/json' } : undefined });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error || 'Não foi possível concluir.');
  return json.data as T;
}

const slugify = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);

export default function HelpTab({ initialArticle }: { initialArticle?: string | null }) {
  const [data, setData] = useState<HelpData | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [articleDraft, setArticleDraft] = useState<ArticleDraft | null>(null);
  const [categoryDraft, setCategoryDraft] = useState<CategoryDraft | null>(null);
  const [slugTouched, setSlugTouched] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [preview, setPreview] = useState(false);

  const readOnly = data?.source === 'defaults';

  const load = useCallback(async () => {
    try {
      const content = await api<HelpData>('/api/help/admin');
      setData(content);
      setError('');
      return content;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar a Central de Ajuda.');
      return null;
    }
  }, []);

  const openArticle = useCallback((article: HelpArticleView | null, categoryId?: string | null) => {
    setSelection({ kind: 'article', id: article?.id ?? null, categoryId });
    setArticleDraft(article
      ? { category_id: article.category_id, slug: article.slug, title: article.title, summary: article.summary, sections: article.sections.length ? article.sections : [{ title: '', text: '' }], tip: article.tip, video_url: article.video_url, published: article.published }
      : { ...EMPTY_ARTICLE, category_id: categoryId ?? null });
    setSlugTouched(Boolean(article));
    setDirty(false);
    setPreview(false);
    setNotice('');
  }, []);

  useEffect(() => {
    load().then((content) => {
      if (!content) return;
      const target = initialArticle ? content.articles.find((article) => article.slug === initialArticle) : null;
      if (target) openArticle(target);
    });
  }, [load, initialArticle, openArticle]);

  const confirmLeave = () => !dirty || confirm('Há alterações não salvas. Descartar?');

  const select = (next: Selection, run: () => void) => {
    if (!confirmLeave()) return;
    setSelection(next);
    run();
  };

  const openCategory = (category: HelpCategoryView | null) => select({ kind: 'category', id: category?.id ?? null }, () => {
    setCategoryDraft(category ? { slug: category.slug, title: category.title, description: category.description, icon: category.icon, color: category.color, published: category.published } : { ...EMPTY_CATEGORY });
    setSlugTouched(Boolean(category));
    setDirty(false);
    setNotice('');
  });

  const grouped = useMemo(() => {
    if (!data) return [];
    const groups = data.categories.map((category) => ({ category, articles: data.articles.filter((article) => article.category_id === category.id) }));
    const orphans = data.articles.filter((article) => !data.categories.some((category) => category.id === article.category_id));
    if (orphans.length) groups.push({ category: { id: '', slug: '', title: 'Sem categoria', description: '', icon: 'help', color: '#94a3b8', position: 999, published: true }, articles: orphans });
    return groups;
  }, [data]);

  const run = async (action: () => Promise<void>, success?: string) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
      if (success) setNotice(success);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível concluir.');
    } finally {
      setBusy(false);
    }
  };

  // ── Artigo ──

  const editArticle = (changes: Partial<ArticleDraft>) => {
    setArticleDraft((draft) => {
      if (!draft) return draft;
      const next = { ...draft, ...changes };
      if ('title' in changes && !slugTouched) next.slug = slugify(changes.title || '');
      return next;
    });
    setDirty(true);
  };

  const editSection = (index: number, changes: Partial<{ title: string; text: string }>) => {
    if (!articleDraft) return;
    editArticle({ sections: articleDraft.sections.map((section, i) => (i === index ? { ...section, ...changes } : section)) });
  };

  const moveSection = (index: number, delta: number) => {
    if (!articleDraft) return;
    const sections = [...articleDraft.sections];
    const target = index + delta;
    if (target < 0 || target >= sections.length) return;
    [sections[index], sections[target]] = [sections[target], sections[index]];
    editArticle({ sections });
  };

  const saveArticle = () => run(async () => {
    if (!articleDraft || selection?.kind !== 'article') return;
    const saved = await api<HelpArticleView>('/api/help/admin', {
      method: 'POST',
      body: JSON.stringify({ type: 'article', id: selection.id, item: articleDraft }),
    });
    setDirty(false);
    const content = await load();
    const fresh = content?.articles.find((article) => article.id === saved.id);
    if (fresh) openArticle(fresh);
  }, 'Artigo salvo. Já aparece na Central de Ajuda.');

  const deleteArticle = () => {
    if (selection?.kind !== 'article' || !selection.id) return;
    if (!confirm('Excluir este artigo? Não dá para desfazer.')) return;
    run(async () => {
      await api(`/api/help/admin?type=article&id=${selection.id}`, { method: 'DELETE' });
      setSelection(null);
      setArticleDraft(null);
      setDirty(false);
      await load();
    }, 'Artigo excluído.');
  };

  // ── Categoria ──

  const editCategory = (changes: Partial<CategoryDraft>) => {
    setCategoryDraft((draft) => {
      if (!draft) return draft;
      const next = { ...draft, ...changes };
      if ('title' in changes && !slugTouched) next.slug = slugify(changes.title || '');
      return next;
    });
    setDirty(true);
  };

  const saveCategory = () => run(async () => {
    if (!categoryDraft || selection?.kind !== 'category') return;
    const saved = await api<HelpCategoryView>('/api/help/admin', {
      method: 'POST',
      body: JSON.stringify({ type: 'category', id: selection.id, item: categoryDraft }),
    });
    setDirty(false);
    setSelection({ kind: 'category', id: saved.id });
    await load();
  }, 'Categoria salva.');

  const deleteCategory = () => {
    if (selection?.kind !== 'category' || !selection.id) return;
    if (!confirm('Excluir esta categoria? Os artigos dela continuam existindo, em "Sem categoria".')) return;
    run(async () => {
      await api(`/api/help/admin?type=category&id=${selection.id}`, { method: 'DELETE' });
      setSelection(null);
      setCategoryDraft(null);
      setDirty(false);
      await load();
    }, 'Categoria excluída.');
  };

  // ── Ordem ──

  const reorder = (type: 'category' | 'article' | 'faq', ids: string[], index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    const next = [...ids];
    [next[index], next[target]] = [next[target], next[index]];
    run(async () => {
      await api('/api/help/admin/reorder', { method: 'POST', body: JSON.stringify({ type, ids: next }) });
      await load();
    });
  };

  const seedDefaults = () => run(async () => {
    const result = await api<{ categories: number; articles: number; faqs: number }>('/api/help/admin/seed', { method: 'POST' });
    await load();
    setNotice(result.categories + result.articles + result.faqs === 0
      ? 'Nada a adicionar: todos os artigos padrão já existem.'
      : `Adicionado: ${result.categories} categoria(s), ${result.articles} artigo(s) e ${result.faqs} pergunta(s).`);
  });

  if (!data) {
    return (
      <div className={master.card}>
        {error ? <div className={master.errorBanner}>{error}</div> : <div className={styles.loading}><Loader2 size={18} className={master.spin} /> Carregando a Central de Ajuda...</div>}
      </div>
    );
  }

  return (
    <motion.div key="help" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className={styles.wrap}>
      {readOnly && (
        <div className={master.errorBanner}>
          <AlertTriangle size={16} /> A migration <strong>202610080001_help_center_integrations.sql</strong> ainda não rodou no Supabase. A Ajuda mostra o conteúdo padrão, mas só dá para editar depois dela.
        </div>
      )}
      {error && <div className={master.errorBanner}>{error}</div>}
      {notice && <div className={styles.notice}><CheckCircle2 size={16} /> {notice}</div>}

      <div className={styles.layout}>
        {/* ── Lista ── */}
        <aside className={styles.tree}>
          <div className={styles.treeActions}>
            <button type="button" className={master.saveBtn} disabled={readOnly || busy} onClick={() => select({ kind: 'article', id: null }, () => openArticle(null))}>
              <Plus size={16} /> Artigo
            </button>
            <button type="button" className={master.resetBtn} disabled={readOnly || busy} onClick={() => openCategory(null)}>
              <FolderPlus size={16} /> Categoria
            </button>
          </div>

          {grouped.map(({ category, articles }, categoryIndex) => {
            const Icon = HELP_ICONS[category.icon as HelpIconKey] || HELP_ICONS.book;
            const categoryIds = data.categories.map((item) => item.id);
            const articleIds = articles.map((article) => article.id);
            return (
              <div key={category.id || 'orphans'} className={styles.group}>
                <div className={`${styles.groupHead} ${selection?.kind === 'category' && selection.id === category.id ? styles.active : ''}`}>
                  <button type="button" className={styles.groupTitle} onClick={() => category.id && openCategory(category)} disabled={!category.id}>
                    <Icon size={16} style={{ color: category.color }} />
                    <span>{category.title}</span>
                    {!category.published && <span className={styles.draft}>oculta</span>}
                  </button>
                  {category.id && !readOnly && (
                    <span className={styles.moveBtns}>
                      <button type="button" aria-label="Subir categoria" disabled={busy || categoryIndex === 0} onClick={() => reorder('category', categoryIds, categoryIndex, -1)}><ArrowUp size={13} /></button>
                      <button type="button" aria-label="Descer categoria" disabled={busy || categoryIndex >= categoryIds.length - 1} onClick={() => reorder('category', categoryIds, categoryIndex, 1)}><ArrowDown size={13} /></button>
                    </span>
                  )}
                </div>
                <ul>
                  {articles.map((article, articleIndex) => (
                    <li key={article.id} className={selection?.kind === 'article' && selection.id === article.id ? styles.active : ''}>
                      <button type="button" className={styles.articleBtn} onClick={() => select({ kind: 'article', id: article.id }, () => openArticle(article))}>
                        <FileText size={14} />
                        <span>{article.title}</span>
                        {!article.published && <span className={styles.draft}>rascunho</span>}
                      </button>
                      {!readOnly && (
                        <span className={styles.moveBtns}>
                          <button type="button" aria-label="Subir artigo" disabled={busy || articleIndex === 0} onClick={() => reorder('article', articleIds, articleIndex, -1)}><ArrowUp size={13} /></button>
                          <button type="button" aria-label="Descer artigo" disabled={busy || articleIndex >= articleIds.length - 1} onClick={() => reorder('article', articleIds, articleIndex, 1)}><ArrowDown size={13} /></button>
                        </span>
                      )}
                    </li>
                  ))}
                  {category.id && !readOnly && (
                    <li>
                      <button type="button" className={styles.addInline} onClick={() => select({ kind: 'article', id: null, categoryId: category.id }, () => openArticle(null, category.id))}>
                        <Plus size={13} /> Novo artigo aqui
                      </button>
                    </li>
                  )}
                </ul>
              </div>
            );
          })}

          <button type="button" className={`${styles.faqEntry} ${selection?.kind === 'faqs' ? styles.active : ''}`} onClick={() => select({ kind: 'faqs' }, () => { setDirty(false); setNotice(''); })}>
            <HelpCircle size={16} /> Perguntas frequentes ({data.faqs.length})
          </button>

          {!readOnly && (
            <button type="button" className={styles.seedBtn} onClick={seedDefaults} disabled={busy}>
              <RefreshCcw size={14} /> Adicionar artigos padrão que faltam
            </button>
          )}
        </aside>

        {/* ── Editor ── */}
        <section className={styles.editor}>
          {!selection && (
            <div className={styles.placeholder}>
              <FileText size={32} />
              <strong>Escolha um artigo ou categoria para editar</strong>
              <span>Tudo o que você salvar aqui aparece na hora na Central de Ajuda de todas as empresas, e os tutoriais de integração também aparecem dentro da tela de Integrações.</span>
            </div>
          )}

          {selection?.kind === 'article' && articleDraft && (
            <div className={styles.form}>
              <div className={styles.editorHead}>
                <h3>{selection.id ? 'Editar artigo' : 'Novo artigo'}</h3>
                <div className={master.actionButtons}>
                  {selection.id && articleDraft.slug && (
                    <a className={master.resetBtn} href={`/help/${articleDraft.slug}`} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} /> Ver</a>
                  )}
                  <button type="button" className={master.resetBtn} onClick={() => setPreview((value) => !value)}>
                    {preview ? <EyeOff size={15} /> : <Eye size={15} />} {preview ? 'Editar' : 'Pré-visualizar'}
                  </button>
                </div>
              </div>

              <div className={master.formRow2}>
                <label className={master.field}>
                  <span className={master.fieldLabel}>Título</span>
                  <input className={master.input} value={articleDraft.title} maxLength={120} onChange={(e) => editArticle({ title: e.target.value })} disabled={readOnly} />
                </label>
                <label className={master.field}>
                  <span className={master.fieldLabel}>Categoria</span>
                  <select className={master.input} value={articleDraft.category_id || ''} onChange={(e) => editArticle({ category_id: e.target.value || null })} disabled={readOnly}>
                    <option value="">Sem categoria</option>
                    {data.categories.map((category) => <option key={category.id} value={category.id}>{category.title}</option>)}
                  </select>
                </label>
              </div>

              <div className={master.formRow2}>
                <label className={master.field}>
                  <span className={master.fieldLabel}>Endereço (/help/...)</span>
                  <input className={master.input} value={articleDraft.slug} maxLength={80} onChange={(e) => { setSlugTouched(true); editArticle({ slug: slugify(e.target.value) }); }} disabled={readOnly} />
                </label>
                <label className={master.field}>
                  <span className={master.fieldLabel}>Vídeo (YouTube, Vimeo ou Loom — opcional)</span>
                  <input className={master.input} value={articleDraft.video_url} placeholder="https://youtu.be/..." onChange={(e) => editArticle({ video_url: e.target.value })} disabled={readOnly} />
                </label>
              </div>

              <label className={master.field}>
                <span className={master.fieldLabel}>Resumo (aparece na busca e no topo do artigo)</span>
                <input className={master.input} value={articleDraft.summary} maxLength={300} onChange={(e) => editArticle({ summary: e.target.value })} disabled={readOnly} />
              </label>

              <div className={styles.sectionsHead}>
                <span className={master.fieldLabel}>Seções / passos</span>
                <small>Formatação: **negrito**, `código`, linhas com &quot;- &quot; viram lista, blocos entre ``` viram código com botão de copiar. {'{{APP_URL}}'} vira o endereço do sistema.</small>
              </div>

              {articleDraft.sections.map((section, index) => (
                <div key={index} className={styles.sectionCard}>
                  <div className={styles.sectionTop}>
                    <span className={styles.sectionNumber}>{index + 1}</span>
                    {preview ? (
                      <strong className={styles.previewTitle}>{section.title || 'Sem título'}</strong>
                    ) : (
                      <input className={master.input} value={section.title} placeholder="Título do passo" maxLength={160} onChange={(e) => editSection(index, { title: e.target.value })} disabled={readOnly} />
                    )}
                    {!readOnly && !preview && (
                      <span className={styles.moveBtns}>
                        <button type="button" aria-label="Subir seção" disabled={index === 0} onClick={() => moveSection(index, -1)}><ArrowUp size={13} /></button>
                        <button type="button" aria-label="Descer seção" disabled={index === articleDraft.sections.length - 1} onClick={() => moveSection(index, 1)}><ArrowDown size={13} /></button>
                        <button type="button" aria-label="Remover seção" className={styles.removeBtn} disabled={articleDraft.sections.length === 1} onClick={() => editArticle({ sections: articleDraft.sections.filter((_, i) => i !== index) })}><Trash2 size={13} /></button>
                      </span>
                    )}
                  </div>
                  {preview ? (
                    <RichText text={section.text} />
                  ) : (
                    <textarea className={`${master.input} ${styles.textarea}`} value={section.text} rows={Math.min(14, Math.max(4, section.text.split('\n').length + 1))} placeholder="Explique o passo..." onChange={(e) => editSection(index, { text: e.target.value })} disabled={readOnly} />
                  )}
                </div>
              ))}

              {!readOnly && !preview && (
                <button type="button" className={styles.addSection} onClick={() => editArticle({ sections: [...articleDraft.sections, { title: '', text: '' }] })}>
                  <Plus size={15} /> Adicionar seção
                </button>
              )}

              <label className={master.field}>
                <span className={master.fieldLabel}>Dica (opcional, aparece em destaque no fim)</span>
                <textarea className={master.input} rows={2} value={articleDraft.tip} maxLength={1000} onChange={(e) => editArticle({ tip: e.target.value })} disabled={readOnly} />
              </label>

              <label className={styles.check}>
                <input type="checkbox" checked={articleDraft.published} onChange={(e) => editArticle({ published: e.target.checked })} disabled={readOnly} />
                Publicado (desmarcado, fica como rascunho e só aparece aqui)
              </label>

              {!readOnly && (
                <div className={master.modalActions}>
                  {selection.id ? (
                    <button type="button" className={master.dangerBtn} onClick={deleteArticle} disabled={busy}><Trash2 size={15} /> Excluir</button>
                  ) : <span />}
                  <button type="button" className={master.saveBtn} onClick={saveArticle} disabled={busy || !dirty}>
                    {busy ? <Loader2 size={15} className={master.spin} /> : <Save size={15} />} Salvar artigo
                  </button>
                </div>
              )}
            </div>
          )}

          {selection?.kind === 'category' && categoryDraft && (
            <div className={styles.form}>
              <div className={styles.editorHead}><h3>{selection.id ? 'Editar categoria' : 'Nova categoria'}</h3></div>
              <div className={master.formRow2}>
                <label className={master.field}>
                  <span className={master.fieldLabel}>Título</span>
                  <input className={master.input} value={categoryDraft.title} maxLength={80} onChange={(e) => editCategory({ title: e.target.value })} disabled={readOnly} />
                </label>
                <label className={master.field}>
                  <span className={master.fieldLabel}>Identificador</span>
                  <input className={master.input} value={categoryDraft.slug} maxLength={80} onChange={(e) => { setSlugTouched(true); editCategory({ slug: slugify(e.target.value) }); }} disabled={readOnly} />
                </label>
              </div>
              <label className={master.field}>
                <span className={master.fieldLabel}>Descrição</span>
                <input className={master.input} value={categoryDraft.description} maxLength={240} onChange={(e) => editCategory({ description: e.target.value })} disabled={readOnly} />
              </label>
              <div className={master.field}>
                <span className={master.fieldLabel}>Ícone e cor</span>
                <div className={styles.iconRow}>
                  {HELP_ICON_KEYS.map((key) => {
                    const Icon = HELP_ICONS[key as HelpIconKey];
                    return (
                      <button key={key} type="button" aria-label={key} className={`${master.iconChoice} ${categoryDraft.icon === key ? master.iconChoiceActive : ''}`} onClick={() => editCategory({ icon: key })} disabled={readOnly}>
                        <Icon size={17} />
                      </button>
                    );
                  })}
                  <span className={master.colorPreview} style={{ background: categoryDraft.color }}>
                    <input type="color" className={master.colorInput} value={categoryDraft.color} onChange={(e) => editCategory({ color: e.target.value })} aria-label="Cor" disabled={readOnly} />
                  </span>
                </div>
              </div>
              <label className={styles.check}>
                <input type="checkbox" checked={categoryDraft.published} onChange={(e) => editCategory({ published: e.target.checked })} disabled={readOnly} />
                Visível na Central de Ajuda
              </label>
              {!readOnly && (
                <div className={master.modalActions}>
                  {selection.id ? (
                    <button type="button" className={master.dangerBtn} onClick={deleteCategory} disabled={busy}><Trash2 size={15} /> Excluir</button>
                  ) : <span />}
                  <button type="button" className={master.saveBtn} onClick={saveCategory} disabled={busy || !dirty}>
                    {busy ? <Loader2 size={15} className={master.spin} /> : <Save size={15} />} Salvar categoria
                  </button>
                </div>
              )}
            </div>
          )}

          {selection?.kind === 'faqs' && (
            <FaqEditor faqs={data.faqs} readOnly={readOnly} busy={busy} run={run} reload={load} onReorder={(ids, index, delta) => reorder('faq', ids, index, delta)} />
          )}
        </section>
      </div>
    </motion.div>
  );
}

function FaqEditor({ faqs, readOnly, busy, run, reload, onReorder }: {
  faqs: HelpFaqView[];
  readOnly: boolean;
  busy: boolean;
  run: (action: () => Promise<void>, success?: string) => Promise<void>;
  reload: () => Promise<unknown>;
  onReorder: (ids: string[], index: number, delta: number) => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, { question: string; answer: string; published: boolean }>>({});
  const [newFaq, setNewFaq] = useState({ question: '', answer: '' });
  const ids = faqs.map((faq) => faq.id);

  const draftOf = (faq: HelpFaqView) => drafts[faq.id] ?? { question: faq.question, answer: faq.answer, published: faq.published };
  const edit = (faq: HelpFaqView, changes: Partial<{ question: string; answer: string; published: boolean }>) =>
    setDrafts((current) => ({ ...current, [faq.id]: { ...draftOf(faq), ...changes } }));

  const save = (faq: HelpFaqView) => run(async () => {
    await api('/api/help/admin', { method: 'POST', body: JSON.stringify({ type: 'faq', id: faq.id, item: draftOf(faq) }) });
    setDrafts((current) => { const next = { ...current }; delete next[faq.id]; return next; });
    await reload();
  }, 'Pergunta salva.');

  const remove = (faq: HelpFaqView) => {
    if (!confirm('Excluir esta pergunta?')) return;
    run(async () => {
      await api(`/api/help/admin?type=faq&id=${faq.id}`, { method: 'DELETE' });
      await reload();
    }, 'Pergunta excluída.');
  };

  const add = (event: React.FormEvent) => {
    event.preventDefault();
    run(async () => {
      await api('/api/help/admin', { method: 'POST', body: JSON.stringify({ type: 'faq', item: { ...newFaq, published: true } }) });
      setNewFaq({ question: '', answer: '' });
      await reload();
    }, 'Pergunta adicionada.');
  };

  return (
    <div className={styles.form}>
      <div className={styles.editorHead}><h3>Perguntas frequentes</h3></div>
      {faqs.map((faq, index) => {
        const draft = draftOf(faq);
        const changed = Boolean(drafts[faq.id]);
        return (
          <div key={faq.id} className={styles.sectionCard}>
            <div className={styles.sectionTop}>
              <span className={styles.sectionNumber}>{index + 1}</span>
              <input className={master.input} value={draft.question} maxLength={240} onChange={(e) => edit(faq, { question: e.target.value })} disabled={readOnly} />
              {!readOnly && (
                <span className={styles.moveBtns}>
                  <button type="button" aria-label="Subir" disabled={busy || index === 0} onClick={() => onReorder(ids, index, -1)}><ArrowUp size={13} /></button>
                  <button type="button" aria-label="Descer" disabled={busy || index === ids.length - 1} onClick={() => onReorder(ids, index, 1)}><ArrowDown size={13} /></button>
                  <button type="button" aria-label="Excluir" className={styles.removeBtn} disabled={busy} onClick={() => remove(faq)}><Trash2 size={13} /></button>
                </span>
              )}
            </div>
            <textarea className={`${master.input} ${styles.textarea}`} rows={3} value={draft.answer} maxLength={3000} onChange={(e) => edit(faq, { answer: e.target.value })} disabled={readOnly} />
            <div className={styles.faqFoot}>
              <label className={styles.check}>
                <input type="checkbox" checked={draft.published} onChange={(e) => edit(faq, { published: e.target.checked })} disabled={readOnly} /> Publicada
              </label>
              {!readOnly && changed && (
                <button type="button" className={master.saveBtn} onClick={() => save(faq)} disabled={busy}><Save size={14} /> Salvar</button>
              )}
            </div>
          </div>
        );
      })}

      {!readOnly && (
        <form className={styles.sectionCard} onSubmit={add}>
          <strong>Nova pergunta</strong>
          <input className={master.input} placeholder="Pergunta" value={newFaq.question} maxLength={240} onChange={(e) => setNewFaq({ ...newFaq, question: e.target.value })} required />
          <textarea className={`${master.input} ${styles.textarea}`} rows={3} placeholder="Resposta" value={newFaq.answer} maxLength={3000} onChange={(e) => setNewFaq({ ...newFaq, answer: e.target.value })} required />
          <div className={styles.faqFoot}>
            <span />
            <button type="submit" className={master.saveBtn} disabled={busy}><Plus size={14} /> Adicionar</button>
          </div>
        </form>
      )}
    </div>
  );
}
