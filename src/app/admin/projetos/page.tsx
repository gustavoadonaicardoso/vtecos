"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Plus, Trash2, Check, X, Save, Palette, Type, ClipboardList, Flag, Target, Target as GoalIcon
} from 'lucide-react';
import styles from './adminProjetos.module.css';

import { supabase } from '@/lib/supabase';

export interface ProjectData {
  id: string;
  clientName: string;
  projectName: string;
  status: 'Planejamento' | 'Em Andamento' | 'Concluído';
  strategies: string;
  weeklyGoals: string;
  commercialPoints: string;
  color: string;
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

const DEFAULT_PROJECTS: ProjectData[] = [];

export default function AdminProjetos() {
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [success, setSuccess] = useState(false);
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
        status: d.status as any,
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

  const saveToDisk = async (newProjects: ProjectData[]) => {
    setProjects(newProjects);
    
    if (supabase) {
      await supabase.from('action_plans').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      
      const dbRows = newProjects.map(p => ({
        client_name: p.clientName,
        project_name: p.projectName,
        status: p.status,
        strategies: p.strategies,
        weekly_goals: p.weeklyGoals,
        commercial_points: p.commercialPoints,
        color_gradient: p.color
      }));

      await supabase.from('action_plans').insert(dbRows);
    }

    localStorage.setItem('vortice_projetos_data', JSON.stringify(newProjects));
    setSuccess(true);
    setTimeout(() => setSuccess(false), 2000);
  };


  const updateField = (idx: number, field: keyof ProjectData, val: string) => {
    const next = [...projects];
    next[idx] = { ...next[idx], [field]: val };
    setProjects(next);
  };

  const addProject = () => {
    const next = [...projects, {
      id: Date.now().toString(),
      clientName: "Novo Cliente",
      projectName: "Plano de Ação",
      status: "Planejamento" as const,
      strategies: "",
      weeklyGoals: "",
      commercialPoints: "",
      color: PRESET_COLORS[2],
    }];
    saveToDisk(next);
    setEditingIdx(next.length - 1);
  };

  const removeProject = (idx: number) => {
    if (confirm('Deseja deletar este Plano de Ação permanentemente?')) {
      const next = projects.filter((_, i) => i !== idx);
      saveToDisk(next);
      setEditingIdx(null);
    }
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.titleArea}>
          <h1>Planos de Ação (Painel Master)</h1>
          <p>Gerencie estratégias, abordagens e metas semanais de cada cliente/projeto.</p>
        </div>
        
        <button className={styles.addBtn} onClick={addProject}>
          <Plus size={18} /> Criar Plano
        </button>
      </header>

      {success && !editingIdx && (
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} style={{color: '#10b981', display:'flex', alignItems:'center', gap:8, fontWeight: 700}}>
          <Check size={18} /> Alterações publicadas!
        </motion.div>
      )}

      <div className={styles.displayGrid}>
        {projects.map((proj, idx) => (
          <motion.div 
            key={proj.id} 
            className={styles.displayCard}
            style={{ background: proj.color }}
            onClick={() => setEditingIdx(idx)}
            whileHover={{ scale: 1.02, y: -5 }}
            layoutId={`proj-${proj.id}`}
          >
            <div className={styles.cardHeader}>
              <span className={styles.badge}>{proj.status}</span>
            </div>
            <h3 className={styles.title}>{proj.projectName}</h3>
            <p className={styles.desc}>{proj.clientName}</p>
            
            <div className={styles.editHint}>Clique para gerenciar plano</div>
          </motion.div>
        ))}
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
                <h2>Configurar Plano de Ação</h2>
                <button className={styles.closeBtn} onClick={() => setEditingIdx(null)}>
                  <X size={24} />
                </button>
              </div>

              <div className={styles.modalContent}>
                <div className={styles.modalSection}>
                  <label><Type size={16} /> Identificação do Projeto</label>
                  <div className={styles.inputRow}>
                    <input 
                      value={projects[editingIdx].clientName} 
                      onChange={(e) => updateField(editingIdx, 'clientName', e.target.value)}
                      placeholder="Nome do Cliente / Empresa"
                    />
                    <input 
                      value={projects[editingIdx].projectName} 
                      onChange={(e) => updateField(editingIdx, 'projectName', e.target.value)}
                      placeholder="Nome do Projeto / Sprint"
                    />
                  </div>
                </div>

                <div className={styles.modalSection}>
                  <label><Flag size={16} /> Status</label>
                  <select 
                    value={projects[editingIdx].status}
                    onChange={(e) => updateField(editingIdx, 'status', e.target.value as any)}
                  >
                    <option value="Planejamento">Planejamento</option>
                    <option value="Em Andamento">Em Andamento</option>
                    <option value="Concluído">Concluído</option>
                  </select>
                </div>

                <div className={styles.modalSection}>
                  <label><ClipboardList size={16} /> Estratégias de Ação</label>
                  <textarea 
                    value={projects[editingIdx].strategies} 
                    onChange={(e) => updateField(editingIdx, 'strategies', e.target.value)}
                    placeholder="Quais as estratégias macro adotadas para esse projeto?..."
                  />
                </div>

                <div className={styles.modalSection}>
                  <label><Target size={16} /> Metas da Semana</label>
                  <textarea 
                    value={projects[editingIdx].weeklyGoals} 
                    onChange={(e) => updateField(editingIdx, 'weeklyGoals', e.target.value)}
                    placeholder="Quais são as metas imediatas desta semana?..."
                  />
                </div>

                <div className={styles.modalSection}>
                  <label><GoalIcon size={16} /> Pontos Comerciais a Desenvolver</label>
                  <textarea 
                    value={projects[editingIdx].commercialPoints} 
                    onChange={(e) => updateField(editingIdx, 'commercialPoints', e.target.value)}
                    placeholder="Ex: Melhorar taxa de quebra de objeção no WhatsApp..."
                  />
                </div>

                <div className={styles.modalSection}>
                   <label><Palette size={16} /> Cor de Identificação</label>
                   <div className={styles.colorPicks}>
                     {PRESET_COLORS.map(c => (
                       <div 
                         key={c} 
                         className={`${styles.colorTick} ${projects[editingIdx].color === c ? styles.activeTick : ''}`}
                         style={{ background: c }}
                         onClick={() => updateField(editingIdx, 'color', c)}
                       />
                     ))}
                   </div>
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button className={styles.deleteBtn} onClick={() => removeProject(editingIdx)}>
                  <Trash2 size={18} /> Deletar Plano
                </button>
                <button className={styles.finalSaveBtn} onClick={() => {
                  saveToDisk(projects);
                  setEditingIdx(null);
                }}>
                  <Save size={18} /> Salvar Plano
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
