import styles from '../discador.module.css';
import { CONTACT_STATUS_LABEL, type ContactStatus, type StatusCounts } from '@/lib/dialer/types';
import { STATUS_COLOR } from './shared';

const ORDER: ContactStatus[] = ['completed', 'connected', 'dialing', 'no_answer', 'busy', 'voicemail', 'abandoned', 'failed'];

/** Barra colorida com o resultado das ligações + legenda. */
export default function CampaignProgress({ counts, total }: { counts: StatusCounts; total: number }) {
  const done = total - (counts.pending || 0);
  return (
    <div className={styles.progress}>
      <div className={styles.bar} role="img" aria-label={`${done} de ${total} contatos já ligados`}>
        {ORDER.filter((status) => counts[status]).map((status) => (
          <span key={status} style={{ width: `${((counts[status] || 0) / Math.max(1, total)) * 100}%`, background: STATUS_COLOR[status] }} />
        ))}
      </div>
      <div className={styles.legend}>
        <span><strong>{done}</strong> de {total} ligados</span>
        {ORDER.filter((status) => counts[status]).map((status) => (
          <span key={status}><i style={{ background: STATUS_COLOR[status] }} />{CONTACT_STATUS_LABEL[status]}: {counts[status]}</span>
        ))}
        {counts.pending ? <span>Na fila: {counts.pending}</span> : null}
      </div>
    </div>
  );
}
