import { Calendar, Layout, Pencil, Sparkles, Users as UsersIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import styles from '../master.module.css';
import { BANNER_PRESET_ICONS } from '../constants';
import type { BannerItem } from '../types';

interface BannersTabProps {
  banners: BannerItem[];
  bannerLoading: boolean;
  error: string;
  onEditBanner: (banner: BannerItem) => void;
}

const ROLE_SHORT: Record<string, string> = { ADMIN: 'Admins', MANAGER: 'Gerentes', SELLER: 'Vendedores' };

export default function BannersTab({ banners, bannerLoading, error, onEditBanner }: BannersTabProps) {
  return (
    <motion.div
      key="banners"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
    >
      <p className={styles.hint} style={{ margin: 0 }}>
        Os banners aparecem no carrossel da tela Início de todas as empresas. Clique em um card para editar.
      </p>

      {error && <div className={styles.errorBanner}>{error}</div>}

      {bannerLoading ? (
        <div className={styles.emptyState}>Carregando banners...</div>
      ) : banners.length === 0 ? (
        <div className={styles.emptyState}>
          <Layout size={36} />
          <strong>Nenhum banner criado ainda</strong>
          <span>Clique em &quot;Novo banner&quot; para criar o primeiro.</span>
        </div>
      ) : (
        <div className={styles.bannerGrid}>
          {banners.map((banner) => {
            const IconComp = BANNER_PRESET_ICONS.find(i => i.id === banner.iconName)?.icon || Sparkles;
            const roles = banner.target_roles ?? [];
            const audience = roles.length === 0 ? 'Todos' : roles.map(role => ROLE_SHORT[role] || role).join(', ');
            return (
              <button
                key={banner.id}
                type="button"
                className={styles.bannerCard}
                style={{ background: banner.color }}
                onClick={() => onEditBanner(banner)}
              >
                <div className={styles.bannerBgIcon}><IconComp size={100} /></div>
                <div className={styles.bannerTop}>
                  <span className={styles.bannerBadge}>{banner.type}</span>
                  <span className={styles.bannerEdit}><Pencil size={11} /> Editar</span>
                </div>
                <h3>{banner.title}</h3>
                <p>{banner.description}</p>
                <div className={styles.bannerMeta}>
                  {banner.date && <span><Calendar size={11} /> {banner.date}</span>}
                  <span><UsersIcon size={11} /> {audience}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
