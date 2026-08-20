"use client";

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, X, Send, CheckCircle2, Megaphone, Sparkles } from 'lucide-react';
import type { PlatformBanner, UserProfile } from '@/types';
import styles from './BannerCarousel.module.css';

// Map de ícones preset (ícones são serializáveis via string)
const PRESET_ICONS: Record<string, React.ComponentType<{ size?: number; color?: string }>> = {
  sparkles: Sparkles,
  megaphone: Megaphone,
};

interface BannerCarouselProps {
  banners: PlatformBanner[];
  user: UserProfile | null;
}

function filterBannersForUser(banners: PlatformBanner[], user: UserProfile | null): PlatformBanner[] {
  if (!user) return [];
  return banners.filter(b => {
    const roles = b.target_roles ?? [];
    // [] vazio = exibir para todos; caso contrário verifica a role do usuário
    return roles.length === 0 || roles.includes(user.role);
  });
}

function BannerModal({
  banner,
  onClose,
}: {
  banner: PlatformBanner;
  onClose: () => void;
}) {
  const [submitted, setSubmitted] = React.useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setTimeout(onClose, 2000);
  };

  const IconComp = banner.iconName ? PRESET_ICONS[banner.iconName] : null;

  return (
    <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal="true">
      <motion.div
        className={styles.modal}
        initial={{ opacity: 0, scale: 0.92, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: 20 }}
        onClick={e => e.stopPropagation()}
      >
        <button className={styles.closeBtn} onClick={onClose} aria-label="Fechar">
          <X size={20} />
        </button>

        {!submitted ? (
          <>
            <div className={styles.modalIconWrapper} style={{ background: banner.color }}>
              {IconComp
                ? <IconComp size={32} color="white" />
                : <Calendar size={32} color="white" />
              }
            </div>
            <span className={styles.modalBadge}>{banner.type}</span>
            <h3 className={styles.modalTitle}>{banner.title}</h3>
            <p className={styles.modalDesc}>{banner.description}</p>

            <form className={styles.form} onSubmit={handleSubmit}>
              <div className={styles.field}>
                <label htmlFor="banner-name">Nome Completo</label>
                <input id="banner-name" type="text" placeholder="Como deseja ser chamado?" required />
              </div>
              <div className={styles.field}>
                <label htmlFor="banner-email">E-mail Corporativo</label>
                <input id="banner-email" type="email" placeholder="seu@email.com" required />
              </div>
              <button type="submit" className={styles.submitBtn} style={{ background: banner.color }}>
                <Send size={16} />
                Confirmar Inscrição
              </button>
            </form>
          </>
        ) : (
          <motion.div
            className={styles.successState}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <CheckCircle2 size={56} color="#10b981" />
            <h3>Inscrição confirmada!</h3>
            <p>Você receberá as informações em breve.</p>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}

export default function BannerCarousel({ banners, user }: BannerCarouselProps) {
  const [selectedBanner, setSelectedBanner] = React.useState<PlatformBanner | null>(null);
  const filtered = filterBannersForUser(banners, user);

  if (filtered.length === 0) return null;

  return (
    <>
      <section className={styles.section} aria-label="Banners e comunicados">
        <div className={styles.scroll}>
          {filtered.map((banner, idx) => {
            const IconComp = banner.iconName ? PRESET_ICONS[banner.iconName] : null;

            return (
              <motion.div
                key={banner.id ?? idx}
                className={styles.card}
                style={{ background: banner.color }}
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.08 }}
                onClick={() => setSelectedBanner(banner)}
                role="button"
                tabIndex={0}
                onKeyDown={e => e.key === 'Enter' && setSelectedBanner(banner)}
                aria-label={`Banner: ${banner.title}`}
              >
                {/* Background icon overlay */}
                <div className={styles.iconOverlay} aria-hidden>
                  {IconComp
                    ? <IconComp size={120} />
                    : <span style={{ fontSize: 100 }}>✨</span>
                  }
                </div>

                <div className={styles.cardContent}>
                  <span className={styles.cardType}>{banner.type}</span>
                  <h3 className={styles.cardTitle}>{banner.title}</h3>
                  <p className={styles.cardDesc}>{banner.description}</p>
                  <div className={styles.cardFooter}>
                    <Calendar size={13} />
                    <span>{banner.date}</span>
                  </div>
                </div>

                <button
                  className={styles.actionBtn}
                  onClick={e => { e.stopPropagation(); setSelectedBanner(banner); }}
                  aria-label={`Saber mais sobre ${banner.title}`}
                >
                  Saber mais
                </button>
              </motion.div>
            );
          })}
        </div>
      </section>

      <AnimatePresence>
        {selectedBanner && (
          <BannerModal
            banner={selectedBanner}
            onClose={() => setSelectedBanner(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
