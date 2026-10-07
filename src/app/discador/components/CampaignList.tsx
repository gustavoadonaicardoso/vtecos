'use client';

import { ListOrdered, Loader2, Pause, Play, Plus } from 'lucide-react';
import styles from '../discador.module.css';
import { CAMPAIGN_STATUS_LABEL, type DialerCampaign } from '@/lib/dialer/types';
import CampaignProgress from './CampaignProgress';

interface Props {
  campaigns: DialerCampaign[] | null;
  busyId: string | null;
  onNew: () => void;
  onOpen: (id: string) => void;
  onAction: (id: string, action: 'start' | 'pause') => void;
}

/** Campanhas da empresa (administradores e gerentes). */
export default function CampaignList({ campaigns, busyId, onNew, onOpen, onAction }: Props) {
  return (
    <section className={styles.card}>
      <div className={styles.cardHead}>
        <h2><ListOrdered size={18} /> Campanhas</h2>
        <button type="button" className={styles.primaryBtn} onClick={onNew}><Plus size={16} /> Nova campanha</button>
      </div>
      {!campaigns && <p className={styles.hint}><Loader2 size={14} className={styles.spin} /> Carregando…</p>}
      {campaigns && campaigns.length === 0 && (
        <p className={styles.empty}>Nenhuma campanha ainda. Suba uma planilha com nome e telefone para o discador começar a ligar.</p>
      )}
      <div className={styles.campaigns}>
        {(campaigns || []).map((campaign) => {
          const busy = busyId === campaign.id;
          const canStart = campaign.status !== 'running' && (campaign.counts.pending || 0) > 0;
          return (
            <article key={campaign.id} className={styles.campaign}>
              <div>
                <div className={styles.campaignName}>
                  <button type="button" onClick={() => onOpen(campaign.id)}>{campaign.name}</button>
                  <span className={styles.pill} data-status={campaign.status}>{CAMPAIGN_STATUS_LABEL[campaign.status]}</span>
                </div>
                <span className={styles.hint}>
                  {campaign.callsPerAgent} ligação(ões) por atendente · toca {campaign.ringSeconds}s{campaign.detectVoicemail ? ' · detecta caixa postal' : ''}
                </span>
              </div>
              <div className={styles.campaignActions}>
                {campaign.status === 'running' ? (
                  <button type="button" className={styles.secondaryBtn} disabled={busy} onClick={() => onAction(campaign.id, 'pause')}>
                    {busy ? <Loader2 size={15} className={styles.spin} /> : <Pause size={15} />} Pausar
                  </button>
                ) : canStart ? (
                  <button type="button" className={styles.callBtn} disabled={busy} onClick={() => onAction(campaign.id, 'start')}>
                    {busy ? <Loader2 size={15} className={styles.spin} /> : <Play size={15} />} {campaign.status === 'draft' ? 'Começar' : 'Retomar'}
                  </button>
                ) : null}
                <button type="button" className={styles.ghostBtn} onClick={() => onOpen(campaign.id)}>Detalhes</button>
              </div>
              <CampaignProgress counts={campaign.counts} total={campaign.total} />
              {campaign.lastError && <p className={styles.campaignError}>Pausada: {campaign.lastError}</p>}
            </article>
          );
        })}
      </div>
    </section>
  );
}
