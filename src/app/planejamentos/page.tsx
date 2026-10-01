"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, MoreVertical, Plus, Workflow, Copy, Trash2 } from 'lucide-react';
import styles from './planejamentos.module.css';
import { useAuth } from '@/context/AuthContext';
import NewPlanningModal from './components/NewPlanningModal';
import type { PlanningBoard } from './types';

export default function PlanejamentosPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [boards, setBoards] = useState<PlanningBoard[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showNewModal, setShowNewModal] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  useEffect(() => {
    if (user) fetchBoards();
  }, [user]);

  useEffect(() => {
    if (!openMenuId) return;
    const closeMenu = () => setOpenMenuId(null);
    window.addEventListener('click', closeMenu);
    return () => window.removeEventListener('click', closeMenu);
  }, [openMenuId]);

  const fetchBoards = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/planejamentos', { cache: 'no-store' });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        setLoadError(result.error || `Erro ${response.status} ao carregar planejamentos.`);
        setBoards([]);
        return;
      }

      setLoadError('');
      setBoards(Array.isArray(result.data) ? result.data : []);
    } catch {
      setLoadError('Falha de conexão ao carregar planejamentos.');
    } finally {
      setLoading(false);
    }
  };

  const handleDuplicate = async (id: string) => {
    setOpenMenuId(null);
    const response = await fetch(`/api/planejamentos/${id}/duplicate`, { method: 'POST' });
    if (response.ok) fetchBoards();
  };

  const handleDelete = async (id: string) => {
    setOpenMenuId(null);
    if (!confirm('Excluir este planejamento? Essa ação não pode ser desfeita.')) return;
    const response = await fetch(`/api/planejamentos/${id}`, { method: 'DELETE' });
    if (response.ok) setBoards((prev) => prev.filter((b) => b.id !== id));
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>Planejamentos</h1>
          <p className={styles.subtitle}>
            Monte funis de vendas visuais para testar e apresentar estratégias — arraste elementos, conecte etapas e exporte para compartilhar.
          </p>
        </div>
        <button type="button" className={styles.newButton} onClick={() => setShowNewModal(true)}>
          <Plus size={18} /> Novo planejamento
        </button>
      </header>

      {loading ? (
        <div className={styles.emptyState}>
          <p>Carregando planejamentos...</p>
        </div>
      ) : loadError ? (
        <div className={styles.emptyState} style={{ borderColor: 'rgba(239,68,68,0.4)', color: '#ef4444' }}>
          <AlertTriangle size={40} opacity={0.7} />
          <h2>Não foi possível carregar os planejamentos</h2>
          <p>{loadError}</p>
          <button type="button" onClick={fetchBoards} style={{ marginTop: 8, padding: '8px 16px', borderRadius: 8, border: '1px solid currentColor', background: 'transparent', color: 'inherit', cursor: 'pointer' }}>
            Tentar novamente
          </button>
        </div>
      ) : boards.length === 0 ? (
        <div className={styles.emptyState}>
          <Workflow size={48} opacity={0.5} />
          <h2>Nenhum planejamento criado ainda.</h2>
          <p>Crie o primeiro funil visual para começar a testar uma estratégia.</p>
        </div>
      ) : (
        <div className={styles.grid}>
          {boards.map((board) => (
            <div
              key={board.id}
              className={styles.card}
              onClick={() => router.push(`/planejamentos/${board.id}`)}
            >
              <button
                type="button"
                className={styles.menuButton}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenMenuId(openMenuId === board.id ? null : board.id);
                }}
                aria-label="Mais opções"
              >
                <MoreVertical size={16} />
              </button>

              {openMenuId === board.id && (
                <div className={styles.menuDropdown} onClick={(e) => e.stopPropagation()}>
                  <button type="button" onClick={() => handleDuplicate(board.id)}>
                    <Copy size={14} style={{ marginRight: 8, verticalAlign: 'middle' }} /> Duplicar
                  </button>
                  <button type="button" className={styles.danger} onClick={() => handleDelete(board.id)}>
                    <Trash2 size={14} style={{ marginRight: 8, verticalAlign: 'middle' }} /> Excluir
                  </button>
                </div>
              )}

              <div className={styles.thumb}>
                {board.thumbnail_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={board.thumbnail_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <Workflow size={32} />
                )}
              </div>

              <div className={styles.cardBody}>
                {board.project_name && <span className={styles.projectBadge}>{board.project_name}</span>}
                <h2 className={styles.cardName}>{board.name}</h2>
                <p className={styles.cardMeta}>
                  Atualizado em {new Date(board.updated_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {showNewModal && <NewPlanningModal onClose={() => setShowNewModal(false)} />}
    </div>
  );
}
