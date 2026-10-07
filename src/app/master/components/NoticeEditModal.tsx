import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Info, Loader2, Save, Wrench, X } from 'lucide-react';
import { motion } from 'framer-motion';
import styles from '../master.module.css';
import bar from '@/components/StatusBar.module.css';
import { noticeContext } from '@/lib/status/format';
import { KIND_LABEL, STATUS_SERVICES, type NoticeAudience, type NoticeKind } from '@/lib/status/types';

export interface NoticeDraft {
  id?: string;
  kind: NoticeKind;
  title: string;
  message: string;
  services: string[];
  audience: NoticeAudience;
  targetTenants: string[];
  /** ISO; vazio = agora. */
  startsAt: string;
  endsAt: string;
  healthService?: string | null;
}

interface Props {
  notice: NoticeDraft;
  tenants: { id: string; name: string }[];
  onClose: () => void;
  /** Devolve a mensagem de erro, ou null se salvou. */
  onSave: (notice: NoticeDraft) => Promise<string | null>;
}

const KIND_ICON = { incident: AlertTriangle, maintenance: Wrench, info: Info };

/** ISO → valor de <input type="datetime-local"> no horário local. */
const toLocalInput = (iso: string) => {
  if (!iso) return '';
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
const fromLocalInput = (value: string) => (value ? new Date(value).toISOString() : '');

/** Cria ou edita um aviso de status, com a prévia da faixa como o cliente vai ver. */
export default function NoticeEditModal({ notice, tenants, onClose, onSave }: Props) {
  const [draft, setDraft] = useState<NoticeDraft>(notice);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Hora de abertura do editor: base da prévia quando o início fica vazio (= agora).
  const [openedAt] = useState(() => Date.now());
  const isNew = !notice.id;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const set = <K extends keyof NoticeDraft>(key: K, value: NoticeDraft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const toggle = (key: 'services' | 'targetTenants', value: string) =>
    setDraft((current) => ({ ...current, [key]: current[key].includes(value) ? current[key].filter((item) => item !== value) : [...current[key], value] }));

  const filteredTenants = useMemo(() => {
    const term = search.trim().toLowerCase();
    return tenants.filter((tenant) => !term || tenant.name.toLowerCase().includes(term));
  }, [tenants, search]);

  const save = async () => {
    setBusy(true);
    setError('');
    const message = await onSave(draft);
    setBusy(false);
    if (message) setError(message);
  };

  // Prévia: como a faixa vai aparecer (programado se o início for no futuro).
  const start = draft.startsAt || new Date(openedAt).toISOString();
  const previewPhase = new Date(start).getTime() > openedAt ? 'scheduled' : 'active';
  const PreviewIcon = KIND_ICON[draft.kind];
  const context = noticeContext({ kind: draft.kind, phase: previewPhase, services: draft.services, startsAt: start, endsAt: draft.kind === 'incident' ? null : draft.endsAt || null, resolvedAt: null });

  return (
    <div className={styles.overlay} onClick={() => !busy && onClose()}>
      <motion.div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label={isNew ? 'Novo aviso de status' : 'Editar aviso de status'}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.modalHead}>
          <h2>{isNew ? 'Novo aviso de status' : 'Editar aviso'}</h2>
          <button className={styles.iconButton} onClick={onClose} disabled={busy} aria-label="Fechar"><X size={18} /></button>
        </div>

        <div className={styles.field}>
          <span className={styles.fieldLabel}>Tipo</span>
          <div className={styles.chipRow}>
            {(Object.keys(KIND_LABEL) as NoticeKind[]).map((kind) => (
              <button key={kind} type="button" className={`${styles.chip} ${draft.kind === kind ? styles.chipActive : ''}`} onClick={() => set('kind', kind)}>
                {KIND_LABEL[kind]}
              </button>
            ))}
          </div>
        </div>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Título</span>
          <input className={styles.input} value={draft.title} maxLength={120} placeholder={draft.kind === 'maintenance' ? 'Ex.: Manutenção no servidor' : 'Ex.: Instabilidade no envio de mensagens'} onChange={(event) => set('title', event.target.value)} />
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Mensagem para os clientes</span>
          <textarea className={styles.input} rows={3} maxLength={1000} value={draft.message} placeholder="O que está acontecendo, o que o cliente pode fazer enquanto isso e quando atualizaremos." onChange={(event) => set('message', event.target.value)} />
        </label>

        <div className={styles.field}>
          <span className={styles.fieldLabel}>O que é afetado</span>
          <div className={styles.chipRow}>
            {STATUS_SERVICES.map((service) => (
              <button key={service.key} type="button" className={`${styles.chip} ${draft.services.includes(service.key) ? styles.chipActive : ''}`} onClick={() => toggle('services', service.key)}>
                {service.label}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.formRow2}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>{draft.kind === 'maintenance' ? 'Início' : 'Início (vazio = agora)'}</span>
            <input type="datetime-local" className={styles.input} value={toLocalInput(draft.startsAt)} onChange={(event) => set('startsAt', fromLocalInput(event.target.value))} />
          </label>
          {draft.kind !== 'incident' && (
            <label className={styles.field}>
              <span className={styles.fieldLabel}>{draft.kind === 'maintenance' ? 'Fim previsto' : 'Sai do ar em (opcional)'}</span>
              <input type="datetime-local" className={styles.input} value={toLocalInput(draft.endsAt)} onChange={(event) => set('endsAt', fromLocalInput(event.target.value))} />
            </label>
          )}
        </div>
        <small className={styles.fieldHint}>
          {draft.kind === 'incident'
            ? 'A instabilidade fica no topo até você clicar em Encerrar. Os clientes não conseguem fechar a faixa.'
            : draft.kind === 'maintenance'
              ? 'A faixa aparece 3 dias antes do início e some sozinha no fim previsto.'
              : 'Sem data de saída, fica até você encerrar.'}
        </small>

        <div className={styles.field}>
          <span className={styles.fieldLabel}>Quem vê</span>
          <div className={styles.chipRow}>
            <button type="button" className={`${styles.chip} ${draft.audience === 'all' ? styles.chipActive : ''}`} onClick={() => set('audience', 'all')}>Todas as empresas</button>
            <button type="button" className={`${styles.chip} ${draft.audience === 'tenants' ? styles.chipActive : ''}`} onClick={() => set('audience', 'tenants')}>Escolher empresas</button>
          </div>
          {draft.audience === 'tenants' && (
            <>
              <input className={styles.input} placeholder="Buscar empresa…" value={search} onChange={(event) => setSearch(event.target.value)} />
              <div className={styles.tenantPick}>
                {filteredTenants.map((tenant) => (
                  <label key={tenant.id}>
                    <input type="checkbox" checked={draft.targetTenants.includes(tenant.id)} onChange={() => toggle('targetTenants', tenant.id)} />
                    {tenant.name}
                  </label>
                ))}
                {filteredTenants.length === 0 && <span className={styles.fieldHint}>Nenhuma empresa encontrada.</span>}
              </div>
              <small className={styles.fieldHint}>{draft.targetTenants.length} empresa(s) escolhida(s).</small>
            </>
          )}
        </div>

        <div className={styles.field}>
          <span className={styles.fieldLabel}>Prévia</span>
          <div className={`${bar.bar} ${bar[draft.kind]} ${styles.noticePreview}`}>
            <div className={bar.row}>
              <PreviewIcon size={16} className={bar.icon} />
              <span className={bar.text}>
                <strong>{draft.title || 'Título do aviso'}</strong>
                <span className={bar.context}>{context}</span>
              </span>
            </div>
          </div>
        </div>

        {error && <p className={styles.testFail}><AlertTriangle size={15} /> {error}</p>}

        <div className={styles.modalActions}>
          <button type="button" className={styles.resetBtn} onClick={onClose} disabled={busy}>Cancelar</button>
          <button type="button" className={styles.saveBtn} onClick={save} disabled={busy}>
            {busy ? <Loader2 size={16} className={styles.spin} /> : <Save size={16} />} {isNew ? 'Publicar aviso' : 'Salvar'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
