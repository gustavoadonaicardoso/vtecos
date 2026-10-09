"use client";

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, ClipboardList, Loader2, Pencil, Plus, Search, ShieldCheck, Target, Trash2, TrendingUp, X } from 'lucide-react';
import styles from './projetos.module.css';
import { useAuth } from '@/context/AuthContext';

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

type Draft = Omit<ProjectData, 'id'> & { id: string | null };

const STATUSES = ['Planejamento', 'Em Andamento', 'Pausado', 'Concluído'];

const COLORS = [
  'linear-gradient(135deg, #3b82f6, #8b5cf6)',
  'linear-gradient(135deg, #10b981, #059669)',
  'linear-gradient(135deg, #f59e0b, #d97706)',
  'linear-gradient(135deg, #ef4444, #991b1b)',
  'linear-gradient(135deg, #8b5cf6, #d946ef)',
  'linear-gradient(135deg, #1e293b, #0f172a)',
  'linear-gradient(135deg, #06b6d4, #0891b2)',
  'linear-gradient(135deg, #6366f1, #4f46e5)',
];

const EMPTY: Draft = { id: null, clientName: '', projectName: '', status: 'Planejamento', strategies: '', weeklyGoals: '', commercialPoints: '', color: COLORS[0] };

function fromRow(row: Record<string, unknown>): ProjectData {
  return {
    id: String(row.id),
    clientName: String(row.client_name || ''),
    projectName: String(row.project_name || ''),
    status: String(row.status || 'Planejamento'),
    strategies: String(row.strategies || ''),
    weeklyGoals: String(row.weekly_goals || ''),
    commercialPoints: String(row.commercial_points || ''),
    color: String(row.color_gradient || '') || COLORS[0],
  };
}

export default function ProjetosPage() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<string>('all');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/projects', { cache: 'no-store' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setLoadError(result.error || `Erro ${response.status} ao carregar projetos.`);
        setProjects([]);
        return;
      }
      setLoadError('');
      setCanEdit(result.canEdit === true);
      setProjects((Array.isArray(result.data) ? result.data : []).map(fromRow));
    } catch {
      setLoadError('Falha de conexão ao carregar projetos.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    const timer = window.setTimeout(fetchProjects, 0);
    return () => window.clearTimeout(timer);
  }, [user, fetchProjects]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 3500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: projects.length };
    for (const item of projects) map[item.status] = (map[item.status] || 0) + 1;
    return map;
  }, [projects]);

  const visible = useMemo(() => {
    const text = query.trim().toLowerCase();
    return projects.filter((item) => {
      if (status !== 'all' && item.status !== status) return false;
      if (!text) return true;
      return item.projectName.toLowerCase().includes(text) || item.clientName.toLowerCase().includes(text);
    });
  }, [projects, query, status]);

  const openNew = () => {
    setFormError('');
    setDraft({ ...EMPTY, color: COLORS[projects.length % COLORS.length] });
  };
  const openEdit = (project: ProjectData) => {
    setFormError('');
    setDraft({ ...project, color: COLORS.includes(project.color) ? project.color : COLORS[0] });
  };
  const closeForm = () => {
    if (!saving) setDraft(null);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft || saving) return;
    if (!draft.projectName.trim()) {
      setFormError('Dê um nome ao projeto.');
      return;
    }
    setSaving(true);
    setFormError('');
    const { id, ...body } = draft;
    const response = await fetch(id ? `/api/projects/${id}` : '/api/projects', {
      method: id ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => null);
    const result = response ? await response.json().catch(() => ({})) : {};
    setSaving(false);
    if (!response?.ok || !result.data) {
      setFormError(result.error || 'Não foi possível salvar. Confira a conexão e tente de novo.');
      return;
    }
    const saved = fromRow(result.data);
    setProjects((current) => (id ? current.map((item) => (item.id === id ? saved : item)) : [...current, saved]));
    setDraft(null);
    setNotice(id ? 'Projeto salvo.' : 'Projeto criado.');
  };

  const remove = async (project: ProjectData) => {
    if (!confirm(`Excluir o projeto "${project.projectName}"? Planejamentos e contas de redes sociais vinculados continuam existindo, só ficam sem projeto.`)) return;
    setSaving(true);
    const response = await fetch(`/api/projects/${project.id}`, { method: 'DELETE' }).catch(() => null);
    const result = response ? await response.json().catch(() => ({})) : {};
    setSaving(false);
    if (!response?.ok) {
      setNotice(result.error || 'Não foi possível excluir.');
      return;
    }
    setProjects((current) => current.filter((item) => item.id !== project.id));
    setDraft(null);
    setNotice('Projeto excluído.');
  };

  const set = (field: keyof Draft, value: string) => setDraft((current) => (current ? { ...current, [field]: value } : current));

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerRow}>
          <div>
            <h1 className={styles.title}>Planos de Ação e Projetos</h1>
            <p className={styles.subtitle}>Acompanhamento estratégico, metas semanais e foco comercial estruturado por projeto.</p>
          </div>
          {canEdit && (
            <button type="button" className={styles.primaryBtn} onClick={openNew}>
              <Plus size={18} /> Novo projeto
            </button>
          )}
        </div>

        {!loading && !loadError && projects.length > 0 && (
          <div className={styles.toolbar}>
            <label className={styles.search}>
              <Search size={16} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por projeto ou cliente" aria-label="Buscar projetos" />
            </label>
            <div className={styles.filters} role="tablist" aria-label="Filtrar por status">
              {['all', ...STATUSES].map((value) => (
                <button key={value} type="button" role="tab" aria-selected={status === value} className={`${styles.filter} ${status === value ? styles.filterOn : ''}`} onClick={() => setStatus(value)}>
                  {value === 'all' ? 'Todos' : value}
                  <span>{counts[value] || 0}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </header>

      {loading ? (
        <div className={styles.emptyState}>
          <Loader2 size={28} className={styles.spin} />
          <p>Carregando projetos...</p>
        </div>
      ) : loadError ? (
        <div className={styles.emptyState} style={{ borderColor: 'rgba(239,68,68,0.4)', color: '#ef4444' }}>
          <AlertTriangle size={40} opacity={0.7} />
          <h2>Não foi possível carregar os projetos</h2>
          <p>{loadError}</p>
          <button type="button" className={styles.secondaryBtn} onClick={fetchProjects}>Tentar novamente</button>
        </div>
      ) : projects.length === 0 ? (
        <div className={styles.emptyState}>
          <ShieldCheck size={48} opacity={0.5} />
          <h2>Nenhum projeto ainda</h2>
          {canEdit ? (
            <>
              <p>Crie um projeto para cada cliente ou frente de trabalho, com as estratégias, as metas da semana e os pontos comerciais. Depois dá para vincular Planejamentos e contas de Redes Sociais a ele.</p>
              <button type="button" className={styles.primaryBtn} onClick={openNew}><Plus size={18} /> Criar o primeiro projeto</button>
            </>
          ) : (
            <p>Peça a um administrador ou gerente da empresa para criar os projetos.</p>
          )}
        </div>
      ) : visible.length === 0 ? (
        <div className={styles.emptyState}>
          <Search size={36} opacity={0.5} />
          <p>Nenhum projeto com esse filtro.</p>
        </div>
      ) : (
        <div className={styles.grid}>
          {visible.map((project, idx) => (
            <motion.div key={project.id} className={styles.card} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(idx, 6) * 0.05 }}>
              <div className={styles.cardHeader} style={{ background: project.color }}>
                <div className={styles.cardMeta}>
                  <span className={styles.badge}>{project.status}</span>
                  {canEdit && (
                    <span className={styles.cardActions}>
                      <button type="button" onClick={() => openEdit(project)} aria-label={`Editar ${project.projectName}`} title="Editar"><Pencil size={15} /></button>
                      <button type="button" onClick={() => remove(project)} disabled={saving} aria-label={`Excluir ${project.projectName}`} title="Excluir"><Trash2 size={15} /></button>
                    </span>
                  )}
                </div>
                <h2 className={styles.projectName}>{project.projectName}</h2>
                {project.clientName && <p className={styles.clientName}>{project.clientName}</p>}
              </div>

              <div className={styles.cardBody}>
                <div className={styles.section}>
                  <h3 className={styles.sectionTitle}><ClipboardList size={18} /> Estratégias de Ação</h3>
                  <pre className={styles.sectionContent}>{project.strategies || 'Nenhuma estratégia definida.'}</pre>
                </div>
                <div className={styles.section}>
                  <h3 className={styles.sectionTitle}><Target size={18} /> Metas da Semana</h3>
                  <pre className={styles.sectionContent}>{project.weeklyGoals || 'Nenhuma meta definida.'}</pre>
                </div>
                <div className={styles.section}>
                  <h3 className={styles.sectionTitle}><TrendingUp size={18} /> Pontos Comerciais a Desenvolver</h3>
                  <pre className={styles.sectionContent}>{project.commercialPoints || 'Nenhum ponto de desenvolvimento listado.'}</pre>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {draft && (
        <div className={styles.overlay} onMouseDown={(event) => { if (event.target === event.currentTarget) closeForm(); }}>
          <form className={styles.modal} onSubmit={save} role="dialog" aria-modal="true" aria-labelledby="project-form-title">
            <div className={styles.modalHead}>
              <h2 id="project-form-title">{draft.id ? 'Editar projeto' : 'Novo projeto'}</h2>
              <button type="button" className={styles.iconBtn} onClick={closeForm} aria-label="Fechar"><X size={18} /></button>
            </div>

            <div className={styles.modalBody}>
              <div className={styles.preview} style={{ background: draft.color }}>
                <span className={styles.badge}>{draft.status}</span>
                <strong>{draft.projectName || 'Nome do projeto'}</strong>
                <small>{draft.clientName || 'Cliente'}</small>
              </div>

              <div className={styles.row}>
                <label className={styles.field}>
                  <span>Projeto *</span>
                  <input className={styles.input} value={draft.projectName} onChange={(event) => set('projectName', event.target.value)} maxLength={120} placeholder="Ex.: Lançamento da loja online" autoFocus required />
                </label>
                <label className={styles.field}>
                  <span>Cliente</span>
                  <input className={styles.input} value={draft.clientName} onChange={(event) => set('clientName', event.target.value)} maxLength={120} placeholder="Ex.: Doces da Ana" />
                </label>
              </div>

              <div className={styles.row}>
                <label className={styles.field}>
                  <span>Status</span>
                  <select className={styles.input} value={draft.status} onChange={(event) => set('status', event.target.value)}>
                    {STATUSES.map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>
                <div className={styles.field}>
                  <span>Cor do cartão</span>
                  <div className={styles.swatches}>
                    {COLORS.map((color, index) => (
                      <button key={color} type="button" className={`${styles.swatch} ${draft.color === color ? styles.swatchOn : ''}`} style={{ background: color }} onClick={() => set('color', color)} aria-label={`Cor ${index + 1}`} aria-pressed={draft.color === color} />
                    ))}
                  </div>
                </div>
              </div>

              <label className={styles.field}>
                <span>Estratégias de ação</span>
                <textarea className={styles.input} rows={4} value={draft.strategies} onChange={(event) => set('strategies', event.target.value)} placeholder={'Uma por linha. Ex.:\n- Anúncios no Instagram para o bairro\n- Parceria com cafeterias'} />
              </label>
              <label className={styles.field}>
                <span>Metas da semana</span>
                <textarea className={styles.input} rows={3} value={draft.weeklyGoals} onChange={(event) => set('weeklyGoals', event.target.value)} placeholder={'Ex.:\n- 20 novos leads\n- 5 reuniões'} />
              </label>
              <label className={styles.field}>
                <span>Pontos comerciais a desenvolver</span>
                <textarea className={styles.input} rows={3} value={draft.commercialPoints} onChange={(event) => set('commercialPoints', event.target.value)} placeholder="Ex.: melhorar o tempo de resposta no WhatsApp" />
              </label>

              {formError && <p className={styles.formError}><AlertTriangle size={15} /> {formError}</p>}
            </div>

            <div className={styles.modalFoot}>
              {draft.id ? (
                <button type="button" className={styles.dangerBtn} onClick={() => remove(draft as ProjectData)} disabled={saving}><Trash2 size={16} /> Excluir</button>
              ) : <span />}
              <div className={styles.footActions}>
                <button type="button" className={styles.secondaryBtn} onClick={closeForm} disabled={saving}>Cancelar</button>
                <button type="submit" className={styles.primaryBtn} disabled={saving}>
                  {saving ? <Loader2 size={16} className={styles.spin} /> : null} {draft.id ? 'Salvar' : 'Criar projeto'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {notice && <div className={styles.toast} role="status">{notice}</div>}
    </div>
  );
}
