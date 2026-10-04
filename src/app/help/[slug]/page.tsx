"use client";

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AlertTriangle, ArrowLeft, ChevronRight, Lightbulb, Loader2, Pencil, PlayCircle } from 'lucide-react';
import styles from '../help.module.css';
import { HELP_ICONS, type HelpIconKey } from '@/lib/help/icons';
import { loadHelp, type HelpData } from '@/lib/help/client';
import RichText from '@/components/help/RichText';
import { usePermissions } from '@/hooks/usePermissions';

/** YouTube/Vimeo/Loom viram player; outros links, botão. */
function embedUrl(url: string) {
  const youtube = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([\w-]{6,})/);
  if (youtube) return `https://www.youtube.com/embed/${youtube[1]}`;
  const vimeo = url.match(/vimeo\.com\/(\d+)/);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
  const loom = url.match(/loom\.com\/share\/([\w-]+)/);
  if (loom) return `https://www.loom.com/embed/${loom[1]}`;
  return null;
}

export default function ArticlePage() {
  const params = useParams();
  const slug = String(params?.slug || '');
  const { isPlatformAdmin } = usePermissions();
  const [data, setData] = useState<HelpData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    loadHelp()
      .then((content) => { if (alive) setData(content); })
      .catch((err) => { if (alive) setError(err instanceof Error ? err.message : 'Erro ao carregar.'); });
    return () => { alive = false; };
  }, []);

  if (error) {
    return <div className={styles.container}><div className={styles.errorBox}><AlertTriangle size={16} /> {error}</div></div>;
  }
  if (!data) {
    return <div className={styles.container}><div className={styles.loading}><Loader2 size={20} className={styles.spin} /> Carregando...</div></div>;
  }

  const article = data.articles.find((item) => item.slug === slug);
  if (!article) {
    return (
      <div className={styles.container}>
        <div className={styles.empty}>
          <h2>Artigo não encontrado</h2>
          <p>Ele pode ter sido removido ou renomeado.</p>
          <Link href="/help" className={styles.primaryBtn}>Voltar para a Central de Ajuda</Link>
        </div>
      </div>
    );
  }

  const category = data.categories.find((item) => item.id === article.category_id);
  const Icon = HELP_ICONS[(category?.icon || 'book') as HelpIconKey] || HELP_ICONS.book;
  const color = category?.color || '#3b82f6';
  const related = data.articles.filter((item) => item.category_id === article.category_id && item.id !== article.id);
  const video = article.video_url ? embedUrl(article.video_url) : null;

  return (
    <div className={styles.container}>
      <div className={styles.articleTop}>
        <Link href="/help" className={styles.backLink}><ArrowLeft size={16} /> Central de Ajuda</Link>
        {isPlatformAdmin && data.source === 'database' && (
          <Link href={`/master?tab=help&article=${article.slug}`} className={styles.secondaryBtn}>
            <Pencil size={15} /> Editar no Painel Master
          </Link>
        )}
      </div>

      <header className={styles.articleHeader}>
        <span className={styles.categoryIcon} style={{ color, background: `${color}1f` }}><Icon size={26} /></span>
        <div>
          {category && <span className={styles.eyebrow} style={{ color }}>{category.title}</span>}
          <h1>{article.title}</h1>
          {article.summary && <p>{article.summary}</p>}
        </div>
      </header>

      <div className={styles.articleLayout}>
        <div className={styles.articleBody}>
          {video && (
            <div className={styles.video}>
              <iframe src={video} title={`Vídeo: ${article.title}`} allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture" allowFullScreen />
            </div>
          )}

          {article.sections.map((section, index) => (
            <section key={index} className={styles.articleSection}>
              {section.title && (
                <h2>
                  <span className={styles.stepNumber} style={{ background: color }}>{index + 1}</span>
                  {section.title.replace(/^\d+\.\s*/, '')}
                </h2>
              )}
              <RichText text={section.text} />
            </section>
          ))}

          {article.tip && (
            <div className={styles.tip}>
              <Lightbulb size={20} />
              <div>
                <strong>Dica</strong>
                <RichText text={article.tip} />
              </div>
            </div>
          )}
        </div>

        <aside className={styles.articleAside}>
          {article.video_url && !video && (
            <a className={styles.asideCard} href={article.video_url} target="_blank" rel="noopener noreferrer">
              <PlayCircle size={20} /> Assistir ao vídeo
            </a>
          )}
          {related.length > 0 && (
            <div className={styles.asideCard}>
              <h4>Nesta categoria</h4>
              <ul className={styles.articleLinks}>
                {related.map((item) => (
                  <li key={item.id}><Link href={`/help/${item.slug}`}>{item.title} <ChevronRight size={15} /></Link></li>
                ))}
              </ul>
            </div>
          )}
          {article.updated_at && (
            <p className={styles.updated}>Atualizado em {new Date(article.updated_at).toLocaleDateString('pt-BR')}</p>
          )}
        </aside>
      </div>
    </div>
  );
}
