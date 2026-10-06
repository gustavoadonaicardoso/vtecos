'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Clock,
  Copy,
  Loader2,
  MessageCircle,
  Pause,
  Play,
  RotateCcw,
  Search,
  Trash2,
  XCircle,
} from 'lucide-react';
import styles from '../disparos.module.css';
import { api, dateTime, percent, PhonePreview, Progress, StatusBadge } from '../components/Bits';
import {
  CONTACT_STATUS_LABEL,
  estimateFinish,
  formatDuration,
  type CampaignContact,
  type CampaignDetail,
} from '@/lib/disparos';
import { WEEKDAYS } from '@/lib/automations/flow';

type Filter = 'all' | 'pending' | 'sent' | 'failed' | 'skipped' | 'replied';
type Data = { campaign: CampaignDetail; contacts: CampaignContact[]; total: number };

const formatPhone = (phone: string) => phone.replace(/^55(\d{2})(\d{4,5})(\d{4})$/, '($1) $2-$3');

export default function CampaignPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState('');
  const [scheduling, setScheduling] = useState(false);
  const [scheduleAt, setScheduleAt] = useState('');
  const [clock, setClock] = useState(() => Date.now());

  const load = useCallback(async () => {
    const params = new URLSearchParams({ filter, q: query, page: String(page) });
    const result = await api<Data>(`/api/disparos/campaigns/${id}?${params}`);
    if (result.data) setData(result.data);
    setError(result.error || '');
    setClock(Date.now());
  }, [id, filter, query, page]);

  useEffect(() => {
    const timer = window.setTimeout(load, query ? 300 : 0);
    return () => window.clearTimeout(timer);
  }, [load, query]);

  // Ao vivo enquanto envia ou espera a hora.
  const live = data?.campaign.status === 'running' || data?.campaign.status === 'scheduled';
  useEffect(() => {
    if (!live) return;
    const timer = window.setInterval(load, 5000);
    return () => window.clearInterval(timer);
  }, [live, load]);

  const act = async (action: string, extra: Record<string, unknown> = {}, confirmText?: string) => {
    if (confirmText && !confirm(confirmText)) return;
    setBusy(action);
    const result = await api<{ id?: string }>(`/api/disparos/campaigns/${id}/action`, { method: 'POST', body: JSON.stringify({ action, ...extra }) });
    setBusy('');
    if (result.error) { setError(result.error); return; }
    if (action === 'duplicate' && result.data?.id) { router.push(`/disparos/${result.data.id}`); return; }
    setNotice({ start: 'Envio iniciado.', resume: 'Envio retomado.', pause: 'Campanha pausada.', cancel: 'Campanha cancelada.', retry_failed: 'As falhas voltaram para a fila.', schedule: 'Campanha agendada.' }[action] || '');
    setScheduling(false);
    load();
  };

  const remove = async () => {
    if (!confirm('Excluir a campanha e o histórico de envios? Isso não pode ser desfeito.')) return;
    const result = await api(`/api/disparos/campaigns/${id}`, { method: 'DELETE' });
    if (result.error) { setError(result.error); return; }
    router.push('/disparos');
  };

  if (!data) {
    return (
      <div className={styles.page}>
        <Link href="/disparos" className={styles.backLink}><ArrowLeft size={15} /> Disparos</Link>
        {error ? <div className={styles.errorBox}><AlertTriangle size={16} /><span>{error}</span></div> : <div className={styles.loading}><Loader2 size={20} className={styles.spin} /> Carregando...</div>}
      </div>
    );
  }

  const { campaign, contacts, total } = data;
  const counts = campaign.counts;
  const status = campaign.status;
  const finish = status === 'running' || status === 'scheduled'
    ? estimateFinish(counts.pending, { delayMin: campaign.delay_min, delayMax: campaign.delay_max, window: campaign.send_window, dailyLimit: campaign.daily_limit, sentToday: campaign.sent_today, from: status === 'scheduled' && campaign.scheduled_at ? new Date(campaign.scheduled_at) : new Date(clock) })
    : null;
  const nextIn = campaign.next_send_at ? new Date(campaign.next_send_at).getTime() - clock : 0;
  const tabs: { id: Filter; label: string; count: number }[] = [
    { id: 'all', label: 'Todos', count: counts.total },
    { id: 'pending', label: 'Na fila', count: counts.pending },
    { id: 'sent', label: 'Enviadas', count: counts.sent },
    { id: 'failed', label: 'Falhas', count: counts.failed },
    { id: 'skipped', label: 'Puladas', count: counts.skipped },
    { id: 'replied', label: 'Responderam', count: counts.replied },
  ];
  const sendWindow = campaign.send_window;

  return (
    <div className={styles.page}>
      <div className={styles.detailHead}>
        <div className={styles.detailTitle}>
          <Link href="/disparos" className={styles.backLink}><ArrowLeft size={15} /> Disparos</Link>
          <h1>{campaign.name}</h1>
          <div className={styles.row}>
            <StatusBadge status={status} />
            <span className={styles.channelTag}>{campaign.channel === 'api' ? 'API oficial' : 'WhatsApp Web'}</span>
            <span className={styles.hint}>Criada em {dateTime(campaign.created_at)}</span>
          </div>
        </div>
        <div className={styles.headerActions}>
          {(status === 'draft' || status === 'paused' || status === 'scheduled') && (
            <button type="button" className={styles.primaryBtn} disabled={Boolean(busy)} onClick={() => act(status === 'paused' ? 'resume' : 'start')}>
              {busy === 'start' || busy === 'resume' ? <Loader2 size={15} className={styles.spin} /> : <Play size={15} />} {status === 'paused' ? 'Retomar' : status === 'scheduled' ? 'Começar agora' : 'Iniciar envio'}
            </button>
          )}
          {(status === 'draft' || status === 'paused') && <button type="button" className={styles.secondaryBtn} onClick={() => setScheduling((value) => !value)}><CalendarClock size={15} /> Agendar</button>}
          {(status === 'running' || status === 'scheduled') && (
            <button type="button" className={styles.secondaryBtn} disabled={Boolean(busy)} onClick={() => act('pause')}>{busy === 'pause' ? <Loader2 size={15} className={styles.spin} /> : <Pause size={15} />} Pausar</button>
          )}
          {counts.failed > 0 && status !== 'canceled' && (
            <button type="button" className={styles.secondaryBtn} disabled={Boolean(busy)} onClick={() => act('retry_failed', {}, `Colocar as ${counts.failed} falhas na fila de novo?`)}><RotateCcw size={15} /> Reenviar falhas</button>
          )}
          <button type="button" className={styles.secondaryBtn} disabled={Boolean(busy)} onClick={() => act('duplicate')}><Copy size={15} /> Duplicar</button>
          {!['completed', 'canceled', 'draft'].includes(status) && (
            <button type="button" className={styles.dangerBtn} disabled={Boolean(busy)} onClick={() => act('cancel', {}, 'Cancelar a campanha? Quem ainda está na fila não recebe.')}><XCircle size={15} /> Cancelar</button>
          )}
          {status !== 'running' && <button type="button" className={styles.iconBtn} aria-label="Excluir campanha" onClick={remove}><Trash2 size={16} /></button>}
        </div>
      </div>

      {scheduling && (
        <div className={styles.card}>
          <div className={styles.row}>
            <input className={`${styles.input} ${styles.grow}`} type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} />
            <button type="button" className={styles.primaryBtn} disabled={!scheduleAt || busy === 'schedule'} onClick={() => act('schedule', { scheduledAt: new Date(scheduleAt).toISOString() })}><CalendarClock size={15} /> Confirmar</button>
          </div>
        </div>
      )}

      {error && <div className={styles.errorBox}><AlertTriangle size={16} /><span>{error}</span></div>}
      {notice && !error && <div className={styles.okBox}><CheckCircle2 size={16} /><span>{notice}</span></div>}
      {status === 'paused' && campaign.last_error && <div className={styles.errorBox}><AlertTriangle size={16} /><span>{campaign.status_detail || campaign.last_error} Corrija e clique em Retomar.</span></div>}
      {campaign.status_detail && !(status === 'paused' && campaign.last_error) && status !== 'completed' && <div className={styles.banner}><Clock size={16} /><span>{campaign.status_detail}</span></div>}
      {status === 'scheduled' && campaign.scheduled_at && <div className={styles.banner}><CalendarClock size={16} /><span>Começa sozinha em {dateTime(campaign.scheduled_at)}.</span></div>}

      <div className={styles.detailStats}>
        <div className={`${styles.stat} ${styles.statOk}`}><span>Enviadas</span><strong>{counts.sent}</strong><small>{percent(counts.sent, counts.total)} da lista</small></div>
        <div className={styles.stat}><span>Na fila</span><strong>{counts.pending}</strong><small>{campaign.daily_limit ? `hoje ${campaign.sent_today}/${campaign.daily_limit}` : `${campaign.sent_today} hoje`}</small></div>
        <div className={styles.stat}><span>Responderam</span><strong>{counts.replied}</strong><small>{percent(counts.replied, counts.sent)} de quem recebeu</small></div>
        <div className={`${styles.stat} ${counts.failed ? styles.statBad : ''}`}><span>Falhas</span><strong>{counts.failed}</strong><small>{percent(counts.failed, counts.total)}</small></div>
        <div className={styles.stat}><span>Puladas</span><strong>{counts.skipped}</strong><small>inválidas, repetidas, descadastradas</small></div>
        <div className={`${styles.stat} ${counts.optouts ? styles.statWarn : ''}`}><span>Pediram para sair</span><strong>{counts.optouts}</strong><small>{percent(counts.optouts, counts.sent)}</small></div>
      </div>

      <div className={styles.detailGrid}>
        <div className={styles.wizardMain}>
          <div className={styles.card}>
            <Progress counts={counts} />
            <div className={styles.progressInfo}>
              <div className={styles.legend}>
                <span><i style={{ background: 'var(--ok)' }} />Enviadas</span>
                <span><i style={{ background: 'var(--bad)' }} />Falhas</span>
                <span><i style={{ background: 'var(--muted)' }} />Puladas</span>
              </div>
              <span>
                {status === 'running' && nextIn > 0 && nextIn < 3600_000 ? `Próxima em ~${Math.max(1, Math.round(nextIn / 1000))}s · ` : ''}
                {finish ? `Previsão de término: ${finish.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} (${formatDuration(finish.getTime() - clock)})` : status === 'completed' ? `Concluída em ${dateTime(campaign.finished_at)}` : ''}
              </span>
            </div>
          </div>

          <div className={styles.card}>
            <div className={styles.cardHead}>
              <div className={styles.tabs}>
                {tabs.map((tab) => (
                  <button key={tab.id} type="button" className={`${styles.tab} ${filter === tab.id ? styles.tabOn : ''}`} onClick={() => { setFilter(tab.id); setPage(0); }}>
                    {tab.label}<b>{tab.count}</b>
                  </button>
                ))}
              </div>
            </div>
            <label className={styles.searchBox}><Search size={14} /><input placeholder="Buscar por nome ou telefone" value={query} onChange={(e) => { setQuery(e.target.value); setPage(0); }} /></label>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead><tr><th>Contato</th><th>Situação</th><th>Mensagem</th><th>Quando</th></tr></thead>
                <tbody>
                  {contacts.length === 0 && <tr><td colSpan={4} className={styles.muted}>Nenhum contato aqui.</td></tr>}
                  {contacts.map((contact) => (
                    <tr key={contact.id}>
                      <td>
                        <strong>{contact.name || formatPhone(contact.phone)}</strong>
                        {contact.name && <span className={styles.cellSub}>{formatPhone(contact.phone)}</span>}
                        {contact.lead_id && <Link href={`/messages?chatId=${contact.lead_id}`} className={styles.cellSub}><MessageCircle size={11} /> Abrir conversa</Link>}
                      </td>
                      <td>
                        <span className={`${styles.contactStatus} ${styles[`cs_${contact.status}`]}`}>{CONTACT_STATUS_LABEL[contact.status]}</span>
                        {contact.replied_at && <span className={styles.replied}><MessageCircle size={11} /> Respondeu</span>}
                      </td>
                      <td className={styles.cellClip}>
                        {contact.error_msg ? <span className={contact.status === 'failed' ? styles.detailBad : styles.muted}>{contact.error_msg}</span> : contact.rendered_message ? contact.rendered_message.slice(0, 160) : <span className={styles.muted}>—</span>}
                        {contact.reply_text && <span className={styles.cellSub}>Resposta: “{contact.reply_text.slice(0, 120)}”</span>}
                      </td>
                      <td>{contact.sent_at ? dateTime(contact.sent_at) : '—'}{contact.replied_at && <span className={styles.cellSub}>resp. {dateTime(contact.replied_at)}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {total > 50 && (
              <div className={styles.pager}>
                <span>{page * 50 + 1}–{Math.min(total, page * 50 + 50)} de {total}</span>
                <div className={styles.row}>
                  <button type="button" className={styles.secondaryBtn} disabled={page === 0} onClick={() => setPage(page - 1)}>Anterior</button>
                  <button type="button" className={styles.secondaryBtn} disabled={(page + 1) * 50 >= total} onClick={() => setPage(page + 1)}>Próxima</button>
                </div>
              </div>
            )}
          </div>
        </div>

        <aside className={styles.wizardSide}>
          <div className={styles.card}>
            <div className={styles.cardHead}><h3>Mensagem</h3></div>
            <PhonePreview messages={[contacts.find((contact) => contact.rendered_message)?.rendered_message || campaign.template]} media={campaign.media_url ? { url: campaign.media_url, kind: campaign.media_kind || 'document', name: campaign.media_name } : null} />
            {campaign.variants.length > 0 && <span className={styles.hint}>+ {campaign.variants.length} variação(ões) sorteadas entre os contatos.</span>}
            {campaign.meta_template && <span className={styles.hint}>Template da Meta: {campaign.meta_template.name} ({campaign.meta_template.language})</span>}
          </div>
          <div className={styles.card}>
            <div className={styles.cardHead}><h3>Configuração</h3></div>
            <ul className={styles.summaryList}>
              <li><span>Ritmo</span><span>{campaign.delay_min}–{campaign.delay_max}s</span></li>
              <li><span>Horário</span><span>{sendWindow ? `${sendWindow.start}–${sendWindow.end} · ${sendWindow.days.map((day) => WEEKDAYS[day].slice(0, 3)).join(', ')}` : 'Qualquer hora'}</span></li>
              <li><span>Limite por dia</span><span>{campaign.daily_limit || 'Sem limite'}</span></li>
              <li><span>Ao responder</span><span>{[campaign.route_type === 'user' ? `para ${campaign.route_to_label}` : campaign.route_type === 'stage' ? `etapa ${campaign.route_to_label}` : '', campaign.tag_on_reply ? `etiqueta "${campaign.tag_on_reply}"` : '', campaign.flow_on_reply ? 'inicia automação' : ''].filter(Boolean).join(', ') || 'Nada muda'}</span></li>
              <li><span>Rodapé de saída</span><span>{campaign.optout_text ? 'Sim' : 'Não'}</span></li>
              <li><span>Início</span><span>{dateTime(campaign.started_at || campaign.scheduled_at)}</span></li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
