"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Loader2, Plus, X } from 'lucide-react';
import { useLeads } from '@/context/LeadContext';
import { useAuth } from '@/context/AuthContext';
import styles from './NewLeadModal.module.css';
import TagPicker from './leads/TagPicker';
import { useTeam } from './leads/useTeam';

const EMPTY = { name: '', phone: '', email: '', cpfCnpj: '', value: '', pipelineStage: '', assignedTo: '', notes: '' };

/** Telefone enquanto digita: (11) 98888-7777. Números de fora ficam como estão. */
function formatPhone(input: string) {
  const d = input.replace(/\D/g, '');
  if (input.trim().startsWith('+') || d.length > 11) return input;
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

const NewLeadModal = () => {
  const { isModalOpen, closeModal, addLead, pipelineStages, tags: tagOptions } = useLeads();
  const { user } = useAuth();
  const canAssign = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const team = useTeam(isModalOpen && canAssign);

  const [form, setForm] = useState(EMPTY);
  const [tags, setTags] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [duplicate, setDuplicate] = useState<{ id: string | null; name: string | null } | null>(null);

  if (!isModalOpen) return null;

  const set = (field: keyof typeof EMPTY, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    if (field === 'phone') setDuplicate(null);
  };

  const close = () => {
    setForm(EMPTY);
    setTags([]);
    setError('');
    setDuplicate(null);
    closeModal();
  };

  const submit = async (force = false) => {
    setError('');
    setBusy(true);
    const result = await addLead(
      {
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        cpfCnpj: form.cpfCnpj.trim(),
        value: form.value,
        pipelineStage: form.pipelineStage || pipelineStages[0]?.id,
        assignedTo: canAssign ? form.assignedTo || null : user?.id ?? null,
        tags,
        notes: form.notes.trim(),
      },
      { force }
    );
    setBusy(false);
    if (result.ok) {
      close();
      return;
    }
    if (result.duplicate) setDuplicate(result.duplicate);
    else setError(result.error);
  };

  return (
    <div className={styles.overlay} onClick={close}>
      <form
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          submit(false);
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-lead-title"
      >
        <div className={styles.header}>
          <div>
            <h2 id="new-lead-title">Novo lead</h2>
            <p>{canAssign ? 'Cadastre o contato e escolha quem vai atender.' : 'O lead fica com você.'}</p>
          </div>
          <button type="button" className={styles.iconBtn} onClick={close} aria-label="Fechar"><X size={18} /></button>
        </div>

        <div className={styles.body}>
          <div className={styles.grid}>
            <label className={`${styles.field} ${styles.full}`}>
              <span>Nome *</span>
              <input className={styles.input} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Nome do contato ou empresa" maxLength={120} required autoFocus />
            </label>
            <label className={styles.field}>
              <span>WhatsApp / telefone *</span>
              <input className={styles.input} value={form.phone} onChange={(e) => set('phone', formatPhone(e.target.value))} placeholder="(11) 98888-7777" inputMode="tel" required />
            </label>
            <label className={styles.field}>
              <span>E-mail</span>
              <input className={styles.input} type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="contato@email.com" />
            </label>
            <label className={styles.field}>
              <span>CPF / CNPJ</span>
              <input className={styles.input} value={form.cpfCnpj} onChange={(e) => set('cpfCnpj', e.target.value)} placeholder="Somente se precisar" inputMode="numeric" />
            </label>
            <label className={styles.field}>
              <span>Valor estimado (R$)</span>
              <input className={styles.input} value={form.value} onChange={(e) => set('value', e.target.value.replace(/[^0-9.,]/g, ''))} placeholder="0,00" inputMode="decimal" />
            </label>
            <label className={styles.field}>
              <span>Etapa do funil</span>
              <select className={styles.input} value={form.pipelineStage || pipelineStages[0]?.id || ''} onChange={(e) => set('pipelineStage', e.target.value)}>
                {pipelineStages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
              </select>
            </label>
            {canAssign && (
              <label className={styles.field}>
                <span>Responsável</span>
                <select className={styles.input} value={form.assignedTo} onChange={(e) => set('assignedTo', e.target.value)}>
                  <option value="">Sem responsável</option>
                  {team.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
                </select>
              </label>
            )}
          </div>

          <div className={styles.field}>
            <span>Etiquetas</span>
            <TagPicker value={tags} options={tagOptions} onChange={setTags} />
          </div>

          <label className={styles.field}>
            <span>Observações</span>
            <textarea className={styles.input} rows={3} value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Como chegou, o que procura..." maxLength={4000} />
          </label>

          {duplicate && (
            <div className={styles.warn}>
              <AlertTriangle size={16} />
              <div>
                <strong>Este telefone já está cadastrado{duplicate.name ? `: ${duplicate.name}` : ' (lead de outro vendedor)'}.</strong>
                <p>Abra o lead que já existe ou cadastre mesmo assim (ficam dois leads com o mesmo número).</p>
                <div className={styles.warnActions}>
                  {duplicate.id && <Link href={`/leads?lead=${duplicate.id}`} className={styles.secondaryBtn} onClick={close}>Abrir o existente</Link>}
                  <button type="button" className={styles.secondaryBtn} onClick={() => submit(true)} disabled={busy}>Cadastrar mesmo assim</button>
                </div>
              </div>
            </div>
          )}
          {error && <div className={styles.error}><AlertTriangle size={16} /> {error}</div>}
        </div>

        <div className={styles.footer}>
          <button type="button" className={styles.secondaryBtn} onClick={close}>Cancelar</button>
          <button type="submit" className={styles.primaryBtn} disabled={busy}>
            {busy ? <Loader2 size={16} className={styles.spin} /> : <Plus size={16} />} Cadastrar lead
          </button>
        </div>
      </form>
    </div>
  );
};

export default NewLeadModal;
