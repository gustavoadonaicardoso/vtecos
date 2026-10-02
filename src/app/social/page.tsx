"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, BarChart3, CalendarDays, Link2, ListChecks, Plus, Settings2 } from 'lucide-react';
import styles from './social.module.css';
import { useAuth } from '@/context/AuthContext';
import ContentCalendar from './components/ContentCalendar';
import PostList from './components/PostList';
import AccountsPanel from './components/AccountsPanel';
import PostComposer from './components/PostComposer';
import InsightsPanel from './components/InsightsPanel';
import SettingsPanel from './components/SettingsPanel';
import type { SocialAccount, SocialPost, SocialProjectOption, SocialSettings } from '@/types';

type Tab = 'calendario' | 'posts' | 'insights' | 'contas' | 'configuracoes';

const TABS: Array<{ id: Tab; label: string; icon: React.ComponentType<{ size?: number }> }> = [
  { id: 'calendario', label: 'Calendário', icon: CalendarDays },
  { id: 'posts', label: 'Posts', icon: ListChecks },
  { id: 'insights', label: 'Insights', icon: BarChart3 },
  { id: 'contas', label: 'Contas', icon: Link2 },
  { id: 'configuracoes', label: 'Configurações', icon: Settings2 },
];

const DEFAULT_SETTINGS: SocialSettings = { requireApproval: true, defaultAccountIds: [] };

function SocialPageContent() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get('tab') as Tab) || 'calendario';

  const [tab, setTab] = useState<Tab>(TABS.some((t) => t.id === initialTab) ? initialTab : 'calendario');
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [metaConfigured, setMetaConfigured] = useState(true);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [projects, setProjects] = useState<SocialProjectOption[]>([]);
  const [settings, setSettings] = useState<SocialSettings>(DEFAULT_SETTINGS);
  const [projectFilter, setProjectFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [composer, setComposer] = useState<{ post: SocialPost | null; date: Date | null } | null>(null);

  const isAdmin = user?.role === 'ADMIN';
  const canApprove = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const needsApproval = settings.requireApproval && !canApprove;

  const load = useCallback(async () => {
    try {
      const [accountsResponse, postsResponse, settingsResponse, projectsResponse] = await Promise.all([
        fetch('/api/social/accounts', { cache: 'no-store' }),
        fetch('/api/social/posts', { cache: 'no-store' }),
        fetch('/api/social/settings', { cache: 'no-store' }),
        fetch('/api/social/projects', { cache: 'no-store' }),
      ]);
      const accountsResult = await accountsResponse.json().catch(() => ({}));
      const postsResult = await postsResponse.json().catch(() => ({}));
      const settingsResult = await settingsResponse.json().catch(() => ({}));
      const projectsResult = await projectsResponse.json().catch(() => ({}));

      if (!accountsResponse.ok || !postsResponse.ok) {
        setLoadError(accountsResult.error || postsResult.error || 'Não foi possível carregar o módulo.');
        return;
      }

      setLoadError('');
      setAccounts(accountsResult.data || []);
      setMetaConfigured(Boolean(accountsResult.metaConfigured));
      setPosts(postsResult.data || []);
      // Configurações e projetos são complementares: se falharem, o módulo segue com o padrão.
      if (settingsResponse.ok && settingsResult.data) setSettings(settingsResult.data);
      if (projectsResponse.ok) setProjects(projectsResult.data || []);
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

  const visiblePosts = useMemo(
    () => (projectFilter ? posts.filter((post) => post.project_id === projectFilter) : posts),
    [posts, projectFilter]
  );
  const pendingCount = posts.filter((post) => post.status === 'pending_approval').length;

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
        <div className={styles.pageToolbar}>
          {projects.length > 0 && (tab === 'calendario' || tab === 'posts') && (
            <select
              className={styles.select}
              value={projectFilter}
              onChange={(event) => setProjectFilter(event.target.value)}
              aria-label="Filtrar por projeto"
            >
              <option value="">Todos os projetos</option>
              {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
          )}
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => setComposer({ post: null, date: null })}
            disabled={accounts.length === 0}
            title={accounts.length === 0 ? 'Conecte uma conta primeiro' : undefined}
          >
            <Plus size={18} /> Criar post
          </button>
        </div>
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
            {id === 'posts' && canApprove && pendingCount > 0 && (
              <span className={styles.tabCount} title="Aguardando aprovação">{pendingCount}</span>
            )}
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
          {canApprove && pendingCount > 0 && tab === 'calendario' && (
            <div className={`${styles.banner} ${styles.bannerInfo}`}>
              <div>
                {pendingCount === 1 ? '1 post aguarda' : `${pendingCount} posts aguardam`} sua aprovação.{' '}
                <a href="/social?tab=posts&status=pending_approval" onClick={(event) => { event.preventDefault(); changeTab('posts'); }}>
                  Revisar agora
                </a>
              </div>
            </div>
          )}
          {tab === 'calendario' && (
            <ContentCalendar
              posts={visiblePosts}
              accounts={accounts}
              onDayClick={(date) => accounts.length > 0 && setComposer({ post: null, date })}
              onPostClick={(post) => setComposer({ post, date: null })}
            />
          )}
          {tab === 'posts' && (
            <PostList
              key={searchParams.get('status') || 'all'}
              posts={visiblePosts}
              accounts={accounts}
              projects={projects}
              canApprove={canApprove}
              initialStatus={searchParams.get('status') || (canApprove && pendingCount > 0 ? 'pending_approval' : null)}
              onEdit={(post) => setComposer({ post, date: null })}
              onChanged={load}
            />
          )}
          {tab === 'insights' && <InsightsPanel accounts={accounts} />}
          {tab === 'contas' && (
            <AccountsPanel
              accounts={accounts}
              projects={projects}
              metaConfigured={metaConfigured}
              isAdmin={isAdmin}
              oauthError={searchParams.get('oauth_error')}
              connectedCount={searchParams.get('connected')}
              onChanged={load}
            />
          )}
          {tab === 'configuracoes' && (
            <SettingsPanel settings={settings} accounts={accounts} isAdmin={isAdmin} onSaved={setSettings} />
          )}
        </>
      )}

      {composer && (
        <PostComposer
          post={composer.post}
          initialDate={composer.date}
          accounts={accounts}
          projects={projects}
          settings={settings}
          needsApproval={needsApproval}
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
