"use client";

import React from 'react';
import styles from '../social.module.css';
import PlatformIcon from './PlatformIcon';
import type { SocialAccount, SocialMediaItem } from '@/types';

interface PostPreviewProps {
  account: SocialAccount;
  caption: string;
  media: SocialMediaItem[];
}

/** Aproximação visual de como o post aparece no feed -- não é o render oficial da rede. */
export default function PostPreview({ account, caption, media }: PostPreviewProps) {
  const first = media[0];
  const handle = account.platform === 'instagram' ? account.username || account.name : account.name;

  return (
    <div className={styles.previewCard}>
      <div className={styles.previewHeader}>
        {account.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={account.avatar_url} alt="" className={styles.previewAvatar} />
        ) : (
          <span className={styles.previewAvatar} />
        )}
        <span style={{ flex: 1 }}>{handle}</span>
        <PlatformIcon platform={account.platform} />
      </div>

      {account.platform === 'facebook' && caption && <div className={styles.previewCaption}>{caption}</div>}

      {first ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={first.url} alt="" className={styles.previewImage} />
      ) : (
        account.platform === 'instagram' && <div className={styles.previewEmptyImage}>Adicione uma imagem</div>
      )}

      {media.length > 1 && (
        <div className={styles.previewDots}>
          {media.map((item, index) => (
            <span key={item.url} className={index === 0 ? styles.dotActive : ''} />
          ))}
        </div>
      )}

      {account.platform === 'instagram' && (
        <div className={styles.previewCaption}>
          <strong>{handle}</strong> {caption || <span style={{ color: '#9ca3af' }}>Sua legenda aparece aqui</span>}
        </div>
      )}
    </div>
  );
}
