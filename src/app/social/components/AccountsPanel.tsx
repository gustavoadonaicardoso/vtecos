"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { Link2, Unlink } from 'lucide-react';
import styles from '../social.module.css';
import PlatformIcon from './PlatformIcon';
import type { SocialAccount } from '@/types';

interface AccountsPanelProps {
  accounts: SocialAccount[];
  metaConfigured: boolean;
  isAdmin: boolean;
  oauthError: string | null;
  connectedCount: string | null;
  onChanged: () => void;
}

export default function AccountsPanel({ accounts, metaConfigured, isAdmin, oauthError, connectedCount, onChanged }: AccountsPanelProps) {
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
