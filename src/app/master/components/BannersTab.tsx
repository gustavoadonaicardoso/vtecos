import { ArrowDown, ArrowUp, Calendar, Layout, Link2, Pencil, Sparkles, Users as UsersIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import styles from '../master.module.css';
import { BANNER_PRESET_ICONS } from '../constants';
import { AUDIENCE_LABEL, destinationLabel } from '@/lib/banners';
import type { BannerItem } from '../types';

interface BannersTabProps {
  banners: BannerItem[];
  bannerLoading: boolean;
  error: string;
  onEditBanner: (banner: BannerItem) => void;
  onMove: (banner: BannerItem, direction: -1 | 1) => void;
}

const ROLE_SHORT: Record<string, string> = { ADMIN: 'Admins', MANAGER: 'Gerentes', SELLER: 'Vendedores' };

/** No ar, agendado, encerrado ou desligado. */
function bannerState(banner: BannerItem) {
  const now = new Date().toISOString();
  if (!banner.active) return { label: 'Desligado', tone: 'off' };
  if (banner.startsAt && banner.startsAt > now) return { label: `A partir de ${new Date(banner.startsAt).toLocaleDateString('pt-BR')}`, tone: 'soon' };
  if (banner.endsAt && banner.endsAt < now) return { label: 'Encerrado', tone: 'off' };
  return { label: banner.endsAt ? `No ar até ${new Date(banner.endsAt).toLocaleDateString('pt-BR')}` : 'No ar', tone: 'on' };
}

export default function BannersTab({ banners, bannerLoading, error, onEditBanner, onMove }: BannersTabProps) {
  return (
    <motion.div
      key="banners"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
    >
      <p className={styles.hint} style={{ margin: 0 }}>
        Os banners aparecem no carrossel da tela Início, na ordem abaixo, para o público escolhido em cada um. Clique em um card para editar.
      </p>

      {error && <div className={styles.errorBanner}>{error}</div>}

      {bannerLoading && banners.length === 0 ? (
        <div className={styles.emptyState}>Carregando banners...</div>
      ) : banners.length === 0 ? (
        <div className={styles.emptyState}>
          <Layout size={36} />
          <strong>Nenhum banner criado ainda</strong>
          <span>Clique em &quot;Novo banner&quot; para criar o primeiro.</span>
        </div>
      ) : (
        <div className={styles.bannerGrid}>
          {banners.map((banner, index) => {
            const IconComp = BANNER_PRESET_ICONS.find(i => i.id === banner.iconName)?.icon || Sparkles;
            const roles = banner.target_roles ?? [];
            const audience = [
              banner.audience === 'tenants' ? `${banner.targetTenants.length} empresa(s)` : AUDIENCE_LABEL[banner.audience],
              roles.length ? roles.map(role => ROLE_SHORT[role] || role).join(', ') : '',
              banner.targetModules.length ? `com ${banner.targetModules.join(', ')}` : '',
            ].filter(Boolean).join(' · ');
            const state = bannerState(banner);
            return (
              <div key={banner.id} className={styles.bannerSlot}>
                <button
                  type="button"
                  className={`${styles.bannerCard} ${state.tone === 'off' ? styles.bannerOff : ''}`}
                  style={{ background: banner.imageUrl ? `linear-gradient(90deg, rgba(2,6,23,.78), rgba(2,6,23,.25)), url("${banner.imageUrl}") center/cover` : banner.color }}
                  onClick={() => onEditBanner(banner)}
                >
                  {!banner.imageUrl && <div className={styles.bannerBgIcon}><IconComp size={100} /></div>}
                  <div className={styles.bannerTop}>
                    <span className={styles.bannerBadge}>{banner.type || 'Banner'}</span>
                    <span className={`${styles.bannerState} ${styles[`state_${state.tone}`]}`}>{state.label}</span>
                  </div>
                  <h3>{banner.title}</h3>
                  <p>{banner.description}</p>
                  <div className={styles.bannerMeta}>
                    <span><Link2 size={11} /> {destinationLabel(banner.linkUrl)}</span>
                    <span><UsersIcon size={11} /> {audience}</span>
                    {banner.date && <span><Calendar size={11} /> {banner.date}</span>}
                  </div>
                  <span className={styles.bannerEdit}><Pencil size={11} /> Editar</span>
                </button>
                <div className={styles.bannerOrder}>
                  <button type="button" aria-label="Mostrar antes" disabled={index === 0} onClick={() => onMove(banner, -1)}><ArrowUp size={14} /></button>
                  <span>{index + 1}º</span>
                  <button type="button" aria-label="Mostrar depois" disabled={index === banners.length - 1} onClick={() => onMove(banner, 1)}><ArrowDown size={14} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
