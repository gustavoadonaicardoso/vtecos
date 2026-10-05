'use client';

import React from 'react';
import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd';
import { AlertCircle, CheckCircle2, Circle, Clock, User } from 'lucide-react';
import styles from '../scheduling.module.css';
import { PRIORITY_LABEL, STATUS_LABEL, isOverdue, shortDate, type AgendaItem, type ItemStatus } from '../format';

interface TaskBoardProps {
  tasks: AgendaItem[];
  todayKey: string;
  loaded: boolean;
  ownerName: (id: string | null) => string | null;
  canMove: (item: AgendaItem) => boolean;
  onMove: (item: AgendaItem, status: ItemStatus) => void;
  onItem: (item: AgendaItem) => void;
}

const COLUMNS: { id: ItemStatus; icon: React.ReactNode }[] = [
  { id: 'todo', icon: <Circle size={15} /> },
  { id: 'in-progress', icon: <Clock size={15} /> },
  { id: 'done', icon: <CheckCircle2 size={15} /> },
];

export default function TaskBoard({ tasks, todayKey, loaded, ownerName, canMove, onMove, onItem }: TaskBoardProps) {
  const onDragEnd = ({ destination, draggableId }: DropResult) => {
    const task = tasks.find((item) => item.id === draggableId);
    if (!task || !destination || destination.droppableId === task.status) return;
    onMove(task, destination.droppableId as ItemStatus);
  };

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className={styles.board}>
        {COLUMNS.map((column) => {
          const list = tasks.filter((task) => task.status === column.id);
          return (
            <section key={column.id} className={styles.column} aria-label={STATUS_LABEL[column.id]}>
              <header className={styles.columnHead}>
                {column.icon}
                <h3>{STATUS_LABEL[column.id]}</h3>
                <span className={styles.count}>{list.length}</span>
              </header>
              <Droppable droppableId={column.id}>
                {(drop, state) => (
                  <div ref={drop.innerRef} {...drop.droppableProps} className={`${styles.columnBody} ${state.isDraggingOver ? styles.columnOver : ''}`}>
                    {loaded && list.length === 0 && <p className={styles.empty}>{column.id === 'done' ? 'Concluídas dos últimos 30 dias aparecem aqui.' : 'Nenhuma tarefa.'}</p>}
                    {list.map((task, index) => {
                      const late = isOverdue(task, todayKey);
                      const owner = ownerName(task.assignedTo);
                      return (
                        <Draggable key={task.id} draggableId={task.id} index={index} isDragDisabled={!canMove(task)}>
                          {(drag, dragState) => (
                            <article
                              ref={drag.innerRef}
                              {...drag.draggableProps}
                              {...drag.dragHandleProps}
                              className={`${styles.task} ${dragState.isDragging ? styles.taskDragging : ''} ${task.status === 'done' ? styles.chipDone : ''}`}
                              onClick={() => onItem(task)}
                            >
                              <div className={styles.taskTop}>
                                <span className={`${styles.priority} ${styles[`p_${task.priority}`]}`}>{PRIORITY_LABEL[task.priority]}</span>
                                <span className={`${styles.due} ${late ? styles.dueLate : ''}`}>
                                  {late && <AlertCircle size={12} />}
                                  {task.date === todayKey ? 'Hoje' : shortDate(task.date)}{task.time ? ` ${task.time}` : ''}
                                </span>
                              </div>
                              <h4>{task.title}</h4>
                              {(task.leadName || owner) && (
                                <p className={styles.taskMeta}>
                                  {task.leadName && <span>{task.leadName}</span>}
                                  {owner && <span><User size={11} /> {owner}</span>}
                                </p>
                              )}
                            </article>
                          )}
                        </Draggable>
                      );
                    })}
                    {drop.placeholder}
                  </div>
                )}
              </Droppable>
            </section>
          );
        })}
      </div>
    </DragDropContext>
  );
}
