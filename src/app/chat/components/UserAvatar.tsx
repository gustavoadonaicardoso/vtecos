"use client";

import React, { useState } from 'react';
import styles from '../chat.module.css';
import { getInitials } from '../utils';

/**
 * Foto do perfil quando existe; iniciais quando não há foto ou a imagem
 * não carrega (link quebrado, arquivo removido).
 */
export default function UserAvatar({ name, avatarUrl }: { name: string; avatarUrl?: string | null }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  if (avatarUrl && failedUrl !== avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={avatarUrl} alt="" className={styles.avatarImage} onError={() => setFailedUrl(avatarUrl)} />
    );
  }
  return <>{getInitials(name)}</>;
}
