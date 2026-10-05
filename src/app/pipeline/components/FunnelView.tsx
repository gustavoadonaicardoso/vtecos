'use client';

import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import styles from '../pipeline.module.css';
import type { Lead, PipelineStage } from '@/types';
import StageNameInput from './StageNameInput';
import { STAGE_COLORS } from './StageHeader';

const brl = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

interface FunnelViewProps {
  stages: PipelineStage[];
  leadsByStage: Map<string, Lead[]>;
  daysIn: (lead: Lead) => number;
  wonId: string;
  canEdit: boolean;
  onRename: (id: string, name: string) => void;
  onColor: (id: string, color: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
}

export default function FunnelView({ stages, leadsByStage, daysIn, wonId, canEdit, onRename, onColor, onMove, onDelete, onAdd }: FunnelViewProps) {
  const rows = stages.map((stage) => {
    const list = leadsByStage.get(stage.id) || [];
    const value = list.reduce((sum, lead) => sum + (lead.valueNumber ?? 0), 0);
    const avgDays = list.length ? Math.round(list.reduce((sum, lead) => sum + daysIn(lead), 0) / list.length) : 0;
    return { stage, count: list.length, value, avgDays };
  });
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const max = Math.max(1, ...rows.map((row) => row.count));
  const won = rows.find((row) => row.stage.id === wonId);
  const open = rows.filter((row) => row.stage.id !== wonId);
  const openCount = open.reduce((sum, row) => sum + row.count, 0);
  const openValue = open.reduce((sum, row) => sum + row.value, 0);

  return (
    <div className={styles.funnel}>
      <div className={styles.summary}>
        <div><span>Em andamento</span><strong>{openCount}</strong><small>lead(s) fora de Ganhos</small></div>
        <div><span>Valor em aberto</span><strong>{brl(openValue)}</strong><small>soma dos valores em andamento</small></div>
        <div><span>Ganhos</span><strong>{won?.count ?? 0}</strong><small>{brl(won?.value ?? 0)}</small></div>
        <div><span>Conversão</span><strong>{total ? Math.round(((won?.count ?? 0) / total) * 100) : 0}%</strong><small>ganhos sobre o total do funil</small></div>
      </div>

      <section className={styles.funnelCard}>
        <h3>Leads por etapa</h3>
        <div className={styles.funnelRows}>
          {rows.map((row) => (
            <div key={row.stage.id} className={styles.funnelRow} style={{ ['--stage' as string]: row.stage.color }}>
              <span className={styles.funnelName}>{row.stage.name}</span>
              <div className={styles.funnelBarTrack}>
                <div className={styles.funnelBar} style={{ width: `${Math.max(2, (row.count / max) * 100)}%` }} />
              </div>
              <span className={styles.funnelNums}>
                <strong>{row.count}</strong>
                <small>{total ? Math.round((row.count / total) * 100) : 0}% · {brl(row.value)} · média {row.avgDays}d na etapa</small>
              </span>
            </div>
          ))}
          {rows.length === 0 && <p className={styles.muted}>Nenhuma etapa no funil.</p>}
        </div>
      </section>

      {canEdit && (
        <section className={styles.funnelCard}>
          <h3>Etapas do funil</h3>
          <p className={styles.muted}>A ordem aqui é a ordem das colunas. Leads de uma etapa excluída vão para a primeira etapa.</p>
          <div className={styles.stageEditor}>
            {stages.map((stage, index) => (
              <div key={stage.id} className={styles.stageEditRow}>
                <span className={styles.stageIndex}>{index + 1}</span>
                <div className={styles.reorder}>
                  <button type="button" onClick={() => onMove(stage.id, -1)} disabled={index === 0} aria-label={`Subir ${stage.name}`}><ChevronUp size={14} /></button>
                  <button type="button" onClick={() => onMove(stage.id, 1)} disabled={index === stages.length - 1} aria-label={`Descer ${stage.name}`}><ChevronDown size={14} /></button>
                </div>
                <StageNameInput key={stage.name} value={stage.name} className={styles.stageNameInput} onCommit={(name) => onRename(stage.id, name)} />
                <div className={styles.inlineSwatches}>
                  {STAGE_COLORS.map((color) => (
                    <button key={color} type="button" className={`${styles.swatch} ${color === stage.color ? styles.swatchOn : ''}`} style={{ background: color }} aria-label={`Cor ${color} para ${stage.name}`} onClick={() => onColor(stage.id, color)} />
                  ))}
                </div>
                {stage.id === wonId ? (
                  <span className={styles.wonTag} title="Metas e relatórios usam esta etapa">Ganhos</span>
                ) : (
                  <button type="button" className={styles.iconBtn} onClick={() => onDelete(stage.id)} aria-label={`Excluir ${stage.name}`}><Trash2 size={16} /></button>
                )}
              </div>
            ))}
          </div>
          <button type="button" className={styles.secondaryBtn} onClick={onAdd}><Plus size={15} /> Nova etapa</button>
        </section>
      )}
    </div>
  );
}
