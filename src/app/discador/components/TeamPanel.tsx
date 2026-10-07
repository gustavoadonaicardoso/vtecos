'use client';

import { Users } from 'lucide-react';
import styles from '../discador.module.css';
import { AGENT_STATUS_LABEL, type TeamAgent } from '@/lib/dialer/types';
import { clock } from './shared';

/** Quem está com o Discador aberto agora. */
export default function TeamPanel({ agents, now }: { agents: TeamAgent[]; now: number }) {
  const available = agents.filter((agent) => agent.status === 'available').length;
  return (
    <section className={styles.card}>
      <div className={styles.cardHead}>
        <h2><Users size={18} /> Equipe agora</h2>
        <span className={styles.hint}>{available} disponível(is)</span>
      </div>
      {agents.length === 0 ? (
        <p className={styles.empty}>Ninguém com o Discador aberto. As campanhas só ligam quando há alguém disponível.</p>
      ) : (
        <div className={styles.team}>
          {agents.map((agent) => (
            <div key={agent.profileId} className={styles.agent}>
              <span className={styles.avatar}>{agent.name.charAt(0).toUpperCase()}</span>
              <div className={styles.agentInfo}>
                <strong>{agent.name}</strong>
                <span>
                  {AGENT_STATUS_LABEL[agent.status]} · {clock((now - new Date(agent.since).getTime()) / 1000)}
                  {agent.contactName ? ` · ${agent.contactName}` : ''}
                </span>
              </div>
              <span className={styles.dot} data-status={agent.status} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
