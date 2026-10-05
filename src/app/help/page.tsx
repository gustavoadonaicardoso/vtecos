"use client";

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  LifeBuoy,
  Loader2,
  Mail,
  MessageCircle,
  Search,
  Send,
  Ticket,
  X,
} from 'lucide-react';
import styles from './help.module.css';
import { HELP_ICONS, type HelpIconKey } from '@/lib/help/icons';
import { articleText, loadHelp, normalize, type HelpData } from '@/lib/help/client';
import RichText from '@/components/help/RichText';

export default function HelpCenter() {
  const [data, setData] = useState<HelpData | null>(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [openFaq, setOpenFaq] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadHelp()
      .then((content) => { if (alive) setData(content); })
      .catch((err) => { if (alive) setError(err instanceof Error ? err.message : 'Erro ao carregar.'); });
    return () => { alive = false; };
  }, []);

  const term = normalize(search.trim());
  const results = useMemo(() => {
    if (!data || term.length < 2) return null;
    return {
      articles: data.articles.filter((article) => normalize(articleText(article)).includes(term)),
      faqs: data.faqs.filter((faq) => normalize(`${faq.question} ${faq.answer}`).includes(term)),
    };
  }, [data, term]);

  const whatsappLink = data?.contact?.whatsapp
    ? `https://wa.me/${data.contact.whatsapp}?text=${encodeURIComponent('Olá! Preciso de ajuda com o vtec os.')}`
    : null;

  return (
    <div className={styles.container}>
      <header className={styles.hero}>
        <span className={styles.badge}><LifeBuoy size={14} /> Central de Ajuda</span>
        <h1>Como podemos ajudar?</h1>
        <p>Tutoriais passo a passo de cada módulo e de todas as integrações.</p>
        <div className={styles.searchBox}>
          <Search size={20} />
          <input
            type="search"
            placeholder="Pesquise: WhatsApp, senha, planilha, webhook..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Pesquisar na Central de Ajuda"
          />
          {search && (
            <button type="button" onClick={() => setSearch('')} aria-label="Limpar pesquisa"><X size={16} /></button>
          )}
        </div>
      </header>

      {error && <div className={styles.errorBox}><AlertTriangle size={16} /> {error}</div>}
      {!data && !error && <div className={styles.loading}><Loader2 size={20} className={styles.spin} /> Carregando artigos...</div>}

      {data && results && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            {results.articles.length + results.faqs.length} resultado(s) para &quot;{search.trim()}&quot;
          </h2>
          {results.articles.length === 0 && results.faqs.length === 0 && (
            <div className={styles.empty}>
              Nada encontrado. Tente outra palavra ou abra um chamado no fim da página.
            </div>
          )}
          <div className={styles.resultList}>
            {results.articles.map((article) => (
              <Link key={article.id} href={`/help/${article.slug}`} className={styles.resultItem}>
                <div>
                  <strong>{article.title}</strong>
                  <span>{article.summary}</span>
                </div>
                <ChevronRight size={18} />
              </Link>
            ))}
            {results.faqs.map((faq) => (
              <div key={faq.id} className={styles.resultFaq}>
                <strong>{faq.question}</strong>
                <RichText text={faq.answer} />
              </div>
            ))}
          </div>
        </section>
      )}

      {data && !results && (
        <>
          <section className={styles.categoryGrid}>
            {data.categories.map((category) => {
              const Icon = HELP_ICONS[category.icon as HelpIconKey] || HELP_ICONS.book;
              const articles = data.articles.filter((article) => article.category_id === category.id);
              if (articles.length === 0) return null;
              return (
                <article key={category.id} className={styles.categoryCard}>
                  <div className={styles.categoryHead}>
                    <span className={styles.categoryIcon} style={{ color: category.color, background: `${category.color}1f` }}>
                      <Icon size={22} />
                    </span>
                    <div>
                      <h3>{category.title}</h3>
                      <p>{category.description}</p>
                    </div>
                  </div>
                  <ul className={styles.articleLinks}>
                    {articles.map((article) => (
                      <li key={article.id}>
                        <Link href={`/help/${article.slug}`}>
                          {article.title} <ChevronRight size={15} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </article>
              );
            })}
          </section>

          {data.faqs.length > 0 && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Perguntas frequentes</h2>
              <div className={styles.faqList}>
                {data.faqs.map((faq) => {
                  const open = openFaq === faq.id;
                  return (
                    <div key={faq.id} className={`${styles.faqItem} ${open ? styles.faqOpen : ''}`}>
                      <button type="button" onClick={() => setOpenFaq(open ? null : faq.id)} aria-expanded={open}>
                        {faq.question}
                        <ChevronDown size={18} />
                      </button>
                      {open && <div className={styles.faqAnswer}><RichText text={faq.answer} /></div>}
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </>
      )}

      {data && (
        <section className={styles.supportCard}>
          <div>
            <h3>Ainda precisa de ajuda?</h3>
            <p>Fale com a equipe da Vórtice. Pelo chamado, você acompanha cada resposta e a situação do seu pedido.</p>
          </div>
          <div className={styles.supportActions}>
            <Link className={styles.primaryBtn} href="/suporte?novo=1">
              <Send size={16} /> Abrir chamado
            </Link>
            <Link className={styles.secondaryBtn} href="/suporte">
              <Ticket size={16} /> Meus chamados
            </Link>
            {whatsappLink && (
              <a className={styles.secondaryBtn} href={whatsappLink} target="_blank" rel="noopener noreferrer">
                <MessageCircle size={16} /> WhatsApp
              </a>
            )}
            {data.contact?.email && (
              <a className={styles.secondaryBtn} href={`mailto:${data.contact.email}?subject=${encodeURIComponent('Ajuda com o vtec os')}`}>
                <Mail size={16} /> E-mail
              </a>
            )}
          </div>
        </section>
      )}

      <footer className={styles.footer}>
        <Link href="/politica-de-privacidade">Política de Privacidade</Link>
      </footer>

    </div>
  );
}
