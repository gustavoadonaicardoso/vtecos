'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ArrowLeft, Download, Loader2, Pause, Play, RotateCcw, Save, Settings2, Trash2 } from 'lucide-react';
import styles from '../discador.module.css';
import { formatPhone } from '@/lib/dialer/phone';
import {
  CAMPAIGN_STATUS_LABEL,
  CONTACT_STATUS_LABEL,
  RETRYABLE,
  outcomeLabel,
  type ContactStatus,
  type DialerCampaign,
  type DialerContact,
} from '@/lib/dialer/types';
import CampaignProgress from './CampaignProgress';
import { clock, request } from './shared';

type Detail = { campaign: DialerCampaign; contacts: DialerContact[]; filtered: number; page: number; pageSize: number };

const FILTERS: { key: string; label: string; statuses: ContactStatus[] }[] = [
  { key: '', label: 'Todos', statuses: [] },
  { key: 'pending', label: 'Na fila', statuses: ['pending'] },
  { key: 'completed', label: 'Atendidas', statuses: ['completed'] },
  { key: 'retry', label: 'Para ligar de novo', statuses: RETRYABLE },
];

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');

/** Uma campanha: números, resultados, gravações e ações. */
export default function CampaignDetail({ id, onBack, onChanged }: { id: string; onBack: () => void; onChanged: () => void }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState(false);
  const [settings, setSettings] = useState({ name: '', callsPerAgent: 1, ringSeconds: 25, detectVoicemail: true });

  const fetchDetail = useCallback(() => request<Detail>(`/api/dialer/campaigns/${id}?status=${filter}&page=${page}`), [id, filter, page]);
  const apply = useCallback((result: { data?: Detail; error?: string }) => {
    if (result.error) setError(result.error);
    if (result.data) setDetail(result.data);
  }, []);

  useEffect(() => {
    fetchDetail().then(apply);
    const timer = setInterval(() => fetchDetail().then(apply), 5000);
    return () => clearInterval(timer);
  }, [fetchDetail, apply]);

  const act = async (body: Record<string, unknown>, label: string) => {
    setBusy(label);
    setError('');
    setNotice('');
    const result = await request<{ requeued?: number }>(`/api/dialer/campaigns/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
    setBusy(null);
    if (result.error) {
      setError(result.error);
      return false;
    }
    if (body.action === 'requeue') setNotice(`${result.data?.requeued || 0} contato(s) voltaram para a fila.`);
    apply(await fetchDetail());
    onChanged();
    return true;
  };

  const remove = async () => {
    if (!detail || !window.confirm(`Apagar a campanha "${detail.campaign.name}" e todos os resultados? As gravações continuam na sua conta Twilio.`)) return;
    setBusy('delete');
    const result = await request(`/api/dialer/campaigns/${id}`, { method: 'DELETE' });
    setBusy(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    onChanged();
    onBack();
  };

  if (!detail) {
    return (
      <section className={styles.card}>
        <button type="button" className={styles.ghostBtn} onClick={onBack}><ArrowLeft size={16} /> Campanhas</button>
        {error ? <div className={styles.errorBox}><AlertTriangle size={16} /> {error}</div> : <p className={styles.hint}><Loader2 size={14} className={styles.spin} /> Carregando…</p>}
      </section>
    );
  }

  const { campaign, contacts } = detail;
  const retryCount = RETRYABLE.reduce((sum, status) => sum + (campaign.counts[status] || 0), 0);
  const lastPage = Math.max(0, Math.ceil(detail.filtered / detail.pageSize) - 1);

  return (
    <section className={styles.card}>
      <div className={styles.detailHead}>
        <button type="button" className={styles.iconBtn} onClick={onBack} aria-label="Voltar para as campanhas"><ArrowLeft size={18} /></button>
        <div className={styles.grow}>
          <h2>{campaign.name}</h2>
          <span className={styles.pill} data-status={campaign.status}>{CAMPAIGN_STATUS_LABEL[campaign.status]}</span>
        </div>
        <div className={styles.campaignActions}>
          {campaign.status === 'running' ? (
            <button type="button" className={styles.secondaryBtn} disabled={Boolean(busy)} onClick={() => act({ action: 'pause' }, 'pause')}>
              {busy === 'pause' ? <Loader2 size={15} className={styles.spin} /> : <Pause size={15} />} Pausar
            </button>
          ) : (campaign.counts.pending || 0) > 0 ? (
            <button type="button" className={styles.callBtn} disabled={Boolean(busy)} onClick={() => act({ action: 'start' }, 'start')}>
              {busy === 'start' ? <Loader2 size={15} className={styles.spin} /> : <Play size={15} />} {campaign.status === 'draft' ? 'Começar' : 'Retomar'}
            </button>
          ) : null}
          <button type="button" className={styles.secondaryBtn} disabled={Boolean(busy) || retryCount === 0} onClick={() => act({ action: 'requeue' }, 'requeue')} title="Não atendeu, ocupado, caixa postal, sem atendente livre e falhas">
            {busy === 'requeue' ? <Loader2 size={15} className={styles.spin} /> : <RotateCcw size={15} />} Ligar de novo ({retryCount})
          </button>
          <a className={styles.secondaryBtn} href={`/api/dialer/campaigns/${id}/export`}><Download size={15} /> Exportar</a>
          <button type="button" className={styles.ghostBtn} onClick={() => { setSettings({ name: campaign.name, callsPerAgent: campaign.callsPerAgent, ringSeconds: campaign.ringSeconds, detectVoicemail: campaign.detectVoicemail }); setEditing(!editing); }}>
            <Settings2 size={15} /> Ajustes
          </button>
          {campaign.status !== 'running' && (
            <button type="button" className={styles.dangerBtn} disabled={Boolean(busy)} onClick={remove}><Trash2 size={15} /> Apagar</button>
          )}
        </div>
      </div>

      {campaign.lastError && <div className={styles.errorBox}><AlertTriangle size={16} /> <span>A campanha foi pausada: {campaign.lastError}</span></div>}
      {error && <div className={styles.errorBox}><AlertTriangle size={16} /> <span>{error}</span></div>}
      {notice && <div className={styles.okBox}><RotateCcw size={16} /> <span>{notice}</span></div>}

      {editing && (
        <div className={styles.card} style={{ background: 'var(--soft)' }}>
          <div className={styles.grid2}>
            <label className={styles.field}>
              <span>Nome</span>
              <input className={styles.input} value={settings.name} maxLength={120} onChange={(event) => setSettings({ ...settings, name: event.target.value })} />
            </label>
            <label className={styles.field}>
              <span>Tempo tocando</span>
              <select className={styles.input} value={settings.ringSeconds} onChange={(event) => setSettings({ ...settings, ringSeconds: Number(event.target.value) })}>
                {[15, 20, 25, 30, 40].map((value) => <option key={value} value={value}>{value} segundos</option>)}
              </select>
            </label>
          </div>
          <div className={styles.row}>
            <span className={styles.hint}>Ligações por atendente livre:</span>
            <div className={styles.chips}>
              {[1, 2, 3].map((value) => (
                <button key={value} type="button" className={`${styles.chip} ${settings.callsPerAgent === value ? styles.chipOn : ''}`} onClick={() => setSettings({ ...settings, callsPerAgent: value })}>{value}</button>
              ))}
            </div>
            <label className={styles.check}>
              <input type="checkbox" checked={settings.detectVoicemail} onChange={(event) => setSettings({ ...settings, detectVoicemail: event.target.checked })} />
              Detectar caixa postal
            </label>
          </div>
          <div className={styles.row}>
            <button type="button" className={styles.primaryBtn} disabled={Boolean(busy)} onClick={async () => { if (await act({ action: 'settings', ...settings }, 'settings')) setEditing(false); }}>
              {busy === 'settings' ? <Loader2 size={15} className={styles.spin} /> : <Save size={15} />} Salvar ajustes
            </button>
            <button type="button" className={styles.ghostBtn} onClick={() => setEditing(false)}>Cancelar</button>
          </div>
        </div>
      )}

      <div className={styles.stats}>
        <div className={styles.stat}><strong>{campaign.total}</strong><span>contatos</span></div>
        <div className={styles.stat}><strong>{campaign.counts.completed || 0}</strong><span>atendidas</span></div>
        <div className={styles.stat}><strong>{(campaign.counts.no_answer || 0) + (campaign.counts.busy || 0)}</strong><span>não atendeu / ocupado</span></div>
        <div className={styles.stat}><strong>{campaign.counts.voicemail || 0}</strong><span>caixa postal</span></div>
        <div className={styles.stat}><strong>{campaign.counts.abandoned || 0}</strong><span>sem atendente livre</span></div>
        <div className={styles.stat}><strong>{campaign.counts.pending || 0}</strong><span>na fila</span></div>
      </div>
      <CampaignProgress counts={campaign.counts} total={campaign.total} />

      <div className={styles.chips}>
        {FILTERS.map((item) => {
          const count = item.statuses.length ? item.statuses.reduce((sum, status) => sum + (campaign.counts[status] || 0), 0) : campaign.total;
          return (
            <button key={item.key} type="button" className={`${styles.chip} ${filter === item.key ? styles.chipOn : ''}`} onClick={() => { setFilter(item.key); setPage(0); }}>
              {item.label} <small>{count}</small>
            </button>
          );
        })}
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr><th>Contato</th><th>Situação</th><th>Resultado</th><th>Atendente</th><th>Conversa</th><th>Gravação</th></tr>
          </thead>
          <tbody>
            {contacts.length === 0 && <tr><td colSpan={6} className={styles.muted}>Nenhum contato nesta lista.</td></tr>}
            {contacts.map((contact) => (
              <tr key={contact.id}>
                <td>
                  {contact.name || 'Sem nome'}
                  <small>{formatPhone(contact.phone)}</small>
                </td>
                <td>
                  <span className={styles.status} data-status={contact.status}>{CONTACT_STATUS_LABEL[contact.status]}</span>
                  <small>{contact.attempts > 0 ? `${contact.attempts} tentativa(s)` : ''}{contact.dialedAt ? ` · ${when(contact.dialedAt)}` : ''}</small>
                  {contact.error && <small>{contact.error}</small>}
                </td>
                <td>
                  {outcomeLabel(contact.outcome) || <span className={styles.muted}>—</span>}
                  {contact.notes && <small>{contact.notes}</small>}
                </td>
                <td>{contact.agentName || <span className={styles.muted}>—</span>}</td>
                <td>{contact.talkSeconds ? clock(contact.talkSeconds) : <span className={styles.muted}>—</span>}</td>
                <td>
                  {contact.hasRecording ? <audio className={styles.audio} controls preload="none" src={`/api/calls/recording?contact=${contact.id}`} /> : <span className={styles.muted}>—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {detail.filtered > detail.pageSize && (
        <div className={styles.pager}>
          <span>{page * detail.pageSize + 1}–{Math.min(detail.filtered, (page + 1) * detail.pageSize)} de {detail.filtered}</span>
          <div className={styles.row}>
            <button type="button" className={styles.secondaryBtn} disabled={page === 0} onClick={() => setPage(page - 1)}>Anterior</button>
            <button type="button" className={styles.secondaryBtn} disabled={page >= lastPage} onClick={() => setPage(page + 1)}>Próxima</button>
          </div>
        </div>
      )}
    </section>
  );
}
