import { SiInstagram, SiMessenger } from 'react-icons/si';
import styles from '../messages.module.css';
import type { Lead } from '@/types';

/** Avatar da conversa com o ícone do canal (Instagram ou Messenger) no canto. */
export default function ChannelAvatar({ lead, initials }: { lead: Lead; initials: string }) {
  const channel = lead.chatChannel;
  return (
    <span className={styles.avatarWrap}>
      <span className={styles.avatar}>{initials}</span>
      {channel === 'instagram' && <span className={styles.channelBadge} title="Direct do Instagram"><SiInstagram size={11} color="#E4405F" aria-label="Instagram" /></span>}
      {channel === 'messenger' && <span className={styles.channelBadge} title="Messenger"><SiMessenger size={11} color="#0084FF" aria-label="Messenger" /></span>}
    </span>
  );
}
