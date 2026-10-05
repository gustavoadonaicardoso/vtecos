import { ArrowLeft, Ban, Info, Shuffle } from 'lucide-react';
import type { ComponentProps } from 'react';
import styles from '../messages.module.css';
import type { Lead } from '@/types';
import { initials } from '../format';
import SystemToolsBar from './SystemToolsBar';

interface ChatHeaderProps {
  lead: Lead;
  ownerName: string | null;
  canTransfer: boolean;
  channelLabel: string | null;
  onBack: () => void;
  onTransfer: () => void;
  onInfo: () => void;
  tools: ComponentProps<typeof SystemToolsBar>;
}

export default function ChatHeader({ lead, ownerName, canTransfer, channelLabel, onBack, onTransfer, onInfo, tools }: ChatHeaderProps) {
  return (
    <header className={styles.chatHead}>
      <button type="button" className={`${styles.iconBtn} ${styles.backBtn}`} onClick={onBack} aria-label="Voltar para as conversas"><ArrowLeft size={18} /></button>
      <button type="button" className={styles.chatWho} onClick={onInfo} title="Ver dados do lead">
        <span className={styles.avatar}>{initials(lead.name)}</span>
        <span>
          <strong>{lead.name}{lead.status === 'Bloqueado' && <Ban size={13} className={styles.blockedIcon} aria-label="Bloqueado" />}</strong>
          <small>{lead.phone || 'Sem telefone'}{ownerName ? ` · com ${ownerName}` : ' · sem responsável'}{channelLabel ? ` · ${channelLabel}` : ''}</small>
        </span>
      </button>
      <div className={styles.chatActions}>
        {canTransfer && (
          <button type="button" className={styles.secondaryBtn} onClick={onTransfer} title="Passar a conversa para outra pessoa">
            <Shuffle size={15} /> <span className={styles.hideSm}>Transferir</span>
          </button>
        )}
        <button type="button" className={styles.iconBtn} onClick={onInfo} aria-label="Dados do lead"><Info size={18} /></button>
        <div className={styles.hideSm}><SystemToolsBar {...tools} /></div>
      </div>
    </header>
  );
}
