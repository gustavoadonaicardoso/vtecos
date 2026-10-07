"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X, LayoutTemplate } from 'lucide-react';
import styles from './NewPlanningModal.module.css';
import { PLANNING_TEMPLATES } from '../templates';
import { EMPTY_CANVAS_DATA } from '../types';
import { useAuth } from '@/context/AuthContext';

interface ProjectOption {
  id: string;
  label: string;
}

export default function NewPlanningModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [templateId, setTemplateId] = useState<string>('blank');
  const [projectId, setProjectId] = useState('');
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // Lista de Projetos é opcional aqui -- se o usuário não tiver acesso a
    // /api/projects (precisa de admin.projects), só escondemos o campo.
    if (!user) return;
    fetch('/api/projects', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((result) => {
        const data = Array.isArray(result?.data) ? result.data : [];
        setProjects(data.map((p: any) => ({ id: p.id, label: `${p.client_name} — ${p.project_name}` })));
      })
      .catch(() => {});
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    const template = PLANNING_TEMPLATES.find((t) => t.id === templateId);
    try {
      const response = await fetch('/api/planejamentos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim() || 'Novo planejamento',
          project_id: projectId || null,
          canvas_data: template ? template.canvas_data : EMPTY_CANVAS_DATA,
        }),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(result.error || 'Não foi possível criar o planejamento.');
        setSubmitting(false);
        return;
      }

      router.push(`/planejamentos/${result.data.id}`);
    } catch {
      setError('Falha de conexão ao criar o planejamento.');
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>Novo planejamento</h2>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary, #64748b)' }}>
            Monte um funil visual para testar e apresentar uma estratégia.
          </p>
        </div>
        <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Fechar">
          <X size={16} />
        </button>

        <form onSubmit={handleSubmit}>
          <div className={styles.body}>
            <div className={styles.field}>
              <label htmlFor="planning-name">Nome</label>
              <input
                id="planning-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Funil de lançamento — Cliente X"
                autoFocus
              />
            </div>

            <div className={styles.field}>
              <label>Começar a partir de</label>
              <div className={styles.templateGrid}>
                <button
                  type="button"
                  className={`${styles.templateOption} ${templateId === 'blank' ? styles.selected : ''}`}
                  onClick={() => setTemplateId('blank')}
                >
                  <LayoutTemplate size={18} />
                  Em branco
                </button>
                {PLANNING_TEMPLATES.map((t) => (
                  <button
                    type="button"
                    key={t.id}
                    className={`${styles.templateOption} ${templateId === t.id ? styles.selected : ''}`}
                    onClick={() => setTemplateId(t.id)}
                    title={t.description}
                  >
                    <LayoutTemplate size={18} />
                    {t.name}
                  </button>
                ))}
              </div>
            </div>

            {projects.length > 0 && (
              <div className={styles.field}>
                <label htmlFor="planning-project">Vincular a um projeto (opcional)</label>
                <select id="planning-project" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                  <option value="">Nenhum</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
              </div>
            )}

            {error && <p style={{ color: '#ef4444', fontSize: '0.85rem', margin: 0 }}>{error}</p>}
          </div>

          <div className={`${styles.body} ${styles.footer}`} style={{ paddingTop: 0 }}>
            <button type="button" className={styles.cancelButton} onClick={onClose}>Cancelar</button>
            <button type="submit" className={styles.submitButton} disabled={submitting}>
              {submitting ? 'Criando…' : 'Criar planejamento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
