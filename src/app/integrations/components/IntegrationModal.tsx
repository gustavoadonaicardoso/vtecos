'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { BookOpen, ExternalLink, Settings2, X } from 'lucide-react';
import styles from '../integrations.module.css';
import RichText from '@/components/help/RichText';
import { DEFAULT_ARTICLES } from '@/lib/help/defaults';
import { loadHelp, type HelpArticleView } from '@/lib/help/client';
import type { CardStatus, CatalogItem, IntegrationView, Overview } from '../constants';
import { LeadCapturePanel, SheetsPanel, SocialPanel, WebhookPanel, WhatsAppApiPanel, WhatsAppWebPanel } from './panels';
import { AiPanel, TwilioPanel } from './more-panels';

interface IntegrationModalProps {
  item: CatalogItem;
  status: CardStatus;
  integration: IntegrationView | null;
  overview: Overview;
  onChanged: () => Promise<void>;
  onClose: () => void;
}

type Tutorial = Pick<HelpArticleView, 'title' | 'summary' | 'sections' | 'tip'>;

/** O passo a passo vem da Central de Ajuda (editável no Painel Master); sem ela, do conteúdo padrão. */
function useTutorial(slug: string) {
  const fallback = DEFAULT_ARTICLES.find((article) => article.slug === slug);
  const [tutorial, setTutorial] = useState<Tutorial | null>(fallback ? { ...fallback, tip: fallback.tip || '' } : null);

  useEffect(() => {
    let alive = true;
    loadHelp()
      .then((data) => {
        const article = data.articles.find((item) => item.slug === slug);
        if (alive && article) setTutorial(article);
      })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [slug]);

  return tutorial;
}

const PANELS = {
  'whatsapp-web': WhatsAppWebPanel,
  'whatsapp-api': WhatsAppApiPanel,
  'lead-capture': LeadCapturePanel,
  webhooks: WebhookPanel,
  'google-sheets': SheetsPanel,
  social: SocialPanel,
  twilio: TwilioPanel,
  ai: AiPanel,
} as const;

export default function IntegrationModal({ item, status, integration, overview, onChanged, onClose }: IntegrationModalProps) {
  const [tab, setTab] = useState<'setup' | 'guide'>(status === 'off' ? 'guide' : 'setup');
  const tutorial = useTutorial(item.helpSlug);
  const Panel = PANELS[item.id];

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="integration-title">
        <header className={styles.modalHead}>
          <span className={styles.iconBox} style={{ color: item.color, background: `${item.color}1f` }}><item.icon size={22} /></span>
          <div className={styles.modalTitle}>
            <h2 id="integration-title">{item.name}</h2>
            <p>{item.description}</p>
          </div>
          <button type="button" className={styles.iconBtn} onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </header>

        <nav className={styles.tabs} aria-label="Seções da integração">
          <button type="button" className={tab === 'guide' ? styles.tabActive : ''} onClick={() => setTab('guide')}>
            <BookOpen size={16} /> Passo a passo
          </button>
          <button type="button" className={tab === 'setup' ? styles.tabActive : ''} onClick={() => setTab('setup')}>
            <Settings2 size={16} /> Configurar
          </button>
        </nav>

        <div className={styles.modalBody}>
          {tab === 'guide' ? (
            tutorial ? (
              <div className={styles.guide}>
                {tutorial.summary && <p className={styles.guideSummary}>{tutorial.summary}</p>}
                <ol className={styles.steps}>
                  {tutorial.sections.map((section, index) => (
                    <li key={index}>
                      <span className={styles.stepNumber} style={{ background: item.color }}>{index + 1}</span>
                      <div>
                        {section.title && <strong>{section.title.replace(/^\d+\.\s*/, '')}</strong>}
                        <RichText text={section.text} />
                      </div>
                    </li>
                  ))}
                </ol>
                {tutorial.tip && <div className={styles.tip}><strong>Dica:</strong> <RichText text={tutorial.tip} /></div>}
                <div className={styles.guideFoot}>
                  <Link href={`/help/${item.helpSlug}`} className={styles.linkBtn} target="_blank">
                    <ExternalLink size={14} /> Abrir na Central de Ajuda
                  </Link>
                  <button type="button" className={styles.primaryBtn} onClick={() => setTab('setup')}>
                    <Settings2 size={16} /> Ir para a configuração
                  </button>
                </div>
              </div>
            ) : (
              <p className={styles.hint}>Passo a passo indisponível.</p>
            )
          ) : (
            <Panel integration={integration} overview={overview} onChanged={onChanged} />
          )}
        </div>
      </div>
    </div>
  );
}
