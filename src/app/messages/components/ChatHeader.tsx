import { ArrowLeft, Ban, Bot, BotOff, Info, Shuffle } from 'lucide-react';
import type { ComponentProps } from 'react';
import styles from '../messages.module.css';
import type { Lead } from '@/types';
import { initials } from '../format';
import SystemToolsBar from './SystemToolsBar';
import ChannelAvatar from './ChannelBadge';

/** Telefone, ou o @ do Instagram / "Messenger" nas conversas de lá. */
function contactLine(lead: Lead) {
  if (lead.chatChannel === 'instagram') return lead.instagramUsername ? `@${lead.instagramUsername}` : 'Instagram';
  if (lead.chatChannel === 'messenger') return lead.phone || 'Messenger';
  return lead.phone || 'Sem telefone';
}

interface ChatHeaderProps {
  lead: Lead;
  ownerName: string | null;
  canTransfer: boolean;
  channelLabel: string | null;
  onBack: () => void;
  onTransfer: () => void;
  onInfo: () => void;
  /** IA pausada nesta conversa (botão "Pausar IA" / "Retomar IA"). */
  aiPaused: boolean;
  aiBusy: boolean;
  onToggleAi: () => void;
  tools: ComponentProps<typeof SystemToolsBar>;
}

export default function ChatHeader({ lead, ownerName, canTransfer, channelLabel, onBack, onTransfer, onInfo, aiPaused, aiBusy, onToggleAi, tools }: ChatHeaderProps) {
  return (
    <header className={styles.chatHead}>
      <button type="button" className={`${styles.iconBtn} ${styles.backBtn}`} onClick={onBack} aria-label="Voltar para as conversas"><ArrowLeft size={18} /></button>
      <button type="button" className={styles.chatWho} onClick={onInfo} title="Ver dados do lead">
        <ChannelAvatar lead={lead} initials={initials(lead.name)} />
        <span>
          <strong>{lead.name}{lead.status === 'Bloqueado' && <Ban size={13} className={styles.blockedIcon} aria-label="Bloqueado" />}</strong>
          <small>{contactLine(lead)}{ownerName ? ` · com ${ownerName}` : ' · sem responsável'}{channelLabel ? ` · ${channelLabel}` : ''}</small>
        </span>
      </button>
      <div className={styles.chatActions}>
        <button
          type="button"
          className={`${styles.secondaryBtn} ${aiPaused ? styles.aiPausedBtn : ''}`}
          onClick={onToggleAi}
          disabled={aiBusy}
          aria-pressed={aiPaused}
          title={aiPaused
            ? 'O Atendente com IA está pausado nesta conversa. Clique para ele voltar a responder.'
            : 'Pausa o Atendente com IA nesta conversa até você retomar. Quando alguém da equipe responde, ele também pausa sozinho por um tempo.'}
        >
          {aiPaused ? <BotOff size={15} /> : <Bot size={15} />} <span className={styles.hideSm}>{aiPaused ? 'Retomar IA' : 'Pausar IA'}</span>
        </button>
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
