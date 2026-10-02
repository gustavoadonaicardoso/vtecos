"use client";

import React, { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, CalendarDays, Link2, ListChecks, Plus } from 'lucide-react';
import styles from './social.module.css';
import { useAuth } from '@/context/AuthContext';
import ContentCalendar from './components/ContentCalendar';
import PostList from './components/PostList';
import AccountsPanel from './components/AccountsPanel';
import PostComposer from './components/PostComposer';
import type { SocialAccount, SocialPost } from '@/types';

type Tab = 'calendario' | 'posts' | 'contas';

const TABS: Array<{ id: Tab; label: string; icon: React.ComponentType<{ size?: number }> }> = [
  { id: 'calendario', label: 'Calendário', icon: CalendarDays },
  { id: 'posts', label: 'Posts', icon: ListChecks },
  { id: 'contas', label: 'Contas', icon: Link2 },
];

function SocialPageContent() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get('tab') as Tab) || 'calendario';

  const [tab, setTab] = useState<Tab>(TABS.some((t) => t.id === initialTab) ? initialTab : 'calendario');
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [metaConfigured, setMetaConfigured] = useState(true);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [composer, setComposer] = useState<{ post: SocialPost | null; date: Date | null } | null>(null);

  const isAdmin = user?.role === 'ADMIN';

  const load = useCallback(async () => {
    try {
      const [accountsResponse, postsResponse] = await Promise.all([
        fetch('/api/social/accounts', { cache: 'no-store' }),
        fetch('/api/social/posts', { cache: 'no-store' }),
      ]);
      const accountsResult = await accountsResponse.json().catch(() => ({}));
      const postsResult = await postsResponse.json().catch(() => ({}));

      if (!accountsResponse.ok || !postsResponse.ok) {
        setLoadError(accountsResult.error || postsResult.error || 'Não foi possível carregar o módulo.');
        return;
      }

      setLoadError('');
      setAccounts(accountsResult.data || []);
      setMetaConfigured(Boolean(accountsResult.metaConfigured));
      setPosts(postsResult.data || []);
    } catch {
      setLoadError('Falha de conexão ao carregar as redes sociais.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  // Enquanto houver post publicando, atualiza sozinho pra mostrar o resultado.
  useEffect(() => {
    if (!posts.some((post) => post.status === 'publishing')) return;
    const timer = setTimeout(load, 5000);
    return () => clearTimeout(timer);
  }, [posts, load]);

  const changeTab = (next: Tab) => {
    setTab(next);
    router.replace(`/social?tab=${next}`);
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Redes Sociais</h1>
          <p className={styles.subtitle}>
            Crie, organize e agende posts para o Instagram e o Facebook da empresa em um só lugar.
          </p>
        </div>
        <button
          type="button"
          className={styles.primaryButton}
          onClick={() => setComposer({ post: null, date: null })}
          disabled={accounts.length === 0}
          title={accounts.length === 0 ? 'Conecte uma conta primeiro' : undefined}
        >
          <Plus size={18} /> Criar post
        </button>
      </header>

      <nav className={styles.tabs}>
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className={`${styles.tab} ${tab === id ? styles.activeTab : ''}`}
            onClick={() => changeTab(id)}
          >
            <Icon size={16} /> {label}
          </button>
        ))}
      </nav>

      {loading ? (
        <div className={styles.emptyState}><p>Carregando…</p></div>
      ) : loadError ? (
        <div className={`${styles.banner} ${styles.bannerError}`}>
          <AlertTriangle size={18} /> {loadError}
        </div>
      ) : (
        <>
          {tab === 'calendario' && (
            <ContentCalendar
              posts={posts}
              accounts={accounts}
              onDayClick={(date) => accounts.length > 0 && setComposer({ post: null, date })}
              onPostClick={(post) => setComposer({ post, date: null })}
            />
          )}
          {tab === 'posts' && (
            <PostList posts={posts} accounts={accounts} onEdit={(post) => setComposer({ post, date: null })} onChanged={load} />
          )}
          {tab === 'contas' && (
            <AccountsPanel
              accounts={accounts}
              metaConfigured={metaConfigured}
              isAdmin={isAdmin}
              oauthError={searchParams.get('oauth_error')}
              connectedCount={searchParams.get('connected')}
              onChanged={load}
            />
          )}
        </>
      )}

      {composer && (
        <PostComposer
          post={composer.post}
          initialDate={composer.date}
          accounts={accounts}
          onClose={() => setComposer(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}

export default function SocialPage() {
  return (
    <Suspense fallback={null}>
      <SocialPageContent />
    </Suspense>
  );
}
