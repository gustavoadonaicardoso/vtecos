'use client';

import React, { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, CalendarClock, CheckCircle2, Clock, Download, Hand, Hourglass, Loader2, MoveRight, Plus, Tag, Trash2, UserPlus, Webhook, Workflow, X, Zap } from 'lucide-react';
import styles from './automations.module.css';
import { useAuth } from '@/context/AuthContext';
import { graphFromLegacy } from '@/lib/automations/flow';
import { TEMPLATES, type EditorOptions } from './library';
import FlowEditor, { type FlowDetail } from './components/FlowEditor';

interface FlowSummary {
  id: string;
  name: string;
  description: string;
  status: 'draft' | 'active' | 'paused';
  trigger_event: string | null;
  updated_at: string;
  nodes: number;
  runs_7d: number;
  failed_7d: number;
}

const LEGACY_KEY = 'vortice_automation_projects';

const TRIGGER: Record<string, { label: string; icon: typeof Zap }> = {
  message_received: { label: 'Mensagem no WhatsApp', icon: Zap },
  lead_created: { label: 'Lead novo', icon: UserPlus },
  stage_changed: { label: 'Mudança de etapa', icon: MoveRight },
  tag_added: { label: 'Etiqueta adicionada', icon: Tag },
  lead_inactive: { label: 'Lead parado', icon: Hourglass },
  schedule: { label: 'Data e hora marcadas', icon: CalendarClock },
  webhook: { label: 'Chamada de outro sistema', icon: Webhook },
  manual: { label: 'Iniciado pela equipe', icon: Hand },
};

const STATUS_LABEL = { active: 'Ativo', paused: 'Pausado', draft: 'Rascunho' };

function readLegacy(): { name?: string; description?: string }[] {
  try {
    const raw = JSON.parse(localStorage.getItem(LEGACY_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter((item) => item && Array.isArray(item.nodes) && item.nodes.length > 0) : [];
  } catch {
    return [];
  }
}

async function getJson<T>(url: string): Promise<{ data?: T; error?: string }> {
  const response = await fetch(url, { cache: 'no-store' });
  const json = await response.json().catch(() => ({}));
  return response.ok ? { data: json.data as T } : { error: json.error || 'Não foi possível carregar.' };
}

function AutomationsContent() {
  const { user } = useAuth();
  const canEdit = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const router = useRouter();
  const pathname = usePathname();
  const flowId = useSearchParams().get('flow');

  const [flows, setFlows] = useState<FlowSummary[] | null>(null);
  const [options, setOptions] = useState<EditorOptions | null>(null);
  const [error, setError] = useState('');
  const [current, setCurrent] = useState<FlowDetail | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', template: 'welcome' });
  const [busy, setBusy] = useState(false);
  const [legacyCount, setLegacyCount] = useState(0);

  const openFlow = (id: string | null) => router.push(id ? `${pathname}?flow=${id}` : pathname);

  const fetchFlows = useCallback(() => getJson<FlowSummary[]>('/api/automations'), []);
  const applyFlows = (result: { data?: FlowSummary[]; error?: string }) => {
    if (result.data) setFlows(result.data);
    setError(result.error || '');
  };

  useEffect(() => {
    fetchFlows().then(applyFlows);
    getJson<EditorOptions>('/api/automations/options').then((result) => setOptions(result.data || null));
    const timer = window.setTimeout(() => setLegacyCount(readLegacy().length), 0);
    return () => window.clearTimeout(timer);
  }, [fetchFlows]);

  // Abre o fluxo indicado na URL (?flow=id), assim o recarregar mantém o editor.
  useEffect(() => {
    if (!flowId) return;
    let cancelled = false;
    getJson<FlowDetail>(`/api/automations/${flowId}`).then((result) => {
      if (cancelled) return;
      if (result.data) setCurrent(result.data);
      else {
        setError(result.error || 'Fluxo não encontrado.');
        router.replace(pathname);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [flowId, pathname, router]);

  const create = async () => {
    const template = TEMPLATES.find((item) => item.id === form.template) || TEMPLATES[0];
    setBusy(true);
    const response = await fetch('/api/automations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: form.name.trim() || template.name, description: template.description, graph: template.build() }),
    });
    const json = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(json.error || 'Não foi possível criar o fluxo.');
      return;
    }
    setCreating(false);
    setForm({ name: '', template: 'welcome' });
    setCurrent(json.data);
    openFlow(json.data.id);
  };

  const remove = async (flow: FlowSummary) => {
    if (!confirm(`Excluir o fluxo "${flow.name}"? As execuções em andamento são canceladas.`)) return;
    const response = await fetch(`/api/automations/${flow.id}`, { method: 'DELETE' });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) setError(json.error || 'Não foi possível excluir.');
    applyFlows(await fetchFlows());
  };

  // Fluxos criados na versão antiga ficavam só neste navegador: importa como rascunho.
  const importLegacy = async () => {
    setBusy(true);
    let failed = 0;
    for (const project of readLegacy()) {
      const response = await fetch('/api/automations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: project.name || 'Fluxo importado', description: project.description || '', graph: graphFromLegacy(project) }),
      });
      if (!response.ok) failed += 1;
    }
    setBusy(false);
    if (failed) setError(`${failed} fluxo(s) não foram importados.`);
    else {
      try {
        localStorage.removeItem(LEGACY_KEY);
      } catch {}
      setLegacyCount(0);
    }
    applyFlows(await fetchFlows());
  };

  if (flowId) {
    if (!current || current.id !== flowId) {
      return <div className={styles.loading}><Loader2 size={18} className={styles.spin} /> Abrindo fluxo...</div>;
    }
    return (
      <FlowEditor
        key={current.id}
        flow={current}
        options={options}
        canEdit={canEdit}
        onBack={() => {
          setCurrent(null);
          openFlow(null);
          fetchFlows().then(applyFlows);
        }}
        onChanged={setCurrent}
      />
    );
  }

  const active = flows?.filter((flow) => flow.status === 'active').length || 0;
  const runs = flows?.reduce((sum, flow) => sum + flow.runs_7d, 0) || 0;
  const failed = flows?.reduce((sum, flow) => sum + flow.failed_7d, 0) || 0;
  const noWhatsApp = options && !options.whatsapp.web && !options.whatsapp.api;

  return (
    <div className={styles.hub}>
      <header className={styles.hubHeader}>
        <div>
          <h1>Automações</h1>
          <p>Fluxos que rodam sozinhos no servidor: respondem no WhatsApp, fazem perguntas, movem leads no funil e avisam a equipe.</p>
        </div>
        {canEdit && (
          <button type="button" className={styles.primaryBtn} onClick={() => setCreating(true)}>
            <Plus size={16} /> Novo fluxo
          </button>
        )}
      </header>

      <div className={styles.stats}>
        <div><strong>{active}</strong><span>Fluxos ativos</span></div>
        <div><strong>{runs}</strong><span>Execuções em 7 dias</span></div>
        <div className={failed ? styles.statBad : ''}><strong>{failed}</strong><span>Falhas em 7 dias</span></div>
      </div>

      {noWhatsApp && (
        <div className={styles.banner}>
          <AlertTriangle size={16} /> Nenhum WhatsApp conectado: os fluxos não conseguem enviar mensagens. <Link href="/integrations">Conectar em Integrações</Link>
        </div>
      )}
      {options && !options.scheduler && (
        <div className={styles.banner}>
          <Clock size={16} /> O agendador do servidor está desligado: blocos &quot;Aguardar&quot; e o tempo limite das perguntas não continuam sozinhos.
          {user?.role === 'ADMIN' && <> Ligue <code>CONTENT_SCHEDULER_ENABLED=true</code> no servidor.</>}
        </div>
      )}
      {canEdit && legacyCount > 0 && (
        <div className={`${styles.banner} ${styles.bannerInfo}`}>
          <Download size={16} /> Encontramos {legacyCount} fluxo(s) da versão antiga salvos só neste navegador.
          <button type="button" className={styles.linkBtn} onClick={importLegacy} disabled={busy}>{busy ? 'Importando...' : 'Importar como rascunho'}</button>
        </div>
      )}
      {error && (
        <div className={styles.errorBox}>
          <AlertTriangle size={16} /> {error}
          <button type="button" className={styles.iconBtn} onClick={() => setError('')} aria-label="Fechar"><X size={14} /></button>
        </div>
      )}

      {!flows && !error && <div className={styles.loading}><Loader2 size={18} className={styles.spin} /> Carregando fluxos...</div>}

      {flows && flows.length === 0 && (
        <div className={styles.emptyHub}>
          <Workflow size={36} />
          <h2>Nenhum fluxo ainda</h2>
          <p>Comece por um modelo pronto — boas-vindas no WhatsApp, qualificação com pergunta ou retorno depois da proposta.</p>
          {canEdit && <button type="button" className={styles.primaryBtn} onClick={() => setCreating(true)}><Plus size={16} /> Criar o primeiro fluxo</button>}
        </div>
      )}

      {flows && flows.length > 0 && (
        <div className={styles.flowGrid}>
          {flows.map((flow) => {
            const trigger = TRIGGER[flow.trigger_event || ''];
            const TriggerIcon = trigger?.icon || Zap;
            return (
              <article key={flow.id} className={styles.flowCard}>
                <button type="button" className={styles.flowOpen} onClick={() => { setCurrent(null); openFlow(flow.id); }}>
                  <div className={styles.flowCardHead}>
                    <span className={`${styles.status} ${styles[`status_${flow.status}`]}`}>{STATUS_LABEL[flow.status]}</span>
                    <span className={styles.flowTrigger}><TriggerIcon size={13} /> {trigger?.label || 'Sem gatilho'}</span>
                  </div>
                  <h3>{flow.name}</h3>
                  {flow.description && <p>{flow.description}</p>}
                  <div className={styles.flowMeta}>
                    <span>{flow.nodes} bloco(s)</span>
                    <span>{flow.runs_7d} execução(ões) em 7 dias</span>
                    {flow.failed_7d > 0 && <span className={styles.metaBad}><AlertTriangle size={12} /> {flow.failed_7d} falha(s)</span>}
                    {flow.failed_7d === 0 && flow.runs_7d > 0 && <span className={styles.metaOk}><CheckCircle2 size={12} /> sem falhas</span>}
                  </div>
                  <small>Atualizado em {new Date(flow.updated_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</small>
                </button>
                {canEdit && (
                  <button type="button" className={styles.flowDelete} onClick={() => remove(flow)} aria-label={`Excluir ${flow.name}`}>
                    <Trash2 size={15} />
                  </button>
                )}
              </article>
            );
          })}
        </div>
      )}

      {creating && (
        <div className={styles.overlay} onClick={() => setCreating(false)}>
          <div className={styles.modal} onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="new-flow-title">
            <div className={styles.modalHead}>
              <div>
                <h2 id="new-flow-title">Novo fluxo</h2>
                <p>Escolha um modelo para começar. Ele nasce como rascunho: nada roda até você ativar.</p>
              </div>
              <button type="button" className={styles.iconBtn} onClick={() => setCreating(false)} aria-label="Fechar"><X size={18} /></button>
            </div>
            <div className={styles.modalBody}>
              <label className={styles.field}>
                <span>Nome</span>
                <input className={styles.input} autoFocus maxLength={80} placeholder={TEMPLATES.find((item) => item.id === form.template)?.name} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </label>
              <div className={styles.templates}>
                {TEMPLATES.map((template) => (
                  <button key={template.id} type="button" className={`${styles.template} ${form.template === template.id ? styles.templateOn : ''}`} onClick={() => setForm({ ...form, template: template.id })} aria-pressed={form.template === template.id}>
                    <strong>{template.name}</strong>
                    <small>{template.description}</small>
                  </button>
                ))}
              </div>
              <div className={styles.modalActions}>
                <button type="button" className={styles.secondaryBtn} onClick={() => setCreating(false)}>Cancelar</button>
                <button type="button" className={styles.primaryBtn} onClick={create} disabled={busy}>
                  {busy ? <Loader2 size={15} className={styles.spin} /> : <Plus size={15} />} Criar e abrir
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AutomationsPage() {
  return (
    <Suspense fallback={null}>
      <AutomationsContent />
    </Suspense>
  );
}
