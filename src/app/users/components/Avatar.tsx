import styles from '../users.module.css';
import { avatarColor, initials } from '../constants';

export default function Avatar({ id, name, url, size = 40, online }: { id: string; name: string; url?: string | null; size?: number; online?: boolean }) {
  return (
    <span className={styles.avatar} style={{ width: size, height: size, fontSize: size * 0.38, background: url ? undefined : avatarColor(id) }}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" />
      ) : (
        initials(name)
      )}
      {online !== undefined && <i className={online ? styles.dotOnline : styles.dotOffline} aria-hidden />}
    </span>
  );
}
