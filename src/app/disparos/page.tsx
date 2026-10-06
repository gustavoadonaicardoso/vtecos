'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CalendarClock, Clock, Loader2, Megaphone, Plus, UserX } from 'lucide-react';
import styles from './disparos.module.css';
import { api, dateTime, percent, Progress, StatusBadge } from './components/Bits';
import OptoutsModal from './components/OptoutsModal';
import type { CampaignStatus, CampaignSummary } from '@/lib/disparos';

type Filter = 'all' | 'active' | 'scheduled' | 'draft' | 'done';
const FILTERS: { id: Filter; label: string; match: (status: CampaignStatus) => boolean }[] = [
  { id: 'all', label: 'Todas', match: () => true },
  { id: 'active', label: 'Em andamento', match: (status) => status === 'running' || status === 'paused' },
  { id: 'scheduled', label: 'Agendadas', match: (status) => status === 'scheduled' },
  { id: 'draft', label: 'Rascunhos', match: (status) => status === 'draft' },
  { id: 'done', label: 'Encerradas', match: (status) => status === 'completed' || status === 'canceled' },
];

interface Options { channels: { web: boolean; api: boolean }; worker: boolean }

export default function DisparosPage() {
  const [campaigns, setCampaigns] = useState<CampaignSummary[] | null>(null);
  const [options, setOptions] = useState<Options | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [optouts, setOptouts] = useState(false);
  const [now] = useState(() => Date.now());

  const load = useCallback(async () => {
    const result = await api<CampaignSummary[]>('/api/disparos/campaigns');
    if (result.data) setCampaigns(result.data);
    setError(result.error || '');
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      load();
      api<Options>('/api/disparos/options').then((result) => setOptions(result.data || null));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  // Enquanto alguma campanha envia, atualiza sozinho.
  const live = Boolean(campaigns?.some((item) => item.status === 'running' || item.status === 'scheduled'));
  useEffect(() => {
    if (!live) return;
    const timer = window.setInterval(load, 10000);
    return () => window.clearInterval(timer);
  }, [live, load]);

  const stats = useMemo(() => {
    const list = campaigns || [];
    const since = now - 30 * 86400_000;
    const recent = list.filter((item) => new Date(item.created_at).getTime() >= since);
    const sent = recent.reduce((sum, item) => sum + item.counts.sent, 0);
    const replied = recent.reduce((sum, item) => sum + item.counts.replied, 0);
    return {
      running: list.filter((item) => item.status === 'running').length,
      scheduled: list.filter((item) => item.status === 'scheduled').length,
      sent,
      replied,
      optouts: recent.reduce((sum, item) => sum + item.counts.optouts, 0),
      failed: recent.reduce((sum, item) => sum + item.counts.failed, 0),
    };
  }, [campaigns, now]);

  const shown = (campaigns || []).filter((item) => FILTERS.find((entry) => entry.id === filter)!.match(item.status));
  const noChannel = options && !options.channels.web && !options.channels.api;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1><Megaphone size={26} /> Disparos</h1>
          <p>Campanhas de WhatsApp para uma planilha ou para leads do CRM. O servidor envia sozinho, no ritmo e no horário que você escolher, mesmo com o sistema fechado.</p>
        </div>
        <div className={styles.headerActions}>
          <button type="button" className={styles.secondaryBtn} onClick={() => setOptouts(true)}><UserX size={16} /> Descadastrados</button>
          <Link href="/disparos/nova" className={styles.primaryBtn}><Plus size={16} /> Nova campanha</Link>
        </div>
      </header>

      {options && !options.worker && (
        <div className={styles.banner}><AlertTriangle size={16} /><span>O envio automático está desligado neste servidor (<code>CONTENT_SCHEDULER_ENABLED</code>). As campanhas ficam na fila até ele ser ligado.</span></div>
      )}
      {noChannel && (
        <div className={styles.banner}><AlertTriangle size={16} /><span>Nenhum WhatsApp conectado. <Link href="/integrations">Conecte em Integrações</Link> antes de enviar.</span></div>
      )}
      {error && <div className={styles.errorBox}><AlertTriangle size={16} /><span>{error}</span></div>}

      <div className={styles.stats}>
        <div className={styles.stat}><span>Enviando agora</span><strong>{stats.running}</strong><small>{stats.scheduled} agendada(s)</small></div>
        <div className={`${styles.stat} ${styles.statOk}`}><span>Mensagens enviadas</span><strong>{stats.sent.toLocaleString('pt-BR')}</strong><small>campanhas dos últimos 30 dias</small></div>
        <div className={styles.stat}><span>Responderam</span><strong>{stats.replied.toLocaleString('pt-BR')}</strong><small>{percent(stats.replied, stats.sent)} de quem recebeu</small></div>
        <div className={`${styles.stat} ${stats.optouts ? styles.statWarn : ''}`}><span>Pediram para sair</span><strong>{stats.optouts}</strong><small>{stats.failed} envio(s) com falha</small></div>
      </div>

      <div className={styles.filters}>
        {FILTERS.map((item) => (
          <button key={item.id} type="button" className={`${styles.chip} ${filter === item.id ? styles.chipOn : ''}`} onClick={() => setFilter(item.id)}>
            {item.label} <b>{(campaigns || []).filter((campaign) => item.match(campaign.status)).length}</b>
          </button>
        ))}
      </div>

      {campaigns === null && !error ? (
        <div className={styles.loading}><Loader2 size={20} className={styles.spin} /> Carregando campanhas...</div>
      ) : campaigns && campaigns.length === 0 ? (
        <div className={styles.empty}>
          <Megaphone size={40} />
          <h2>Nenhuma campanha ainda</h2>
          <p>Importe uma planilha ou escolha leads do CRM, escreva a mensagem com variáveis e deixe o servidor enviar no ritmo certo.</p>
          <Link href="/disparos/nova" className={styles.primaryBtn}><Plus size={16} /> Criar a primeira campanha</Link>
        </div>
      ) : shown.length === 0 ? (
        <div className={styles.empty}><p>Nenhuma campanha neste filtro.</p></div>
      ) : (
        <div className={styles.campaignGrid}>
          {shown.map((item) => {
            const done = item.counts.sent + item.counts.failed + item.counts.skipped;
            return (
              <Link key={item.id} href={`/disparos/${item.id}`} className={styles.campaignCard}>
                <div className={styles.campaignTop}>
                  <div className={styles.grow}>
                    <h3>{item.name}</h3>
                    <p>{item.template || '—'}</p>
                  </div>
                  <StatusBadge status={item.status} />
                </div>
                {item.last_error && item.status === 'paused' ? (
                  <span className={`${styles.detailLine} ${styles.detailBad}`}><AlertTriangle size={13} /> {item.last_error}</span>
                ) : item.status_detail ? (
                  <span className={styles.detailLine}><Clock size={13} /> {item.status_detail}</span>
                ) : item.status === 'scheduled' ? (
                  <span className={styles.detailLine}><CalendarClock size={13} /> Começa {dateTime(item.scheduled_at)}</span>
                ) : null}
                <Progress counts={item.counts} />
                <div className={styles.metrics}>
                  <div><strong>{item.counts.pending}</strong><span>Na fila</span></div>
                  <div><strong>{item.counts.sent}</strong><span>Enviadas</span></div>
                  <div><strong>{item.counts.failed}</strong><span>Falhas</span></div>
                  <div><strong>{percent(item.counts.replied, item.counts.sent)}</strong><span>Respostas</span></div>
                </div>
                <div className={styles.cardFoot}>
                  <span className={styles.channelTag}>{item.channel === 'api' ? 'API oficial' : 'WhatsApp Web'}</span>
                  <span>{done}/{item.counts.total} · {dateTime(item.started_at || item.created_at)}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {optouts && <OptoutsModal onClose={() => setOptouts(false)} />}
    </div>
  );
}
