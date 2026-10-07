import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, Info, Loader2, Megaphone, Pencil, Plus, RefreshCw, Trash2, Wrench } from 'lucide-react';
import { motion } from 'framer-motion';
import styles from '../master.module.css';
import NoticeEditModal, { type NoticeDraft } from './NoticeEditModal';
import { noticeContext, servicesText, when } from '@/lib/status/format';
import { HEALTH_CHECKS, KIND_LABEL, healthLabel, type HealthStatus, type ServiceHealth, type SystemNotice } from '@/lib/status/types';

const HEALTH_LABEL: Record<HealthStatus, string> = { ok: 'No ar', down: 'Fora', off: 'Desligado', unknown: 'Sem dados' };
const KIND_ICON = { incident: AlertTriangle, maintenance: Wrench, info: Info };
const STALE_MS = 5 * 60_000;

const emptyDraft = (): NoticeDraft => ({ kind: 'incident', title: '', message: '', services: [], audience: 'all', targetTenants: [], startsAt: '', endsAt: '' });

/** Rascunho pronto a partir de um serviço que caiu. */
function draftFromHealth(item: ServiceHealth): NoticeDraft {
  const services = HEALTH_CHECKS.find((check) => check.key === item.service)?.services || [];
  const affected = servicesText(services) || healthLabel(item.service);
  return {
    ...emptyDraft(),
    title: `Instabilidade: ${affected}`,
    message: `Identificamos uma instabilidade em ${affected}. Nossa equipe já está trabalhando para normalizar o quanto antes e este aviso será atualizado.`,
    services,
    healthService: item.service,
  };
}

const toDraft = (notice: SystemNotice): NoticeDraft => ({
  id: notice.id,
  kind: notice.kind,
  title: notice.title,
  message: notice.message,
  services: notice.services,
  audience: notice.audience,
  targetTenants: notice.targetTenants,
  startsAt: notice.startsAt,
  endsAt: notice.endsAt || '',
});

async function request<T>(url: string, init?: RequestInit): Promise<{ data?: T; error?: string }> {
  try {
    const response = await fetch(url, { cache: 'no-store', ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } });
    const json = await response.json().catch(() => ({}));
    return response.ok ? { data: json.data as T } : { error: json.error || 'Não foi possível concluir.' };
  } catch {
    return { error: 'Sem conexão com o servidor.' };
  }
}

type StatusData = { notices: SystemNotice[]; health: ServiceHealth[] };
const fetchStatus = () => request<StatusData>('/api/master/status');

const ago = (iso: string, now: number) => {
  const minutes = Math.round((now - new Date(iso).getTime()) / 60_000);
  return minutes < 1 ? 'agora há pouco' : minutes < 60 ? `há ${minutes} min` : when(iso);
};

/**
 * Painel Master > Status: a verificação automática dos serviços e os
 * avisos que aparecem na faixa do topo para as empresas.
 */
export default function StatusTab() {
  const [notices, setNotices] = useState<SystemNotice[] | null>(null);
  const [health, setHealth] = useState<ServiceHealth[]>([]);
  const [tenants, setTenants] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const [editing, setEditing] = useState<NoticeDraft | null>(null);
  const [composer, setComposer] = useState<{ id: string; mode: 'update' | 'resolve'; text: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showAllPast, setShowAllPast] = useState(false);
  // Relógio da tela (atualiza a cada carga): "há X min" e verificação parada.
  const [now, setNow] = useState(() => Date.now());

  const apply = useCallback((result: { data?: StatusData; error?: string }) => {
    if (result.error) setError(result.error);
    if (result.data) {
      setNotices(result.data.notices);
      setHealth(result.data.health);
      setNow(Date.now());
      setError('');
    }
  }, []);
  const load = useCallback(async () => apply(await fetchStatus()), [apply]);

  useEffect(() => {
    fetchStatus().then(apply);
    request<{ id: string; name: string; is_platform?: boolean }[]>('/api/tenants').then((result) => {
      if (result.data) setTenants(result.data.filter((tenant) => !tenant.is_platform).map((tenant) => ({ id: tenant.id, name: tenant.name })));
    });
    const timer = setInterval(() => fetchStatus().then(apply), 60_000);
    return () => clearInterval(timer);
  }, [apply]);

  const tenantName = useMemo(() => new Map(tenants.map((tenant) => [tenant.id, tenant.name])), [tenants]);

  const checkNow = async () => {
    setChecking(true);
    const result = await request<ServiceHealth[]>('/api/master/status/check', { method: 'POST' });
    setChecking(false);
    if (result.error) setError(result.error);
    if (result.data) {
      setHealth(result.data);
      setNow(Date.now());
    }
  };

  const saveNotice = async (draft: NoticeDraft) => {
    const { id, ...fields } = draft;
    const result = id
      ? await request(`/api/master/status/${id}`, { method: 'PATCH', body: JSON.stringify({ action: 'edit', notice: fields }) })
      : await request('/api/master/status', { method: 'POST', body: JSON.stringify(fields) });
    if (result.error) return result.error;
    setEditing(null);
    await load();
    return null;
  };

  const sendComposer = async () => {
    if (!composer) return;
    setBusyId(composer.id);
    const result = await request(`/api/master/status/${composer.id}`, { method: 'PATCH', body: JSON.stringify({ action: composer.mode, message: composer.text }) });
    setBusyId(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    setComposer(null);
    await load();
  };

  const remove = async (notice: SystemNotice) => {
    if (!window.confirm(`Apagar o aviso "${notice.title}"? Ele some da faixa e do histórico.`)) return;
    setBusyId(notice.id);
    const result = await request(`/api/master/status/${notice.id}`, { method: 'DELETE' });
    setBusyId(null);
    if (result.error) setError(result.error);
    await load();
  };

  const lastCheck = health.filter((item) => item.status !== 'unknown').map((item) => item.checkedAt).sort().pop();
  const stale = !lastCheck || now - new Date(lastCheck).getTime() > STALE_MS;
  const down = health.filter((item) => item.status === 'down');
  const open = (notices || []).filter((notice) => notice.phase !== 'resolved');
  const past = (notices || []).filter((notice) => notice.phase === 'resolved');
  const openFor = (service: string) => open.find((notice) => notice.healthService === service);

  const audienceText = (notice: SystemNotice) => {
    if (notice.audience === 'all') return 'Todas as empresas';
    const names = notice.targetTenants.map((id) => tenantName.get(id)).filter(Boolean) as string[];
    if (names.length === 0) return `${notice.targetTenants.length} empresa(s)`;
    return names.length <= 3 ? names.join(', ') : `${names.slice(0, 3).join(', ')} e mais ${names.length - 3}`;
  };

  const renderNotice = (notice: SystemNotice) => {
    const Icon = notice.phase === 'resolved' ? CheckCircle2 : KIND_ICON[notice.kind];
    const isComposing = composer?.id === notice.id;
    const busy = busyId === notice.id;
    return (
      <article key={notice.id} className={styles.noticeCard} data-tone={notice.phase === 'resolved' ? 'resolved' : notice.kind}>
        <div className={styles.noticeHead}>
          <span className={styles.noticeIcon}><Icon size={18} /></span>
          <div className={styles.noticeTitle}>
            <strong>{notice.title}</strong>
            <span>{notice.kind === 'maintenance' && notice.phase !== 'resolved' ? '' : `${KIND_LABEL[notice.kind]} · `}{noticeContext(notice)}</span>
          </div>
          <span className={styles.noticePhase} data-phase={notice.phase}>
            {notice.phase === 'active' ? 'Publicado' : notice.phase === 'scheduled' ? 'Programado' : 'Encerrado'}
          </span>
        </div>
        {notice.message && <p className={styles.noticeMessage}>{notice.message}</p>}
        <div className={styles.noticeMeta}>
          <span>Quem vê: {audienceText(notice)}</span>
          <span>Publicado {when(notice.createdAt)}</span>
        </div>
        {notice.updates.length > 0 && (
          <ol className={styles.timeline}>
            {[...notice.updates].reverse().map((update, index) => (
              <li key={`${update.at}-${index}`}>
                <time>{when(update.at)}</time>
                <span>{update.message}</span>
                {update.by && <em> · {update.by}</em>}
              </li>
            ))}
          </ol>
        )}

        {isComposing && composer && (
          <div className={styles.composer}>
            <textarea
              className={styles.input}
              rows={2}
              autoFocus
              maxLength={1000}
              value={composer.text}
              placeholder={composer.mode === 'update' ? 'Ex.: Identificamos a causa e a correção já está sendo aplicada.' : 'Mensagem final (opcional)'}
              onChange={(event) => setComposer({ ...composer, text: event.target.value })}
            />
            <div className={styles.inlineActions}>
              <button type="button" className={styles.saveBtn} disabled={busy || (composer.mode === 'update' && !composer.text.trim())} onClick={sendComposer}>
                {busy ? <Loader2 size={15} className={styles.spin} /> : composer.mode === 'update' ? <Megaphone size={15} /> : <CheckCircle2 size={15} />}
                {composer.mode === 'update' ? 'Publicar atualização' : 'Encerrar aviso'}
              </button>
              <button type="button" className={styles.resetBtn} disabled={busy} onClick={() => setComposer(null)}>Cancelar</button>
            </div>
          </div>
        )}

        {!isComposing && (
          <div className={styles.inlineActions}>
            {notice.phase !== 'resolved' && (
              <>
                <button type="button" className={styles.resetBtn} onClick={() => setComposer({ id: notice.id, mode: 'update', text: '' })}><Megaphone size={15} /> Atualizar</button>
                <button
                  type="button"
                  className={styles.resetBtn}
                  onClick={() => setComposer({ id: notice.id, mode: 'resolve', text: notice.kind === 'maintenance' ? 'Manutenção concluída. Tudo funcionando normalmente.' : 'Tudo normalizado. Obrigado pela paciência!' })}
                >
                  <CheckCircle2 size={15} /> Encerrar
                </button>
                <button type="button" className={styles.resetBtn} onClick={() => setEditing(toDraft(notice))}><Pencil size={15} /> Editar</button>
              </>
            )}
            <button type="button" className={styles.dangerBtn} disabled={busy} onClick={() => remove(notice)}><Trash2 size={15} /> Apagar</button>
          </div>
        )}
      </article>
    );
  };

  return (
    <motion.div key="status" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} className={styles.grid}>
      {error && <div className={`${styles.errorBanner} ${styles.cardWide}`}><AlertTriangle size={16} /> {error}</div>}

      <section className={`${styles.card} ${styles.cardWide}`}>
        <div className={styles.statusHead}>
          <div className={styles.cardHeader}><Activity size={20} /><h2>Verificação automática</h2></div>
          <button type="button" className={styles.resetBtn} onClick={checkNow} disabled={checking}>
            {checking ? <Loader2 size={15} className={styles.spin} /> : <RefreshCw size={15} />} Verificar agora
          </button>
        </div>
        <p className={styles.hint}>
          O servidor confere estes serviços a cada minuto. Se algo cair, os administradores da Vórtice recebem um aviso no sino e
          você decide se publica para os clientes. {lastCheck ? `Última verificação ${ago(lastCheck, now)}.` : ''}
        </p>
        {stale && (
          <p className={styles.testFail}>
            <AlertTriangle size={15} /> A verificação automática não rodou nos últimos minutos. Ela só roda na VPS, com CONTENT_SCHEDULER_ENABLED=true. Use &quot;Verificar agora&quot; para conferir na hora.
          </p>
        )}
        {down.length > 0 && <p className={styles.testFail}><AlertTriangle size={15} /> {down.length} serviço(s) fora. Publique um aviso se os clientes forem afetados.</p>}
        <div className={styles.healthGrid}>
          {health.map((item) => {
            const notice = item.status === 'down' ? openFor(item.service) : undefined;
            return (
              <div key={item.service} className={styles.healthCard} data-status={item.status}>
                <div className={styles.healthTop}>
                  <strong>{healthLabel(item.service)}</strong>
                  <span className={styles.healthPill} data-status={item.status}>{HEALTH_LABEL[item.status]}</span>
                </div>
                <span className={styles.healthInfo}>
                  {item.status === 'unknown'
                    ? 'Ainda não verificado.'
                    : item.message || (item.status === 'ok' ? `Funcionando${item.latencyMs != null ? ` · ${item.latencyMs} ms` : ''}` : '')}
                </span>
                {item.status === 'down' && <span className={styles.healthInfo}>Fora desde {when(item.since)}</span>}
                {item.status === 'down' && (
                  notice
                    ? <span className={styles.healthInfo}>Aviso publicado: &quot;{notice.title}&quot;</span>
                    : <button type="button" className={styles.saveBtn} onClick={() => setEditing(draftFromHealth(item))}><Megaphone size={15} /> Publicar aviso</button>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className={`${styles.card} ${styles.cardWide}`}>
        <div className={styles.statusHead}>
          <div className={styles.cardHeader}><Megaphone size={20} /><h2>Avisos para os clientes</h2></div>
          <button type="button" className={styles.saveBtn} onClick={() => setEditing(emptyDraft())}><Plus size={16} /> Novo aviso</button>
        </div>
        <p className={styles.hint}>Aparecem numa faixa no topo do sistema. A manutenção programada aparece 3 dias antes, e o aviso encerrado fica verde por 2 horas.</p>
        {!notices && !error && <p className={styles.hint}><Loader2 size={15} className={styles.spin} /> Carregando…</p>}
        {notices && open.length === 0 && <p className={styles.emptyNotice}>Nenhum aviso no ar. Tudo tranquilo por aqui.</p>}
        <div className={styles.noticeList}>{open.map(renderNotice)}</div>
        {past.length > 0 && (
          <>
            <h3 className={styles.noticeSubhead}>Encerrados (últimos 60 dias)</h3>
            <div className={styles.noticeList}>{(showAllPast ? past : past.slice(0, 5)).map(renderNotice)}</div>
            {past.length > 5 && !showAllPast && (
              <button type="button" className={styles.linkButton} onClick={() => setShowAllPast(true)}>Ver todos os {past.length} encerrados</button>
            )}
          </>
        )}
      </section>

      {editing && <NoticeEditModal notice={editing} tenants={tenants} onClose={() => setEditing(null)} onSave={saveNotice} />}
    </motion.div>
  );
}
