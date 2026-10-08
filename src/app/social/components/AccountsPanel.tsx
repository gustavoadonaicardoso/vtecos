"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { Link2, MessageCircle, Unlink } from 'lucide-react';
import styles from '../social.module.css';
import PlatformIcon from './PlatformIcon';
import type { SocialAccount, SocialProjectOption } from '@/types';

interface AccountsPanelProps {
  accounts: SocialAccount[];
  projects: SocialProjectOption[];
  metaConfigured: boolean;
  isAdmin: boolean;
  oauthError: string | null;
  connectedCount: string | null;
  onChanged: () => void;
}

export default function AccountsPanel({ accounts, projects, metaConfigured, isAdmin, oauthError, connectedCount, onChanged }: AccountsPanelProps) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const disconnect = async (account: SocialAccount) => {
    if (!confirm(`Desconectar ${account.name}? Posts agendados para esta conta vão falhar até ela ser reconectada.`)) return;
    setBusyId(account.id);
    setError('');
    const response = await fetch(`/api/social/accounts/${account.id}`, { method: 'DELETE' });
    setBusyId(null);
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      setError(result.error || 'Não foi possível desconectar.');
    }
    onChanged();
  };

  const linkProject = async (account: SocialAccount, projectId: string) => {
    setBusyId(account.id);
    setError('');
    const response = await fetch(`/api/social/accounts/${account.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: projectId || null }),
    });
    setBusyId(null);
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      setError(result.error || 'Não foi possível vincular o projeto.');
    }
    onChanged();
  };

  const enableMessaging = async (account: SocialAccount) => {
    setBusyId(account.id);
    setError('');
    const response = await fetch(`/api/social/accounts/${account.id}/messaging`, { method: 'POST' });
    setBusyId(null);
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      setError(result.error || 'Não foi possível ligar as mensagens.');
    }
    onChanged();
  };

  const projectName = (id: string | null) => (id ? projects.find((project) => project.id === id)?.name || 'Projeto removido' : null);

  return (
    <div className={styles.panel} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {oauthError && <div className={`${styles.banner} ${styles.bannerError}`}>{oauthError}</div>}
      {connectedCount && (
        <div className={`${styles.banner} ${styles.bannerSuccess}`}>
          Conexão concluída: {connectedCount} conta(s) atualizadas.
        </div>
      )}
      {error && <div className={`${styles.banner} ${styles.bannerError}`}>{error}</div>}

      {!metaConfigured && (
        <div className={`${styles.banner} ${styles.bannerInfo}`}>
          <div>
            O app da Meta ainda não está configurado no servidor. Siga o passo a passo em{' '}
            <Link href="/help/conectar-redes-sociais">Central de Ajuda → Conectar Instagram e Facebook</Link> e depois
            volte aqui para conectar as contas.
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <strong>Contas conectadas</strong>
          <p className={styles.subtitle} style={{ fontSize: '0.85rem' }}>
            Páginas do Facebook e os perfis profissionais do Instagram vinculados a elas.
          </p>
        </div>
        {isAdmin ? (
          metaConfigured ? (
            // Navegação completa (não fetch): a Meta precisa redirecionar o navegador.
            <a href="/api/social/oauth/start" className={styles.primaryButton}>
              <Link2 size={16} /> {accounts.length > 0 ? 'Reconectar / adicionar contas' : 'Conectar com Facebook'}
            </a>
          ) : (
            <button type="button" className={styles.primaryButton} disabled>
              <Link2 size={16} /> Conectar com Facebook
            </button>
          )
        ) : (
          <span className={styles.subtitle} style={{ fontSize: '0.8rem' }}>Só administradores conectam contas.</span>
        )}
      </div>

      {accounts.length === 0 ? (
        <div className={styles.emptyState}>
          <Link2 size={32} opacity={0.5} />
          <p>Nenhuma conta conectada ainda.</p>
        </div>
      ) : (
        <div className={styles.accountsGrid}>
          {accounts.map((account) => (
            <div key={account.id} className={styles.accountCard}>
              {account.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={account.avatar_url} alt="" className={styles.avatar} />
              ) : (
                <span className={styles.avatar}><PlatformIcon platform={account.platform} size={18} /></span>
              )}
              <div className={styles.accountInfo}>
                <strong>{account.platform === 'instagram' ? `@${account.username || account.name}` : account.name}</strong>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <PlatformIcon platform={account.platform} size={11} />
                  {account.platform === 'instagram' ? 'Instagram' : 'Página do Facebook'}
                  {account.status === 'error' && <span style={{ color: '#ef4444' }}> · precisa reconectar</span>}
                </span>
                {account.status === 'error' && account.last_error && (
                  <p className={styles.targetError} title={account.last_error}>{account.last_error}</p>
                )}
                {'messaging_status' in account && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 4, fontSize: '0.78rem', color: account.messaging_status === 'on' ? '#10b981' : account.messaging_status === 'error' ? '#ef4444' : 'var(--text-secondary)' }}>
                    <MessageCircle size={12} />
                    {account.messaging_status === 'on'
                      ? `${account.platform === 'instagram' ? 'Direct' : 'Messenger'} chegando em Mensagens`
                      : account.messaging_status === 'error'
                        ? 'Mensagens desligadas'
                        : 'Mensagens ainda não ligadas'}
                  </span>
                )}
                {account.messaging_status === 'error' && account.messaging_error && (
                  <p className={styles.targetError} title={account.messaging_error}>{account.messaging_error}</p>
                )}
                {isAdmin && 'messaging_status' in account && account.messaging_status !== 'on' && (
                  <button type="button" className={styles.secondaryButton} style={{ marginTop: 8 }} disabled={busyId === account.id} onClick={() => enableMessaging(account)}>
                    <MessageCircle size={14} /> Ligar mensagens
                  </button>
                )}
                {isAdmin ? (
                  <select
                    className={styles.select}
                    style={{ marginTop: 8, width: '100%' }}
                    value={account.project_id ?? ''}
                    disabled={busyId === account.id}
                    onChange={(event) => linkProject(account, event.target.value)}
                    aria-label={`Projeto de ${account.name}`}
                  >
                    <option value="">Sem projeto vinculado</option>
                    {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                  </select>
                ) : (
                  account.project_id && <span className={styles.projectPill} style={{ marginTop: 6 }}>{projectName(account.project_id)}</span>
                )}
              </div>
              {isAdmin && (
                <button
                  type="button"
                  className={styles.iconButton}
                  onClick={() => disconnect(account)}
                  disabled={busyId === account.id}
                  aria-label={`Desconectar ${account.name}`}
                  title="Desconectar"
                >
                  <Unlink size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
