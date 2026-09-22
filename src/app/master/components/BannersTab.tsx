import { Layout, Users as UsersIcon, Sparkles } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { BANNER_PRESET_ICONS } from '../constants';
import type { BannerItem } from '../types';
import BannerEditModal from './BannerEditModal';

interface BannersTabProps {
  banners: BannerItem[];
  bannerLoading: boolean;
  editingBannerIdx: number | null;
  onEditBanner: (idx: number | null) => void;
  onUpdateField: (idx: number, field: keyof BannerItem, value: any) => void;
  onToggleRole: (idx: number, role: string) => void;
  onSaveBanner: (idx: number) => void;
  onRemoveBanner: (idx: number) => void;
}

export default function BannersTab({ banners, bannerLoading, editingBannerIdx, onEditBanner, onUpdateField, onToggleRole, onSaveBanner, onRemoveBanner }: BannersTabProps) {
  return (
    <motion.div
      key="banners"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      style={{ width: '100%' }}
    >
      {/* Banner List */}
      {bannerLoading ? (
        <div style={{ textAlign: 'center', padding: '3rem', opacity: 0.5 }}>Carregando banners...</div>
      ) : banners.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', opacity: 0.5 }}>
          <Layout size={40} style={{ margin: '0 auto 1rem', display: 'block' }} />
          <p>Nenhum banner criado ainda.</p>
          <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>Clique em &quot;Novo Banner&quot; para começar.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
          {banners.map((banner, idx) => {
            const IconComp = BANNER_PRESET_ICONS.find(i => i.id === banner.iconName)?.icon || Sparkles;
            const audienceLabel = banner.target_roles?.length === 0
              ? 'Todos'
              : banner.target_roles?.join(', ');
            return (
              <motion.div
                key={banner.id ?? idx}
                style={{
                  background: banner.color,
                  borderRadius: 16,
                  padding: '1.5rem',
                  position: 'relative',
                  color: 'white',
                  cursor: 'pointer',
                  overflow: 'hidden',
                  minHeight: 160,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
                }}
                whileHover={{ scale: 1.02, y: -4 }}
                onClick={() => onEditBanner(idx)}
              >
                <div style={{ position: 'absolute', right: -10, bottom: -16, opacity: 0.12, transform: 'rotate(-12deg)' }}>
                  <IconComp size={100} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', background: 'rgba(255,255,255,0.2)', padding: '3px 10px', borderRadius: 100 }}>
                    {banner.type}
                  </span>
                  <span style={{ fontSize: '0.7rem', opacity: 0.85, fontWeight: 600 }}>{banner.date}</span>
                </div>
                <h3 style={{ fontWeight: 700, marginBottom: 6, fontSize: '1.1rem' }}>{banner.title}</h3>
                <p style={{ fontSize: '0.82rem', opacity: 0.88, marginBottom: 12, lineHeight: 1.4 }}>{banner.description}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', background: 'rgba(0,0,0,0.2)', padding: '3px 10px', borderRadius: 100, width: 'fit-content' }}>
                  <UsersIcon size={11} />
                  <span>{audienceLabel}</span>
                </div>
                <button
                  style={{ position: 'absolute', top: 12, right: 12, background: 'rgba(255,255,255,0.9)', border: 'none', borderRadius: 8, padding: '5px 10px', fontSize: '0.72rem', fontWeight: 700, color: '#111', cursor: 'pointer' }}
                  onClick={(e) => { e.stopPropagation(); onEditBanner(idx); }}
                >
                  Editar
                </button>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Edit Modal */}
      <AnimatePresence>
        {editingBannerIdx !== null && banners[editingBannerIdx] && (
          <BannerEditModal
            banner={banners[editingBannerIdx]}
            onUpdateField={(field, value) => onUpdateField(editingBannerIdx, field, value)}
            onToggleRole={(role) => onToggleRole(editingBannerIdx, role)}
            onClose={() => onEditBanner(null)}
            onRemove={() => onRemoveBanner(editingBannerIdx)}
            onSave={() => onSaveBanner(editingBannerIdx)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
