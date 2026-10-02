"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { BarChart3, ExternalLink, ImageIcon, RefreshCw } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import styles from '../social.module.css';
import { formatDateTime, formatMetric } from '../status';
import type { SocialAccount, SocialAccountInsights, SocialMetrics } from '@/types';

const SUMMARY_CARDS: Array<{ key: keyof SocialMetrics; label: string; platforms?: Array<SocialAccount['platform']> }> = [
  { key: 'followers', label: 'Seguidores' },
  { key: 'reach', label: 'Alcance' },
  { key: 'views', label: 'Visualizações' },
  { key: 'interactions', label: 'Interações' },
  { key: 'likes', label: 'Curtidas', platforms: ['instagram'] },
  { key: 'comments', label: 'Comentários', platforms: ['instagram'] },
  { key: 'saves', label: 'Salvamentos', platforms: ['instagram'] },
  { key: 'follows', label: 'Novos seguidores', platforms: ['facebook'] },
];

function accountLabel(account: SocialAccount) {
  return account.platform === 'instagram' ? `@${account.username || account.name}` : account.name;
}

export default function InsightsPanel({ accounts }: { accounts: SocialAccount[] }) {
  const activeAccounts = accounts.filter((account) => account.status === 'active');
  const [accountId, setAccountId] = useState(activeAccounts[0]?.id ?? '');
  const [days, setDays] = useState(7);
  const [data, setData] = useState<SocialAccountInsights | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const account = accounts.find((item) => item.id === accountId);

  const load = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/social/insights?accountId=${accountId}&days=${days}`, { cache: 'no-store' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setData(null);
        setError(result.error || 'Não foi possível carregar os insights.');
        return;
      }
      setData(result.data);
    } catch {
      setError('Falha de conexão ao buscar os insights.');
    } finally {
      setLoading(false);
    }
  }, [accountId, days]);

  useEffect(() => {
    load();
  }, [load]);

  if (activeAccounts.length === 0) {
    return (
      <div className={styles.panel}>
        <div className={styles.emptyState}>
          <BarChart3 size={36} opacity={0.5} />
          <p>Conecte uma conta na aba Contas para ver os resultados.</p>
        </div>
      </div>
    );
  }

  const cards = SUMMARY_CARDS.filter((card) => !card.platforms || (account && card.platforms.includes(account.platform)));
  const chartData = (data?.series || []).map((point) => ({
    ...point,
    label: new Date(`${point.date}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className={styles.panel}>
        <div className={styles.calendarToolbar} style={{ marginBottom: 0 }}>
          <div className={styles.pageToolbar}>
            <select className={styles.select} value={accountId} onChange={(event) => setAccountId(event.target.value)} aria-label="Conta">
              {activeAccounts.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.platform === 'instagram' ? 'Instagram' : 'Facebook'} · {accountLabel(item)}
                </option>
              ))}
            </select>
            <div className={styles.segmented}>
              {[7, 30].map((value) => (
                <button key={value} type="button" className={days === value ? styles.segmentActive : ''} onClick={() => setDays(value)}>
                  {value} dias
                </button>
              ))}
            </div>
          </div>
          <div className={styles.pageToolbar}>
            {data && (
              <span className={styles.subtitle} style={{ margin: 0, fontSize: '0.75rem' }}>
                Atualizado {formatDateTime(data.fetchedAt)}
              </span>
            )}
            <button type="button" className={styles.iconButton} onClick={load} disabled={loading} aria-label="Atualizar" title="Atualizar">
              <RefreshCw size={14} />
            </button>
          </div>
        </div>
      </div>

      {error && <div className={`${styles.banner} ${styles.bannerError}`}>{error}</div>}
      {loading && !data && <div className={styles.emptyState}><p>Buscando dados na Meta…</p></div>}

      {data && (
        <>
          <div className={styles.metricsGrid}>
            {cards.map((card) => (
              <div key={card.key} className={styles.metricCard}>
                <span>{card.label}</span>
                <strong>{formatMetric(data.totals[card.key])}</strong>
              </div>
            ))}
          </div>

          <div className={styles.panel}>
            <h3 className={styles.sectionTitle}>Alcance por dia</h3>
            {chartData.length === 0 ? (
              <p className={styles.subtitle}>A Meta não devolveu a série diária para esta conta neste período.</p>
            ) : (
              <div className={styles.chartBox}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                    <defs>
                      <linearGradient id="socialReach" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.2)" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.6} />
                    <YAxis tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.6} allowDecimals={false} />
                    <Tooltip formatter={(value) => [Number(value).toLocaleString('pt-BR'), 'Alcance']} />
                    <Area type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} fill="url(#socialReach)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className={styles.panel}>
            <h3 className={styles.sectionTitle}>Posts do período (feitos pelo Vórtice)</h3>
            {data.topPosts.length === 0 ? (
              <p className={styles.subtitle}>Nenhum post publicado por aqui nos últimos {data.days} dias.</p>
            ) : (
              data.topPosts.map((post, index) => (
                <div key={post.targetId} className={styles.postRow}>
                  {post.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={post.thumbnail} alt="" className={styles.thumb} />
                  ) : (
                    <div className={styles.thumb}><ImageIcon size={20} /></div>
                  )}
                  <div className={styles.postMain}>
                    <p className={styles.postCaption}><strong>#{index + 1}</strong> {post.caption || 'Sem legenda'}</p>
                    <div className={styles.inlineMetrics}>
                      <span>{formatDateTime(post.publishedAt)}</span>
                      <span>Alcance <b>{formatMetric(post.metrics.reach)}</b></span>
                      <span>Interações <b>{formatMetric(post.metrics.interactions)}</b></span>
                      <span>Curtidas <b>{formatMetric(post.metrics.likes)}</b></span>
                      <span>Comentários <b>{formatMetric(post.metrics.comments)}</b></span>
                    </div>
                  </div>
                  <div className={styles.rowActions}>
                    {post.permalink && (
                      <a href={post.permalink} target="_blank" rel="noopener noreferrer" className={styles.secondaryButton}>
                        <ExternalLink size={13} /> Ver
                      </a>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          <p className={styles.subtitle} style={{ fontSize: '0.75rem' }}>
            “—” indica uma métrica que a Meta não disponibiliza para esta conta. Os números podem levar até 48h para
            se consolidar na Meta.
          </p>
        </>
      )}
    </div>
  );
}
