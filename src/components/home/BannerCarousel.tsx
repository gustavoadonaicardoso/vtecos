"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowRight, Calendar, ExternalLink, X } from 'lucide-react';
import styles from './BannerCarousel.module.css';
import { BANNER_ICON_MAP } from './bannerIcons';
import { isExternalLink, type HomeBanner } from '@/lib/banners';

interface BannerCarouselProps {
  /** Já filtrados pelo servidor (empresa, plano, cargo e período). */
  banners: HomeBanner[];
}

const DISMISSED_KEY = 'vtec_dismissed_banners';

function readDismissed(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(DISMISSED_KEY) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export default function BannerCarousel({ banners }: BannerCarouselProps) {
  const router = useRouter();
  // Banners que a pessoa fechou neste aparelho.
  const [dismissed, setDismissed] = useState<string[]>(() => (typeof window === 'undefined' ? [] : readDismissed()));
  const visible = banners.filter((banner) => !dismissed.includes(banner.id));

  if (visible.length === 0) return null;

  const open = (banner: HomeBanner) => {
    if (!banner.linkUrl) return;
    if (isExternalLink(banner.linkUrl)) window.open(banner.linkUrl, '_blank', 'noopener,noreferrer');
    else router.push(banner.linkUrl);
  };

  const dismiss = (banner: HomeBanner) => {
    const next = [...dismissed, banner.id];
    setDismissed(next);
    try {
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(next.slice(-100)));
    } catch {}
  };

  return (
    <section className={styles.section} aria-label="Banners e comunicados">
      <div className={styles.scroll}>
        {visible.map((banner, idx) => {
          const IconComp = banner.iconName ? BANNER_ICON_MAP[banner.iconName] : null;
          const clickable = Boolean(banner.linkUrl);
          const external = clickable && isExternalLink(banner.linkUrl!);
          return (
            <motion.div
              key={banner.id}
              className={`${styles.card} ${clickable ? styles.clickable : ''} ${visible.length === 1 ? styles.single : ''}`}
              style={{
                background: banner.imageUrl
                  ? `linear-gradient(90deg, rgba(2,6,23,.82), rgba(2,6,23,.2)), url("${banner.imageUrl}") center/cover`
                  : banner.color,
              }}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.08 }}
              onClick={() => open(banner)}
              role={clickable ? 'link' : undefined}
              tabIndex={clickable ? 0 : undefined}
              onKeyDown={(e) => clickable && e.key === 'Enter' && open(banner)}
              aria-label={banner.title}
            >
              {!banner.imageUrl && (
                <div className={styles.iconOverlay} aria-hidden>
                  {IconComp ? <IconComp size={120} /> : <span style={{ fontSize: 100 }}>✨</span>}
                </div>
              )}

              {banner.dismissible && (
                <button type="button" className={styles.dismiss} onClick={(e) => { e.stopPropagation(); dismiss(banner); }} aria-label={`Fechar o banner ${banner.title}`}>
                  <X size={14} />
                </button>
              )}

              <div className={styles.cardContent}>
                {banner.badge && <span className={styles.cardType}>{banner.badge}</span>}
                <h3 className={styles.cardTitle}>{banner.title}</h3>
                {banner.description && <p className={styles.cardDesc}>{banner.description}</p>}
                <div className={styles.cardFooter}>
                  {banner.date && <span className={styles.cardDate}><Calendar size={13} /> {banner.date}</span>}
                  {clickable && (
                    <span className={styles.actionBtn}>
                      {banner.buttonLabel || 'Saiba mais'} {external ? <ExternalLink size={14} /> : <ArrowRight size={14} />}
                    </span>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
