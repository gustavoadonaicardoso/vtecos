"use client";

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ClipboardList, Target, Target as GoalIcon, ShieldCheck } from 'lucide-react';
import styles from './projetos.module.css';

import { supabase } from '@/lib/supabase';

interface ProjectData {
  id: string;
  clientName: string;
  projectName: string;
  status: string;
  strategies: string;
  weeklyGoals: string;
  commercialPoints: string;
  color: string;
}

const DEFAULT_PROJECTS: ProjectData[] = [];

export default function ProjetosPage() {
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    if (!supabase) return;
    setLoading(true);
    const { data } = await supabase.from('action_plans').select('*').order('created_at');
    if (data && data.length > 0) {
      setProjects(data.map(d => ({
        id: d.id,
        clientName: d.client_name,
        projectName: d.project_name,
        status: d.status,
        strategies: d.strategies,
        weeklyGoals: d.weekly_goals,
        commercialPoints: d.commercial_points,
        color: d.color_gradient,
      })));
    } else {
      const saved = localStorage.getItem('vortice_projetos_data');
      if (saved) setProjects(JSON.parse(saved));
    }
    setLoading(false);
  };


  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Planos de Ação e Projetos</h1>
        <p className={styles.subtitle}>Acompanhamento estratégico, metas semanais e foco comercial estruturado por projeto.</p>
      </header>

      {projects.length === 0 ? (
        <div className={styles.emptyState}>
          <ShieldCheck size={48} opacity={0.5} />
          <h2>Nenhum plano de ação configurado.</h2>
          <p>O Administrador Master precisa configurar os projetos disponíveis através do Painel de Controle.</p>
        </div>
      ) : (
        <div className={styles.grid}>
          {projects.map((proj, idx) => (
            <motion.div 
              key={proj.id} 
              className={styles.card}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
            >
              <div className={styles.cardHeader} style={{ background: proj.color }}>
                 <div className={styles.cardMeta}>
                   <span className={styles.badge}>{proj.status}</span>
                 </div>
                 <h2 className={styles.projectName}>{proj.projectName}</h2>
                 <p className={styles.clientName}>{proj.clientName}</p>
              </div>
              
              <div className={styles.cardBody}>
                 
                 <div className={styles.section}>
                   <h3 className={styles.sectionTitle}><ClipboardList size={18} /> Estratégias de Ação</h3>
                   <pre className={styles.sectionContent}>{proj.strategies || 'Nenhuma estratégia definida.'}</pre>
                 </div>

                 <div className={styles.section}>
                   <h3 className={styles.sectionTitle}><Target size={18} /> Metas da Semana</h3>
                   <pre className={styles.sectionContent}>{proj.weeklyGoals || 'Nenhuma meta definida.'}</pre>
                 </div>

                 <div className={styles.section}>
                   <h3 className={styles.sectionTitle}><GoalIcon size={18} /> Pontos Comerciais a Desenvolver</h3>
                   <pre className={styles.sectionContent}>{proj.commercialPoints || 'Nenhum ponto de desenvolvimento listado.'}</pre>
                 </div>

              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
