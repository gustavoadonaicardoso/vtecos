'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Ban, Loader2, MessageSquare, Trash2, X } from 'lucide-react';
import styles from '../leads.module.css';
import type { Lead, LeadTag, PipelineStage } from '@/types';
import TagPicker from '@/components/leads/TagPicker';
import type { TeamMember } from '@/components/leads/useTeam';
import { formatDateTime, initials, moneyInput, parseMoneyInput } from '../format';

interface LeadPanelProps {
  lead: Lead;
  stages: PipelineStage[];
  team: TeamMember[];
  tagOptions: LeadTag[];
  canAssign: boolean;
  onSave: (changes: Record<string, unknown>) => Promise<string | null>;
  onDelete: () => Promise<string | null>;
  onClose: () => void;
  /** Em Mensagens o painel abre ao lado da própria conversa. */
  hideConversation?: boolean;
}

type Draft = { name: string; phone: string; email: string; cpfCnpj: string; value: string; pipelineStage: string; assignedTo: string; tags: string[]; notes: string; blocked: boolean };

const toDraft = (lead: Lead): Draft => ({
  name: lead.name,
  phone: lead.phone,
  email: lead.email,
  cpfCnpj: lead.cpfCnpj,
  value: moneyInput(lead.valueNumber ?? 0),
  pipelineStage: lead.pipelineStage,
  assignedTo: lead.assignedTo || '',
  tags: lead.tags,
  notes: lead.notes || '',
  blocked: lead.status === 'Bloqueado',
});

export default function LeadPanel({ lead, stages, team, tagOptions, canAssign, onSave, onDelete, onClose, hideConversation }: LeadPanelProps) {
  const router = useRouter();
  const original = toDraft(lead);
  const [draft, setDraft] = useState<Draft>(original);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));

  // Só o que mudou vai para o servidor.
  const changes: Record<string, unknown> = {};
  if (draft.name !== original.name) changes.name = draft.name.trim();
  if (draft.phone !== original.phone) changes.phone = draft.phone.trim();
  if (draft.email !== original.email) changes.email = draft.email.trim();
  if (draft.cpfCnpj !== original.cpfCnpj) changes.cpfCnpj = draft.cpfCnpj.trim();
  if (parseMoneyInput(draft.value) !== (lead.valueNumber ?? 0)) changes.value = parseMoneyInput(draft.value);
  if (draft.pipelineStage !== original.pipelineStage) changes.pipelineStage = draft.pipelineStage;
  if (draft.assignedTo !== original.assignedTo) changes.assignedTo = draft.assignedTo || null;
  if (JSON.stringify(draft.tags) !== JSON.stringify(original.tags)) changes.tags = draft.tags;
  if (draft.notes !== original.notes) changes.notes = draft.notes;
  if (draft.blocked !== original.blocked) changes.status = draft.blocked ? 'Bloqueado' : 'Ativo';
  const dirty = Object.keys(changes).length > 0;

  const save = async () => {
    setBusy(true);
    setError('');
    const failure = await onSave(changes);
    setBusy(false);
    if (failure) setError(failure);
  };

  const remove = async () => {
    if (!confirm(`Excluir o lead ${lead.name}? As conversas dele deixam de aparecer e não dá para desfazer.`)) return;
    setBusy(true);
    const failure = await onDelete();
    setBusy(false);
    if (failure) setError(failure);
  };

  const close = () => {
    if (dirty && !confirm('Descartar as alterações deste lead?')) return;
    onClose();
  };

  const owner = team.find((member) => member.id === lead.assignedTo);

  return (
    <div className={styles.panelOverlay} onClick={close}>
      <aside className={styles.panel} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={`Lead ${lead.name}`}>
        <header className={styles.panelHead}>
          <span className={styles.avatarLg}>{initials(lead.name)}</span>
          <div className={styles.panelTitle}>
            <h2>{lead.name}</h2>
            <p>{lead.phone}{lead.status === 'Bloqueado' && <span className={styles.blockedTag}><Ban size={11} /> Bloqueado</span>}</p>
          </div>
          <button type="button" className={styles.iconBtn} onClick={close} aria-label="Fechar"><X size={18} /></button>
        </header>

        {!hideConversation && (
          <div className={styles.panelActions}>
            <button type="button" className={styles.primaryBtn} onClick={() => router.push(`/messages?chatId=${lead.id}`)}>
              <MessageSquare size={15} /> Abrir conversa
            </button>
          </div>
        )}

        <div className={styles.panelBody}>
          <dl className={styles.facts}>
            {lead.protocol && <div><dt>Protocolo</dt><dd>{lead.protocol}</dd></div>}
            <div><dt>Origem</dt><dd>{lead.source || 'Não informada'}</dd></div>
            <div><dt>Entrou em</dt><dd>{lead.createdAt ? formatDateTime(lead.createdAt) : lead.entryDate}</dd></div>
            <div><dt>Última mensagem</dt><dd>{lead.lastMsg || '—'}</dd></div>
            {!canAssign && <div><dt>Responsável</dt><dd>{owner?.name || 'Você'}</dd></div>}
          </dl>

          <div className={styles.formGrid}>
            <label className={`${styles.field} ${styles.full}`}>
              <span>Nome</span>
              <input className={styles.input} value={draft.name} maxLength={120} onChange={(e) => set('name', e.target.value)} />
            </label>
            <label className={styles.field}>
              <span>Telefone / WhatsApp</span>
              <input className={styles.input} value={draft.phone} inputMode="tel" onChange={(e) => set('phone', e.target.value)} />
            </label>
            <label className={styles.field}>
              <span>E-mail</span>
              <input className={styles.input} type="email" value={draft.email} onChange={(e) => set('email', e.target.value)} />
            </label>
            <label className={styles.field}>
              <span>CPF / CNPJ</span>
              <input className={styles.input} value={draft.cpfCnpj} inputMode="numeric" onChange={(e) => set('cpfCnpj', e.target.value)} />
            </label>
            <label className={styles.field}>
              <span>Valor (R$)</span>
              <input className={styles.input} value={draft.value} inputMode="decimal" onChange={(e) => set('value', e.target.value.replace(/[^0-9.,]/g, ''))} />
            </label>
            <label className={styles.field}>
              <span>Etapa do funil</span>
              <select className={styles.input} value={draft.pipelineStage} onChange={(e) => set('pipelineStage', e.target.value)}>
                {!stages.some((stage) => stage.id === draft.pipelineStage) && <option value={draft.pipelineStage}>Etapa removida</option>}
                {stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
              </select>
            </label>
            {canAssign && (
              <label className={styles.field}>
                <span>Responsável</span>
                <select className={styles.input} value={draft.assignedTo} onChange={(e) => set('assignedTo', e.target.value)}>
                  <option value="">Sem responsável</option>
                  {draft.assignedTo && !team.some((member) => member.id === draft.assignedTo) && <option value={draft.assignedTo}>Membro removido/inativo</option>}
                  {team.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
                </select>
              </label>
            )}
          </div>

          <div className={styles.field}>
            <span>Etiquetas</span>
            <TagPicker value={draft.tags} options={tagOptions} onChange={(tags) => set('tags', tags)} />
          </div>

          <label className={styles.field}>
            <span>Observações</span>
            <textarea className={styles.input} rows={4} value={draft.notes} maxLength={4000} onChange={(e) => set('notes', e.target.value)} placeholder="Anotações sobre o atendimento, preferências, combinados..." />
          </label>

          <label className={styles.blockRow}>
            <input type="checkbox" checked={draft.blocked} onChange={(e) => set('blocked', e.target.checked)} />
            <span>
              <strong>Bloquear contato</strong>
              <small>Automações não rodam para ele. Use para spam ou quem pediu para não receber mensagens.</small>
            </span>
          </label>

          {error && <div className={styles.errorBox}>{error}</div>}

          <button type="button" className={styles.dangerLink} onClick={remove} disabled={busy}><Trash2 size={14} /> Excluir lead</button>
        </div>

        {dirty && (
          <div className={styles.saveBar}>
            <span>Alterações não salvas</span>
            <button type="button" className={styles.secondaryBtn} onClick={() => setDraft(original)} disabled={busy}>Descartar</button>
            <button type="button" className={styles.primaryBtn} onClick={save} disabled={busy}>
              {busy && <Loader2 size={15} className={styles.spin} />} Salvar
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}
