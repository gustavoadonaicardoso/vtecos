"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { 
  ShieldAlert, 
  Settings, 
  Layout, 
  Users, 
  Database, 
  ChevronRight, 
  Zap,
  ClipboardList,
  Activity,
  UserPlus,
  Target
} from 'lucide-react';
import styles from './admin.module.css';

export default function AdminPage() {
  const router = useRouter();

  const masterModules = [
    {
      id: 'banners',
      title: 'Gestão de Banners',
      desc: 'Altere os destaques e avisos exibidos na página inicial para todos os usuários.',
      icon: Layout,
      color: '#3b82f6',
      path: '/admin/banners'
    },
    {
      id: 'projetos',
      title: 'Planos de Ação',
      desc: 'Formule as estratégias, metas e projetos em andamento dos seus clientes.',
      icon: ClipboardList,
      color: '#8b5cf6',
      path: '/admin/projetos'
    },
    {
      id: 'permissions',
      title: 'Níveis de Permissão',
      desc: 'Configure papéis de acesso e permissões granulares de toda a estação.',
      icon: ShieldAlert,
      color: '#ef4444',
      path: '/users'
    },
    {
      id: 'logs',
      title: 'Audit Logs',
      desc: 'Veja o histórico completo de ações de todos os atendentes e robôs.',
      icon: Activity,
      color: '#10b981',
      path: '/admin/logs'
    },
    {
      id: 'automations',
      title: 'Configurações Master',
      desc: 'Ajuste tempos globais de expiração e limites de API.',
      icon: Settings,
      color: '#f59e0b',
      path: '/automations'
    }
  ];

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.titleBlock}>
          <div className={styles.masterBadge}><ShieldAlert size={14} /> Sistema Master</div>
          <h1>Painel de Controle Administrativo</h1>
          <p>Gerencie toda a infraestrutura comercial e comunicacional do sistema.</p>
        </div>
      </header>

      <div className={styles.masterGrid}>
        {masterModules.map((mod, idx) => (
          <motion.div 
            key={mod.id} 
            className={styles.moduleCard}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: idx * 0.1 }}
            onClick={() => router.push(mod.path)}
          >
            <div className={styles.cardHeader}>
              <div className={styles.iconBox} style={{ color: mod.color, background: `${mod.color}15` }}>
                <mod.icon size={24} />
              </div>
              <ChevronRight size={20} className={styles.arrowIcon} />
            </div>
            <div className={styles.cardBody}>
              <h3>{mod.title}</h3>
              <p>{mod.desc}</p>
            </div>
          </motion.div>
        ))}
      </div>

      <section className={styles.systemStatus}>
        <div className={styles.statusHeader}>
           <h3>Status em Tempo Real: Estação Vórtice</h3>
           <span className={styles.liveIndicator}><div className={styles.pulse}></div> Online & Operacional</span>
        </div>
        <div className={styles.statsRow}>
           <div className={styles.statItem}>
             <label>Consumo Provedor API</label>
             <div className={styles.statValue}>12.4% <span className={styles.statLabel}>SAUDÁVEL</span></div>
           </div>
           <div className={styles.statItem}>
             <label>Latência Média</label>
             <div className={styles.statValue}>32ms <span className={styles.statLabel}>EXCELENTE</span></div>
           </div>
        </div>
      </section>
    </div>
  );
}
