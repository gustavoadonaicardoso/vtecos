"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Plus, Trash2, Check, Flame, Rocket, Star, Zap as ZapIcon, 
  Shield, Globe, Award, Sparkles, MapPin, Clock, Info, X, Save, Palette, Type
} from 'lucide-react';
import styles from './admin.module.css';

import { supabase } from '@/lib/supabase';

interface Banner {
  id?: string;
  title: string;
  description: string;
  date: string;
  type: string;
  color: string;
  iconName?: string;
  location?: string;
  time?: string;
  fullInfo?: string;
}

const PRESET_COLORS = [
  'linear-gradient(135deg, #3b82f6, #8b5cf6)',
  'linear-gradient(135deg, #10b981, #059669)',
  'linear-gradient(135deg, #f59e0b, #d97706)',
  'linear-gradient(135deg, #ef4444, #991b1b)',
  'linear-gradient(135deg, #8b5cf6, #d946ef)',
  'linear-gradient(135deg, #1e293b, #0f172a)',
  'linear-gradient(135deg, #06b6d4, #0891b2)',
  'linear-gradient(135deg, #6366f1, #4f46e5)',
];

const PRESET_ICONS = [
  { id: 'zap', icon: ZapIcon },
  { id: 'flame', icon: Flame },
  { id: 'rocket', icon: Rocket },
  { id: 'star', icon: Star },
  { id: 'shield', icon: Shield },
  { id: 'globe', icon: Globe },
  { id: 'award', icon: Award },
  { id: 'sparkles', icon: Sparkles },
];

const DEFAULT_BANNERS: Banner[] = [];

export default function AdminBanners() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBanners();
  }, []);

  const fetchBanners = async () => {
    if (!supabase) return;
    setLoading(true);
    const { data } = await supabase.from('platform_banners').select('*').order('created_at');
    if (data && data.length > 0) {
      setBanners(data.map(b => ({
        id: b.id,
        title: b.title,
        description: b.description,
        date: b.date_string,
        type: b.badge_type,
        color: b.color_gradient,
        iconName: b.icon_name,
        location: b.location,
        time: b.time,
        fullInfo: b.fullInfo
      })));
    } else {
      const saved = localStorage.getItem('vortice_banners');
      if (saved) setBanners(JSON.parse(saved));
    }
    setLoading(false);
  };

  const saveToDisk = async (newBanners: Banner[]) => {
    setBanners(newBanners);
    
    if (supabase) {
      // Logic: Delete all and re-insert for simple sync, or better: upsert
      // To keep it simple for the user as a "Update All" action:
      await supabase.from('platform_banners').delete().neq('id', '00000000-0000-0000-0000-000000000000'); // clear all
      
      const dbRows = newBanners.map(b => ({
        title: b.title,
        description: b.description,
        date_string: b.date,
        badge_type: b.type,
        color_gradient: b.color,
        icon_name: b.iconName,
        location: b.location,
        time: b.time,
        fullInfo: b.fullInfo
      }));

      await supabase.from('platform_banners').insert(dbRows);
    }

    localStorage.setItem('vortice_banners', JSON.stringify(newBanners));
    setSuccess(true);
    setTimeout(() => setSuccess(false), 2000);
  };


  const updateBannerField = (idx: number, field: keyof Banner, val: string) => {
    const next = [...banners];
    next[idx] = { ...next[idx], [field]: val };
    setBanners(next);
  };

  const addBanner = () => {
    const next = [...banners, {
      title: "Novo Destaque",
      description: "Dê uma breve descrição do anúncio.",
      date: "Disponível agora",
      type: "Destaque Master",
      color: PRESET_COLORS[2],
      iconName: 'sparkles',
      location: 'Brasil',
      time: 'A combinar',
      fullInfo: ''
    }];
    saveToDisk(next);
    setEditingIdx(next.length - 1);
  };

  const removeBanner = (idx: number) => {
    if (confirm('Deseja remover este destaque permanentemente?')) {
      const next = banners.filter((_, i) => i !== idx);
      saveToDisk(next);
      setEditingIdx(null);
    }
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.titleArea}>
          <h1>Vitrina Inteligente: Painel Master</h1>
          <p>Selecione um evento para editar detalhes de local, horário e conteúdo.</p>
        </div>
        
        <button className={styles.addBtn} onClick={addBanner}>
          <Plus size={18} /> Novo Destaque
        </button>
      </header>

      {success && !editingIdx && (
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className={styles.saveAlert}>
          <Check size={16} /> Vitrine Atualizada!
        </motion.div>
      )}

      <div className={styles.displayGrid}>
        {banners.map((banner, idx) => {
          const IconComp = PRESET_ICONS.find(i => i.id === (banner.iconName || 'zap'))?.icon || ZapIcon;
          return (
            <motion.div 
              key={idx} 
              className={styles.displayCard}
              style={{ background: banner.color }}
              onClick={() => setEditingIdx(idx)}
              whileHover={{ scale: 1.02, y: -5 }}
              layoutId={`banner-${idx}`}
            >
              <div className={styles.cardHeader}>
                <span className={styles.badge}>{banner.type}</span>
                <span className={styles.date}>{banner.date}</span>
              </div>
              <h3 className={styles.title}>{banner.title}</h3>
              <p className={styles.desc}>{banner.description}</p>
              
              <div className={styles.cardIcon}>
                <IconComp size={80} strokeWidth={1} />
              </div>
              
              <div className={styles.editHint}>Clique para editar detalhes</div>
            </motion.div>
          );
        })}
      </div>

      <AnimatePresence>
        {editingIdx !== null && (
          <div className={styles.modalBackdrop}>
            <motion.div 
              className={styles.editModal}
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
            >
              <div className={styles.modalHeader}>
                <h2>Editar Evento / Destaque</h2>
                <button className={styles.closeBtn} onClick={() => setEditingIdx(null)}>
                  <X size={24} />
                </button>
              </div>

              <div className={styles.modalContent}>
                <div className={styles.modalSection}>
                  <label><Type size={16} /> Título e Categoria</label>
                  <div className={styles.inputRow}>
                    <input 
                      value={banners[editingIdx].title} 
                      onChange={(e) => updateBannerField(editingIdx, 'title', e.target.value)}
                      placeholder="Nome do Evento"
                    />
                    <input 
                      value={banners[editingIdx].type} 
                      onChange={(e) => updateBannerField(editingIdx, 'type', e.target.value)}
                      placeholder="Ex: ONLINE • GRATUITO"
                    />
                  </div>
                </div>

                <div className={styles.modalSection}>
                  <label><Clock size={16} /> Datas e Horários</label>
                  <div className={styles.inputRow}>
                    <input 
                      value={banners[editingIdx].date} 
                      onChange={(e) => updateBannerField(editingIdx, 'date', e.target.value)}
                      placeholder="Data Principal"
                    />
                    <input 
                      value={banners[editingIdx].time} 
                      onChange={(e) => updateBannerField(editingIdx, 'time', e.target.value || '')}
                      placeholder="Horário (ex: 19:00)"
                    />
                  </div>
                </div>

                <div className={styles.modalSection}>
                  <label><MapPin size={16} /> Localização / Link</label>
                  <input 
                    value={banners[editingIdx].location} 
                    onChange={(e) => updateBannerField(editingIdx, 'location', e.target.value || '')}
                    placeholder="Endereço físico ou link da reunião"
                  />
                </div>

                <div className={styles.modalSection}>
                  <label><Info size={16} /> Informações Detalhadas</label>
                  <textarea 
                    value={banners[editingIdx].description} 
                    onChange={(e) => updateBannerField(editingIdx, 'description', e.target.value)}
                    rows={2}
                    placeholder="Descrição curta para o card..."
                  />
                  <textarea 
                    value={banners[editingIdx].fullInfo} 
                    onChange={(e) => updateBannerField(editingIdx, 'fullInfo', e.target.value || '')}
                    rows={3}
                    placeholder="Instruções adicionais e detalhes (Opcional)"
                  />
                </div>

                <div className={styles.modalSection}>
                   <label><Palette size={16} /> Estilo & Identidade</label>
                   <div className={styles.styleOptions}>
                      <div className={styles.colorPicks}>
                        {PRESET_COLORS.map(c => (
                          <div 
                            key={c} 
                            className={`${styles.colorTick} ${banners[editingIdx].color === c ? styles.activeTick : ''}`}
                            style={{ background: c }}
                            onClick={() => updateBannerField(editingIdx, 'color', c)}
                          />
                        ))}
                      </div>
                      <div className={styles.iconPicks}>
                         {PRESET_ICONS.map(({ id, icon: Ico }) => (
                           <div 
                             key={id} 
                             className={`${styles.iconTick} ${banners[editingIdx].iconName === id ? styles.activeTick : ''}`}
                             onClick={() => updateBannerField(editingIdx, 'iconName', id)}
                           >
                             <Ico size={18} />
                           </div>
                         ))}
                      </div>
                   </div>
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button className={styles.deleteBtn} onClick={() => removeBanner(editingIdx)}>
                  <Trash2 size={18} /> Remover Destaque
                </button>
                <button className={styles.finalSaveBtn} onClick={() => {
                  saveToDisk(banners);
                  setEditingIdx(null);
                }}>
                  <Save size={18} /> Confirmar Alterações
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
