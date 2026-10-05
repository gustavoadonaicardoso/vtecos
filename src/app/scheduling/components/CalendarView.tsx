'use client';

import React from 'react';
import { Bell, CheckSquare, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import styles from '../scheduling.module.css';
import { dayTitle, isOverdue, monthCells, monthTitle, type AgendaItem } from '../format';

interface CalendarViewProps {
  month: Date;
  items: AgendaItem[];
  todayKey: string;
  loaded: boolean;
  ownerName: (id: string | null) => string | null;
  onMonth: (offset: number | 'today') => void;
  onDay: (key: string) => void;
  onItem: (item: AgendaItem) => void;
}

const MAX_IN_CELL = 3;

function ItemChip({ item, todayKey, onItem }: { item: AgendaItem; todayKey: string; onItem: (item: AgendaItem) => void }) {
  return (
    <button
      type="button"
      className={`${styles.chip} ${item.type === 'task' ? styles.chipTask : ''} ${item.status === 'done' ? styles.chipDone : ''} ${isOverdue(item, todayKey) ? styles.chipLate : ''}`}
      onClick={(e) => { e.stopPropagation(); onItem(item); }}
      title={item.title}
    >
      {item.type === 'task' && <CheckSquare size={11} />}
      {item.time && <strong>{item.time}</strong>}
      <span>{item.title}</span>
    </button>
  );
}

export default function CalendarView({ month, items, todayKey, loaded, ownerName, onMonth, onDay, onItem }: CalendarViewProps) {
  const cells = monthCells(month);
  const byDay = new Map<string, AgendaItem[]>();
  for (const item of items) byDay.set(item.date, [...(byDay.get(item.date) || []), item]);
  const monthDays = cells.filter((cell) => cell.inMonth && byDay.has(cell.key));

  return (
    <section className={styles.card} aria-label="Agenda do mês">
      <div className={styles.calHead}>
        <h2>{monthTitle(month)}</h2>
        <div className={styles.calNav}>
          <button type="button" className={styles.secondaryBtn} onClick={() => onMonth('today')}>Hoje</button>
          <button type="button" className={styles.iconBtn} onClick={() => onMonth(-1)} aria-label="Mês anterior"><ChevronLeft size={18} /></button>
          <button type="button" className={styles.iconBtn} onClick={() => onMonth(1)} aria-label="Próximo mês"><ChevronRight size={18} /></button>
        </div>
      </div>

      {/* Computador: grade do mês */}
      <div className={styles.grid}>
        {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((day) => <div key={day} className={styles.weekDay}>{day}</div>)}
        {cells.map((cell) => {
          const dayItems = byDay.get(cell.key) || [];
          return (
            <div
              key={cell.key}
              role="button"
              tabIndex={0}
              className={`${styles.cell} ${cell.inMonth ? '' : styles.cellOut} ${cell.key === todayKey ? styles.cellToday : ''}`}
              onClick={() => onDay(cell.key)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onDay(cell.key))}
              aria-label={`${dayTitle(cell.key, todayKey)}: ${dayItems.length} itens. Clique para adicionar.`}
            >
              <span className={styles.cellNum}>{cell.date.getDate()}</span>
              {dayItems.slice(0, MAX_IN_CELL).map((item) => <ItemChip key={item.id} item={item} todayKey={todayKey} onItem={onItem} />)}
              {dayItems.length > MAX_IN_CELL && <span className={styles.more}>+{dayItems.length - MAX_IN_CELL} mais</span>}
              <Plus size={14} className={styles.cellAdd} aria-hidden />
            </div>
          );
        })}
      </div>

      {/* Celular: lista dos dias do mês que têm algo */}
      <div className={styles.dayList}>
        {loaded && monthDays.length === 0 && <p className={styles.empty}>Nada marcado neste mês.</p>}
        {monthDays.map((cell) => (
          <div key={cell.key} className={styles.dayGroup}>
            <h3 className={cell.key === todayKey ? styles.dayToday : ''}>{dayTitle(cell.key, todayKey)}</h3>
            {(byDay.get(cell.key) || []).map((item) => (
              <button key={item.id} type="button" className={`${styles.listItem} ${item.status === 'done' ? styles.chipDone : ''}`} onClick={() => onItem(item)}>
                <span className={`${styles.listTime} ${item.type === 'task' ? styles.listTask : ''}`}>{item.time || (item.type === 'task' ? 'Tarefa' : 'Dia todo')}</span>
                <span className={styles.listBody}>
                  <strong>{item.title}</strong>
                  <small>
                    {[item.leadName, ownerName(item.assignedTo)].filter(Boolean).join(' · ') || (item.type === 'task' ? 'Tarefa' : 'Compromisso')}
                    {item.remindMinutes !== null && <Bell size={11} aria-label="Com lembrete" />}
                  </small>
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
