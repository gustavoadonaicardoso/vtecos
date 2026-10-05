'use client';

import React, { useState } from 'react';
import { Bell, CalendarClock, CheckSquare, Loader2, Trash2, X } from 'lucide-react';
import styles from '../scheduling.module.css';
import type { TeamMember } from '@/components/leads/useTeam';
import { PRIORITY_LABEL, REMINDERS, STATUS_LABEL, type AgendaItem, type ItemStatus, type ItemType, type Priority } from '../format';

interface ItemModalProps {
  item: AgendaItem | null;
  defaults: { type: ItemType; date: string };
  leads: { id: string; name: string }[];
  team: TeamMember[];
  meId: string;
  canAssign: boolean;
  canEdit: boolean;
  onSave: (payload: Record<string, unknown>) => Promise<string | null>;
  onDelete: () => Promise<string | null>;
  onClose: () => void;
}

export default function ItemModal({ item, defaults, leads, team, meId, canAssign, canEdit, onSave, onDelete, onClose }: ItemModalProps) {
  const [type, setType] = useState<ItemType>(item?.type ?? defaults.type);
  const [title, setTitle] = useState(item?.title ?? '');
  const [date, setDate] = useState(item?.date ?? defaults.date);
  const [allDay, setAllDay] = useState(item ? !item.time : defaults.type === 'task');
  const [time, setTime] = useState(item?.time ?? '09:00');
  const [remind, setRemind] = useState<number | null>(item ? item.remindMinutes : defaults.type === 'event' ? 30 : null);
  const [leadId, setLeadId] = useState(item?.leadId ?? '');
  const [assignedTo, setAssignedTo] = useState(item ? item.assignedTo ?? '' : meId);
  const [priority, setPriority] = useState<Priority>(item?.priority ?? 'medium');
  const [status, setStatus] = useState<ItemStatus>(item?.status ?? 'todo');
  const [description, setDescription] = useState(item?.description ?? '');
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);
  const [error, setError] = useState('');

  const save = async () => {
    if (!title.trim()) return setError('Dê um título.');
    if (!date) return setError('Escolha a data.');
    setBusy('save');
    setError('');
    const failure = await onSave({
      type,
      title,
      date,
      time: allDay ? null : time,
      remindMinutes: allDay ? null : remind,
      leadId: leadId || null,
      ...(canAssign ? { assignedTo: assignedTo || null } : {}),
      priority,
      status,
      description,
    });
    setBusy(null);
    if (failure) setError(failure);
  };

  const remove = async () => {
    if (!confirm(`Excluir "${item?.title}"?`)) return;
    setBusy('delete');
    const failure = await onDelete();
    setBusy(null);
    if (failure) setError(failure);
  };

  // Lead que o vendedor não enxerga mais (ou de item antigo): mantém a opção.
  const leadMissing = leadId && !leads.some((lead) => lead.id === leadId);
  const owner = team.find((member) => member.id === item?.assignedTo);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={item ? 'Editar item da agenda' : 'Novo item da agenda'}>
        <header className={styles.modalHead}>
          <h2>{item ? (canEdit ? 'Editar' : 'Detalhes') : type === 'task' ? 'Nova tarefa' : 'Novo compromisso'}</h2>
          <button type="button" className={styles.iconBtn} onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </header>

        <div className={styles.modalBody}>
          <fieldset className={styles.fieldset} disabled={!canEdit || busy !== null}>
            <div className={styles.segmented} role="radiogroup" aria-label="Tipo">
              <button type="button" role="radio" aria-checked={type === 'event'} className={type === 'event' ? styles.segOn : ''} onClick={() => setType('event')}>
                <CalendarClock size={15} /> Compromisso
              </button>
              <button type="button" role="radio" aria-checked={type === 'task'} className={type === 'task' ? styles.segOn : ''} onClick={() => setType('task')}>
                <CheckSquare size={15} /> Tarefa
              </button>
            </div>

            <label className={styles.field}>
              <span>Título</span>
              <input className={styles.input} value={title} maxLength={160} autoFocus={!item} onChange={(e) => setTitle(e.target.value)} placeholder={type === 'task' ? 'Ex.: Enviar proposta para a Padaria Central' : 'Ex.: Reunião de apresentação'} />
            </label>

            <div className={styles.row}>
              <label className={styles.field}>
                <span>{type === 'task' ? 'Prazo' : 'Data'}</span>
                <input className={styles.input} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </label>
              <label className={styles.field}>
                <span>Horário</span>
                <input className={styles.input} type="time" value={allDay ? '' : time} disabled={allDay} onChange={(e) => setTime(e.target.value)} />
              </label>
            </div>
            <label className={styles.check}>
              <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
              <span>{type === 'task' ? 'Sem horário' : 'Dia todo'}</span>
            </label>

            <label className={styles.field}>
              <span><Bell size={12} /> Lembrete no sino</span>
              <select className={styles.input} value={remind ?? ''} disabled={allDay} onChange={(e) => setRemind(e.target.value === '' ? null : Number(e.target.value))}>
                {REMINDERS.map((option) => <option key={String(option.value)} value={option.value ?? ''}>{option.label}</option>)}
              </select>
              {allDay && <small>Escolha um horário para receber lembrete.</small>}
            </label>

            <div className={styles.row}>
              <label className={styles.field}>
                <span>Lead (opcional)</span>
                <select className={styles.input} value={leadId} onChange={(e) => setLeadId(e.target.value)}>
                  <option value="">Nenhum</option>
                  {leadMissing && <option value={leadId}>{item?.leadName || 'Lead atual'}</option>}
                  {leads.map((lead) => <option key={lead.id} value={lead.id}>{lead.name}</option>)}
                </select>
              </label>
              <label className={styles.field}>
                <span>Responsável</span>
                {canAssign ? (
                  <select className={styles.input} value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
                    <option value="">Ninguém (equipe)</option>
                    {team.map((member) => <option key={member.id} value={member.id}>{member.id === meId ? `${member.name} (você)` : member.name}</option>)}
                  </select>
                ) : (
                  <input className={styles.input} value={!item || item.assignedTo === meId ? 'Você' : owner?.name || 'Equipe'} disabled />
                )}
              </label>
            </div>

            <div className={styles.row}>
              <label className={styles.field}>
                <span>Prioridade</span>
                <select className={styles.input} value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
                  {(Object.keys(PRIORITY_LABEL) as Priority[]).map((key) => <option key={key} value={key}>{PRIORITY_LABEL[key]}</option>)}
                </select>
              </label>
              <label className={styles.field}>
                <span>Situação</span>
                <select className={styles.input} value={status} onChange={(e) => setStatus(e.target.value as ItemStatus)}>
                  {(Object.keys(STATUS_LABEL) as ItemStatus[]).map((key) => <option key={key} value={key}>{STATUS_LABEL[key]}</option>)}
                </select>
              </label>
            </div>

            <label className={styles.field}>
              <span>Observações</span>
              <textarea className={styles.input} rows={3} maxLength={4000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Endereço, link da reunião, o que levar..." />
            </label>

            {!canEdit && <p className={styles.note}>Só quem criou, o responsável ou um gerente pode alterar este item.</p>}
            {error && <div className={styles.errorBox}>{error}</div>}
          </fieldset>
        </div>

        <footer className={styles.modalFoot}>
          {item && canEdit && (
            <button type="button" className={styles.dangerLink} onClick={remove} disabled={busy !== null}>
              {busy === 'delete' ? <Loader2 size={14} className={styles.spin} /> : <Trash2 size={14} />} Excluir
            </button>
          )}
          <span className={styles.grow} />
          <button type="button" className={styles.secondaryBtn} onClick={onClose}>{canEdit ? 'Cancelar' : 'Fechar'}</button>
          {canEdit && (
            <button type="button" className={styles.primaryBtn} onClick={save} disabled={busy !== null}>
              {busy === 'save' && <Loader2 size={15} className={styles.spin} />} {item ? 'Salvar' : 'Adicionar'}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
