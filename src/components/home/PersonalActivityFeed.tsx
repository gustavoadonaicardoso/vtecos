"use client";

import React from 'react';
import { motion } from 'framer-motion';
import {
  TrendingUp,
  MessageCircle,
  Users,
  DollarSign,
  Clock,
  Zap,
  Activity,
  ChevronRight,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { ActivityItem } from '@/types';
import styles from './PersonalActivityFeed.module.css';

const ICON_MAP: Record<string, React.ComponentType<{ size?: number }>> = {
  trending: TrendingUp,
  message: MessageCircle,
  users: Users,
  dollar: DollarSign,
  clock: Clock,
  zap: Zap,
  activity: Activity,
};

interface PersonalActivityFeedProps {
  userId: string;
  userName: string;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (minutes < 1) return 'agora mesmo';
  if (minutes < 60) return `${minutes}min atrás`;
  if (hours < 24) return `${hours}h atrás`;
  return `${days}d atrás`;
}

const EMPTY_TIPS = [
  'Abra uma nova conversa no Chat para começar a atender.',
  'Acesse o Pipeline e mova seus leads para avançar no funil.',
  'Use os Disparos para entrar em contato com leads inativos.',
];

export default function PersonalActivityFeed({ userId, userName }: PersonalActivityFeedProps) {
  const [activities, setActivities] = React.useState<ActivityItem[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!userId || !supabase) {
      setLoading(false);
      return;
    }

    const fetchActivities = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('system_updates')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(8);

      if (data && data.length > 0) {
        setActivities(data);
      } else {
        // Fallback: mostra atividades gerais do usuário pelo nome
        const { data: byName } = await supabase
          .from('system_updates')
          .select('*')
          .ilike('user_name', `%${userName.split(' ')[0]}%`)
          .order('created_at', { ascending: false })
          .limit(8);
        setActivities(byName ?? []);
      }
      setLoading(false);
    };

    fetchActivities();

    // Realtime subscription para atividades do usuário
    const channel = supabase
      .channel(`personal_feed_${userId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'system_updates',
      }, (payload) => {
        const row = payload.new as ActivityItem;
        if ((row as any).user_id === userId) {
          setActivities(prev => [row, ...prev.slice(0, 7)]);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId, userName]);

  return (
    <section className={styles.section} aria-label="Suas atividades recentes">
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <Activity size={18} className={styles.headerIcon} />
          <h3 className={styles.title}>Suas Atividades</h3>
        </div>
        <span className={styles.badge}>Tempo real</span>
      </div>

      {loading ? (
        <div className={styles.skeletonList}>
          {[...Array(4)].map((_, i) => (
            <div key={i} className={styles.skeletonItem}>
              <div className={styles.skeletonIcon} />
              <div className={styles.skeletonLines}>
                <div className={styles.skeletonLine} style={{ width: '70%' }} />
                <div className={styles.skeletonLine} style={{ width: '40%' }} />
              </div>
            </div>
          ))}
        </div>
      ) : activities.length > 0 ? (
        <div className={styles.list}>
          {activities.map((act, idx) => {
            const IconComp = act.icon_name && ICON_MAP[act.icon_name]
              ? ICON_MAP[act.icon_name]
              : TrendingUp;

            return (
              <motion.div
                key={act.id ?? idx}
                className={styles.item}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.06 }}
              >
                <div className={styles.iconCell}>
                  <IconComp size={15} />
                </div>
                <div className={styles.itemContent}>
                  <p className={styles.itemText}>
                    <strong>{act.user_name}</strong>{' '}
                    {act.action}
                    {act.target && (
                      <span className={styles.target}> "{act.target}"</span>
                    )}
                  </p>
                  <span className={styles.itemTime}>{timeAgo(act.created_at)}</span>
                </div>
              </motion.div>
            );
          })}
        </div>
      ) : (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>
            <Zap size={28} />
          </div>
          <h4>Nenhuma atividade registrada ainda</h4>
          <p>Comece a interagir com o sistema e seu histórico aparecerá aqui.</p>
          <div className={styles.tipsList}>
            {EMPTY_TIPS.map((tip, i) => (
              <div key={i} className={styles.tip}>
                <ChevronRight size={13} />
                <span>{tip}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
