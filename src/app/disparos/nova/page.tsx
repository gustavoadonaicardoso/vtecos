'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  Megaphone,
  Paperclip,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react';
import styles from '../disparos.module.css';
import { api, insertAt, PhonePreview, VariableBar } from '../components/Bits';
import {
  columnVariable,
  contextFor,
  DEFAULT_OPTOUT_TEXT,
  DEFAULT_WINDOW,
  estimateFinish,
  formatDuration,
  normalizePhone,
  phoneSuffix,
  renderForContact,
  SPEEDS,
  templateParamCount,
  validWindow,
  type MetaTemplateChoice,
  type SendWindow,
} from '@/lib/disparos';
import { BUILTIN_VARIABLES, WEEKDAYS } from '@/lib/automations/flow';

interface Options {
  stages: { id: string; name: string }[];
  team: { id: string; name: string }[];
  tags: string[];
  flows: { id: string; name: string; status: string }[];
  channels: { web: boolean; api: boolean };
  company: { name: string; phone: string; website: string; address: string };
  worker: boolean;
}
interface ParsedFile { name: string; columns: string[]; rows: Record<string, string>[] }
interface CrmPreview { total: number; valid: number; invalid: number; optout: number; duplicate: number; sample: { name: string; phone: string; data: Record<string, string> }[]; limited: boolean }
interface MetaTemplate { id: string; name: string; language: string; category: string; components: { type: string; text?: string }[] }
type Media = { url: string; kind: string; name: string } | null;
type Field = 'template' | `variant-${number}` | `param-${number}`;

const STEPS = ['Público', 'Mensagem', 'Envio', 'Revisar'];
const PHONE_HINT = /^(tel|fone|celular|phone|whats|numero|número|contato)/i;
const NAME_HINT = /^(nome|name|cliente)/i;

/** "2026-10-08T09:00" (relógio do navegador) para ISO. */
const localToIso = (value: string) => (value ? new Date(value).toISOString() : '');

export default function NewCampaignPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [options, setOptions] = useState<Options | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Público
  const [audienceType, setAudienceType] = useState<'file' | 'crm'>('file');
  const [file, setFile] = useState<ParsedFile | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [phoneColumn, setPhoneColumn] = useState('');
  const [nameColumn, setNameColumn] = useState('');
  const [crm, setCrm] = useState({ stageIds: [] as string[], tags: [] as string[], assignedTo: [] as string[], createdWithinDays: 0 });
  const [crmPreview, setCrmPreview] = useState<CrmPreview | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Mensagem
  const [name, setName] = useState('');
  const [channel, setChannel] = useState<'web' | 'api'>('web');
  const [template, setTemplate] = useState('{{saudacao}}, {{lead.first_name|tudo bem}}! ');
  const [variants, setVariants] = useState<string[]>([]);
  const [media, setMedia] = useState<Media>(null);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [optout, setOptout] = useState(true);
  const [optoutText, setOptoutText] = useState(DEFAULT_OPTOUT_TEXT);
  const [metaTemplates, setMetaTemplates] = useState<MetaTemplate[] | null>(null);
  const [metaError, setMetaError] = useState('');
  const [metaTemplate, setMetaTemplate] = useState<MetaTemplateChoice | null>(null);
  const fields = useRef<Record<string, HTMLTextAreaElement | HTMLInputElement | null>>({});
  const [activeField, setActiveField] = useState<Field>('template');
  const [testPhone, setTestPhone] = useState('');
  const [testState, setTestState] = useState<{ busy: boolean; message: string; ok: boolean } | null>(null);

  // Envio
  const [speed, setSpeed] = useState<string>('safe');
  const [delay, setDelay] = useState({ min: 25, max: 60 });
  const [useWindow, setUseWindow] = useState(true);
  const [sendWindow, setSendWindow] = useState<SendWindow>(DEFAULT_WINDOW);
  const [useLimit, setUseLimit] = useState(false);
  const [dailyLimit, setDailyLimit] = useState(300);
  const [when, setWhen] = useState<'now' | 'schedule' | 'draft'>('now');
  const [scheduledAt, setScheduledAt] = useState('');
  const [routeType, setRouteType] = useState<'none' | 'user' | 'stage'>('none');
  const [routeToId, setRouteToId] = useState('');
  const [tagOnReply, setTagOnReply] = useState('');
  const [flowOnReply, setFlowOnReply] = useState('');
  const [createLeads, setCreateLeads] = useState(false);
  const [openedAt] = useState(() => Date.now());
  // datetime-local usa o relógio local do navegador.
  const [minDate] = useState(() => { const at = new Date(Date.now() + 5 * 60_000); return new Date(at.getTime() - at.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      api<Options>('/api/disparos/options').then((result) => {
        if (!result.data) { setError(result.error || ''); return; }
        setOptions(result.data);
        if (!result.data.channels.web && result.data.channels.api) setChannel('api');
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  // ── Planilha ──
  const handleFile = async (picked: File) => {
    if (!/\.(csv|xlsx|xls)$/i.test(picked.name)) { setError('Use uma planilha CSV ou Excel (.xlsx, .xls).'); return; }
    setUploading(true);
    setError('');
    const form = new FormData();
    form.append('file', picked);
    const response = await fetch('/api/disparos/upload', { method: 'POST', body: form });
    const json = await response.json().catch(() => ({}));
    setUploading(false);
    if (!response.ok) { setError(json.error || 'Não foi possível ler a planilha.'); return; }
    const columns: string[] = json.columns || [];
    setFile({ name: picked.name, columns, rows: json.allRows || [] });
    setPhoneColumn(columns.find((column) => PHONE_HINT.test(column)) || '');
    setNameColumn(columns.find((column) => NAME_HINT.test(column)) || '');
    if (!name) setName(picked.name.replace(/\.(csv|xlsx|xls)$/i, '').slice(0, 80));
  };

  const fileStats = useMemo(() => {
    if (!file || !phoneColumn) return null;
    const seen = new Set<string>();
    let valid = 0;
    let invalid = 0;
    let duplicate = 0;
    for (const row of file.rows) {
      const phone = normalizePhone(row[phoneColumn] || '');
      if (!phone) { invalid += 1; continue; }
      if (seen.has(phoneSuffix(phone))) { duplicate += 1; continue; }
      seen.add(phoneSuffix(phone));
      valid += 1;
    }
    return { total: file.rows.length, valid, invalid, duplicate };
  }, [file, phoneColumn]);

  // ── Leads do CRM (prévia com atraso) ──
  useEffect(() => {
    if (audienceType !== 'crm') return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const result = await api<CrmPreview>('/api/disparos/audience', { method: 'POST', body: JSON.stringify(crm) });
      if (!cancelled) setCrmPreview(result.data || null);
    }, 350);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [audienceType, crm]);

  const toggle = (list: string[], value: string) => (list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);

  // ── Contatos de exemplo para a prévia ──
  const samples = useMemo(() => {
    if (audienceType === 'crm') return (crmPreview?.sample || []).map((item) => ({ name: item.name, phone: item.phone, data: item.data }));
    if (!file) return [];
    return file.rows.filter((row) => normalizePhone(row[phoneColumn] || '')).slice(0, 3).map((row) => ({ name: nameColumn ? row[nameColumn] : '', phone: row[phoneColumn], data: row }));
  }, [audienceType, crmPreview, file, phoneColumn, nameColumn]);

  const renderInput = useMemo(() => ({ template, variants: variants.filter((item) => item.trim()), optoutText: channel === 'web' && optout ? optoutText : null, channel, metaTemplate }), [template, variants, optout, optoutText, channel, metaTemplate]);
  const company = useMemo(() => options?.company || { name: 'Sua empresa', phone: '', website: '', address: '' }, [options]);
  const previews = useMemo(() => {
    const list = samples.length ? samples : [{ name: 'Maria Souza', phone: '5511999998888', data: {} }];
    // A prévia mostra a mensagem principal (as variações são sorteadas no envio).
    return list.slice(0, 1).map((sample) => renderForContact({ ...renderInput, variants: [] }, contextFor(sample, null, company)).text);
  }, [samples, renderInput, company]);

  // ── Variáveis ──
  const variableGroups = useMemo(() => {
    const columns = audienceType === 'file' ? (file?.columns || []).map(columnVariable) : ['nome', 'telefone', 'email'];
    return [
      { label: audienceType === 'file' ? 'Planilha' : 'Lead', names: [...new Set(columns)] },
      { label: 'Contato', names: ['lead.first_name', 'lead.name'] },
      { label: 'Outros', names: ['saudacao', 'empresa', 'data.hoje', 'data.dia_semana'] },
    ];
  }, [audienceType, file]);

  // {{variáveis}} usadas que este público não tem (sairiam vazias).
  const unknownVariables = useMemo(() => {
    const known = new Set([...BUILTIN_VARIABLES.flatMap((group) => group.items.map((item) => item.name)), ...variableGroups[0].names]);
    const texts = channel === 'api' ? metaTemplate?.params || [] : [template, ...variants];
    const used = texts.flatMap((text) => [...text.matchAll(/\{\{\s*([\w.]+)\s*(\|[^}]*)?\}\}/g)].filter((match) => !match[2]).map((match) => match[1]));
    return [...new Set(used.filter((name) => !known.has(name)))];
  }, [variableGroups, channel, metaTemplate, template, variants]);

  const pickVariable = (variable: string) => {
    const token = `{{${variable}}}`;
    const element = fields.current[activeField] || null;
    if (activeField === 'template') setTemplate((current) => insertAt(element, current, token));
    else if (activeField.startsWith('variant-')) {
      const index = Number(activeField.split('-')[1]);
      setVariants((current) => current.map((item, i) => (i === index ? insertAt(element, item, token) : item)));
    } else if (activeField.startsWith('param-') && metaTemplate) {
      const index = Number(activeField.split('-')[1]);
      setMetaTemplate({ ...metaTemplate, params: metaTemplate.params.map((item, i) => (i === index ? insertAt(element, item, token) : item)) });
    }
  };
  const bind = (field: Field) => ({ ref: (element: HTMLTextAreaElement | HTMLInputElement | null) => { fields.current[field] = element; }, onFocus: () => setActiveField(field) });

  // ── Templates da Meta ──
  const loadMetaTemplates = useCallback(async () => {
    setMetaError('');
    setMetaTemplates(null);
    const response = await fetch('/api/disparos/meta-templates', { cache: 'no-store' });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) { setMetaError(json.error || 'Não foi possível buscar os templates.'); setMetaTemplates([]); return; }
    setMetaTemplates(json.templates || []);
  }, []);
  useEffect(() => {
    if (channel !== 'api' || metaTemplates !== null) return;
    const timer = window.setTimeout(loadMetaTemplates, 0);
    return () => window.clearTimeout(timer);
  }, [channel, metaTemplates, loadMetaTemplates]);

  const chooseMetaTemplate = (item: MetaTemplate) => {
    const body = item.components.find((component) => component.type === 'BODY')?.text || '';
    const count = templateParamCount(body);
    setMetaTemplate({ name: item.name, language: item.language, body, params: Array.from({ length: count }, (_, index) => (index === 0 ? '{{lead.first_name|cliente}}' : '')) });
  };

  // ── Anexo ──
  const uploadMedia = async (picked: File) => {
    setMediaBusy(true);
    const form = new FormData();
    form.append('file', picked);
    const result = await api<{ url: string; kind: string; fileName: string }>('/api/disparos/media', { method: 'POST', body: form });
    setMediaBusy(false);
    if (result.error) { setError(result.error); return; }
    setMedia({ url: result.data!.url, kind: result.data!.kind, name: result.data!.fileName });
  };

  // ── Envio ──
  const chooseSpeed = (id: string) => {
    setSpeed(id);
    const preset = SPEEDS.find((item) => item.id === id);
    if (preset) setDelay({ min: preset.min, max: preset.max });
  };
  const validCount = audienceType === 'crm' ? crmPreview?.valid || 0 : fileStats?.valid || 0;
  const eta = useMemo(() => {
    const finish = estimateFinish(validCount, { delayMin: delay.min, delayMax: delay.max, window: useWindow ? sendWindow : null, dailyLimit: useLimit ? dailyLimit : null, from: when === 'schedule' && scheduledAt ? new Date(scheduledAt) : undefined });
    return finish;
  }, [validCount, delay, useWindow, sendWindow, useLimit, dailyLimit, when, scheduledAt]);

  // ── Validação por passo ──
  const stepProblem = (index: number): string => {
    if (index === 0) {
      if (audienceType === 'file') {
        if (!file) return 'Envie a planilha.';
        if (!phoneColumn) return 'Marque a coluna do telefone.';
        if (!fileStats?.valid) return 'Nenhum telefone válido na coluna escolhida.';
      } else if (!crmPreview?.valid) return 'Nenhum lead com telefone nos filtros escolhidos.';
    }
    if (index === 1) {
      if (!name.trim()) return 'Dê um nome para a campanha.';
      if (channel === 'web' && !template.trim()) return 'Escreva a mensagem.';
      if (channel === 'api' && !metaTemplate) return 'Escolha o template aprovado.';
      if (channel === 'api' && metaTemplate?.params.some((param) => !param.trim())) return 'Preencha todas as variáveis do template.';
    }
    if (index === 2) {
      if (!(delay.min >= 2 && delay.max >= delay.min && delay.max <= 600)) return 'Intervalo entre mensagens inválido.';
      if (useWindow && !validWindow(sendWindow)) return 'Horário de envio inválido.';
      if (when === 'schedule' && (!scheduledAt || scheduledAt < minDate)) return 'Escolha data e hora pelo menos 5 minutos no futuro.';
      if (routeType !== 'none' && !routeToId) return routeType === 'user' ? 'Escolha a pessoa.' : 'Escolha a etapa.';
    }
    return '';
  };
  const problem = stepProblem(step);

  const payload = () => ({
    name,
    channel,
    template,
    variants: variants.filter((item) => item.trim()),
    metaTemplate: channel === 'api' ? metaTemplate : null,
    media: channel === 'web' ? media : null,
    optoutText: channel === 'web' && optout ? optoutText : null,
    delayMin: delay.min,
    delayMax: delay.max,
    sendWindow: useWindow ? sendWindow : null,
    dailyLimit: useLimit ? dailyLimit : null,
    routeType,
    routeToId,
    tagOnReply,
    flowOnReply: flowOnReply || null,
    createLeads: audienceType === 'file' && createLeads,
  });

  const sendTest = async () => {
    setTestState({ busy: true, message: '', ok: false });
    const sample = samples[0]?.data || {};
    const result = await api<{ text: string }>('/api/disparos/test', { method: 'POST', body: JSON.stringify({ ...payload(), phone: testPhone, sample: { ...sample, nome: samples[0]?.name || sample.nome } }) });
    setTestState({ busy: false, ok: !result.error, message: result.error || 'Teste enviado. Confira no WhatsApp.' });
  };

  const submit = async () => {
    setBusy(true);
    setError('');
    const audience = audienceType === 'crm'
      ? { type: 'crm', ...crm, createdWithinDays: crm.createdWithinDays || null }
      : { type: 'file', fileName: file?.name, rows: file?.rows || [], columns: (file?.columns || []).map((key) => ({ key, isPhone: key === phoneColumn, isName: key === nameColumn })) };
    const result = await api<{ id: string }>('/api/disparos/campaigns', {
      method: 'POST',
      body: JSON.stringify({ ...payload(), audience, action: when === 'now' ? 'start' : when, scheduledAt: when === 'schedule' ? localToIso(scheduledAt) : null }),
    });
    setBusy(false);
    if (result.error) { setError(result.error); return; }
    router.push(`/disparos/${result.data!.id}`);
  };

  const canGo = (index: number) => [0, 1, 2].filter((i) => i < index).every((i) => !stepProblem(i));
  const channelLabel = channel === 'api' ? 'API oficial (template)' : 'WhatsApp Web';

  // ── Telas de cada passo ──
  const audienceStep = (
    <>
      <div className={styles.card}>
        <div className={styles.cardHead}><h2>Quem vai receber</h2></div>
        <div className={styles.choiceGrid}>
          <button type="button" className={`${styles.choice} ${audienceType === 'file' ? styles.choiceOn : ''}`} onClick={() => setAudienceType('file')}>
            <FileSpreadsheet size={22} /><span><strong>Planilha</strong><small>CSV ou Excel com telefone e outras colunas (viram variáveis).</small></span>
          </button>
          <button type="button" className={`${styles.choice} ${audienceType === 'crm' ? styles.choiceOn : ''}`} onClick={() => setAudienceType('crm')}>
            <Users size={22} /><span><strong>Leads do CRM</strong><small>Filtre por etapa, etiqueta, responsável ou data de cadastro.</small></span>
          </button>
        </div>
      </div>

      {audienceType === 'file' ? (
        <div className={styles.card}>
          {!file ? (
            <div
              className={`${styles.dropzone} ${dragging ? styles.dropzoneOn : ''}`}
              onClick={() => fileInput.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); const picked = e.dataTransfer.files[0]; if (picked) handleFile(picked); }}
              role="button"
              tabIndex={0}
            >
              {uploading ? <Loader2 size={30} className={styles.spin} /> : <Upload size={30} />}
              <strong>{uploading ? 'Lendo a planilha...' : 'Arraste a planilha aqui ou clique para escolher'}</strong>
              <span>CSV, XLSX ou XLS · até 10 MB e 20.000 linhas · a primeira linha são os nomes das colunas</span>
              <input ref={fileInput} type="file" hidden accept=".csv,.xlsx,.xls" onChange={(e) => { const picked = e.target.files?.[0]; if (picked) handleFile(picked); e.target.value = ''; }} />
            </div>
          ) : (
            <>
              <div className={styles.cardHead}>
                <div>
                  <h3><FileSpreadsheet size={16} /> {file.name}</h3>
                  <span className={styles.hint}>{file.rows.length} linha(s) · {file.columns.length} coluna(s)</span>
                </div>
                <button type="button" className={styles.ghostBtn} onClick={() => { setFile(null); setPhoneColumn(''); setNameColumn(''); }}><X size={15} /> Trocar</button>
              </div>
              <div className={styles.tableWrap}>
                <div className={`${styles.columnRow} ${styles.columnHead}`}><span>Coluna</span><span>Exemplo</span><span>Telefone</span><span>Nome</span></div>
                {file.columns.map((column) => (
                  <div key={column} className={styles.columnRow}>
                    <span><strong>{column}</strong><br /><code>{`{{${columnVariable(column)}}}`}</code></span>
                    <span className={styles.muted}>{file.rows.find((row) => row[column])?.[column] || '—'}</span>
                    <label className={styles.radio}><input type="radio" name="phone" checked={phoneColumn === column} onChange={() => setPhoneColumn(column)} /> Telefone</label>
                    <label className={styles.radio}><input type="checkbox" checked={nameColumn === column} onChange={(e) => setNameColumn(e.target.checked ? column : '')} /> Nome</label>
                  </div>
                ))}
              </div>
              {fileStats && (
                <div className={fileStats.valid ? styles.okBox : styles.errorBox}>
                  {fileStats.valid ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                  <span><strong>{fileStats.valid} contato(s) vão receber.</strong>{fileStats.invalid ? ` ${fileStats.invalid} sem telefone válido.` : ''}{fileStats.duplicate ? ` ${fileStats.duplicate} número(s) repetido(s).` : ''} Quem pediu para sair também é pulado.</span>
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <div className={styles.card}>
          <div className={styles.field}>
            <span>Etapas do funil</span>
            <div className={styles.chips}>
              {options?.stages.map((stage) => <button key={stage.id} type="button" className={`${styles.chip} ${crm.stageIds.includes(stage.id) ? styles.chipOn : ''}`} onClick={() => setCrm({ ...crm, stageIds: toggle(crm.stageIds, stage.id) })}>{stage.name}</button>)}
            </div>
            <small>Nenhuma marcada = todas.</small>
          </div>
          {Boolean(options?.tags.length) && (
            <div className={styles.field}>
              <span>Com alguma destas etiquetas</span>
              <div className={styles.chips}>
                {options?.tags.map((tag) => <button key={tag} type="button" className={`${styles.chip} ${crm.tags.includes(tag) ? styles.chipOn : ''}`} onClick={() => setCrm({ ...crm, tags: toggle(crm.tags, tag) })}>{tag}</button>)}
              </div>
            </div>
          )}
          <div className={styles.field}>
            <span>Responsável</span>
            <div className={styles.chips}>
              {options?.team.map((member) => <button key={member.id} type="button" className={`${styles.chip} ${crm.assignedTo.includes(member.id) ? styles.chipOn : ''}`} onClick={() => setCrm({ ...crm, assignedTo: toggle(crm.assignedTo, member.id) })}>{member.name}</button>)}
            </div>
          </div>
          <label className={styles.field}>
            <span>Cadastrados</span>
            <select className={styles.input} value={crm.createdWithinDays} onChange={(e) => setCrm({ ...crm, createdWithinDays: Number(e.target.value) })}>
              <option value={0}>Em qualquer data</option>
              <option value={7}>Nos últimos 7 dias</option>
              <option value={30}>Nos últimos 30 dias</option>
              <option value={90}>Nos últimos 90 dias</option>
              <option value={365}>No último ano</option>
            </select>
          </label>
          {crmPreview ? (
            <div className={crmPreview.valid ? styles.okBox : styles.errorBox}>
              {crmPreview.valid ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
              <span><strong>{crmPreview.valid} lead(s) vão receber</strong> de {crmPreview.total} encontrado(s).{crmPreview.invalid ? ` ${crmPreview.invalid} sem telefone válido.` : ''}{crmPreview.duplicate ? ` ${crmPreview.duplicate} número(s) repetido(s).` : ''}{crmPreview.optout ? ` ${crmPreview.optout} pediram para sair.` : ''} Leads bloqueados nunca recebem.</span>
            </div>
          ) : <span className={styles.hint}><Loader2 size={14} className={styles.spin} /> Contando leads...</span>}
        </div>
      )}
    </>
  );

  const messageStep = (
    <>
      <div className={styles.card}>
        <label className={styles.field}>
          <span>Nome da campanha (só a equipe vê)</span>
          <input className={styles.input} value={name} maxLength={80} placeholder="Ex.: Promoção de outubro" onChange={(e) => setName(e.target.value)} />
        </label>
        <div className={styles.field}>
          <span>Enviar por</span>
          <div className={styles.choiceGrid}>
            <button type="button" className={`${styles.choice} ${channel === 'web' ? styles.choiceOn : ''}`} disabled={options ? !options.channels.web : false} onClick={() => setChannel('web')}>
              <Send size={20} /><span><strong>WhatsApp Web</strong><small>{options && !options.channels.web ? 'Desconectado. Conecte em Integrações.' : 'Texto livre, variações e anexo.'}</small></span>
            </button>
            <button type="button" className={`${styles.choice} ${channel === 'api' ? styles.choiceOn : ''}`} disabled={options ? !options.channels.api : false} onClick={() => setChannel('api')}>
              <Megaphone size={20} /><span><strong>API oficial da Meta</strong><small>{options && !options.channels.api ? 'Não configurada em Integrações.' : 'Usa um template aprovado (regra da Meta para campanhas).'}</small></span>
            </button>
          </div>
        </div>
      </div>

      {channel === 'web' ? (
        <div className={styles.card}>
          <div className={styles.field}>
            <span>Mensagem</span>
            <textarea className={styles.input} rows={6} value={template} onChange={(e) => setTemplate(e.target.value)} {...bind('template')} />
          </div>
          <VariableBar groups={variableGroups} onPick={pickVariable} />
          {unknownVariables.length > 0 && <div className={styles.banner}><AlertTriangle size={16} /><span>{unknownVariables.map((name) => `{{${name}}}`).join(', ')} não existe neste público e vai sair vazio. Use {'{{nome|texto}}'} para ter um texto padrão.</span></div>}
          <span className={styles.hint}>Clique numa variável para inserir onde está o cursor. <code>{'{{lead.first_name|cliente}}'}</code> usa &quot;cliente&quot; quando o nome está vazio. *negrito* e _itálico_ funcionam no WhatsApp.</span>
          {variants.map((variant, index) => (
            <div key={index} className={styles.field}>
              <span>Variação {index + 2} (uma é sorteada para cada contato)</span>
              <div className={styles.variant}>
                <textarea className={styles.input} rows={3} value={variant} onChange={(e) => setVariants(variants.map((item, i) => (i === index ? e.target.value : item)))} {...bind(`variant-${index}`)} />
                <button type="button" className={styles.iconBtn} aria-label="Remover variação" onClick={() => setVariants(variants.filter((_, i) => i !== index))}><Trash2 size={15} /></button>
              </div>
            </div>
          ))}
          <div className={styles.row}>
            {variants.length < 4 && <button type="button" className={styles.secondaryBtn} onClick={() => setVariants([...variants, ''])}><Plus size={15} /> Variação da mensagem</button>}
            <label className={styles.secondaryBtn}>
              {mediaBusy ? <Loader2 size={15} className={styles.spin} /> : <Paperclip size={15} />} {media ? 'Trocar anexo' : 'Anexar imagem, vídeo ou PDF'}
              <input type="file" hidden accept="image/*,video/mp4,.pdf,.doc,.docx,.xls,.xlsx" onChange={(e) => { const picked = e.target.files?.[0]; if (picked) uploadMedia(picked); e.target.value = ''; }} />
            </label>
            {media && <button type="button" className={styles.ghostBtn} onClick={() => setMedia(null)}><X size={14} /> {media.name || 'anexo'}</button>}
          </div>
          <span className={styles.hint}>Variações diminuem a chance de o WhatsApp tratar a campanha como spam.</span>
          <label className={styles.check}>
            <input type="checkbox" checked={optout} onChange={(e) => setOptout(e.target.checked)} />
            <span>Incluir no fim como sair da lista (recomendado). Quem responder &quot;SAIR&quot; não recebe mais campanhas.</span>
          </label>
          {optout && <input className={styles.input} value={optoutText} maxLength={200} onChange={(e) => setOptoutText(e.target.value)} />}
        </div>
      ) : (
        <div className={styles.card}>
          <div className={styles.cardHead}>
            <h3>Template aprovado</h3>
            <button type="button" className={styles.ghostBtn} onClick={loadMetaTemplates}><RefreshCw size={14} /> Atualizar</button>
          </div>
          {metaError && <div className={styles.errorBox}><AlertTriangle size={16} /><span>{metaError}</span></div>}
          {metaTemplates === null && <span className={styles.hint}><Loader2 size={14} className={styles.spin} /> Buscando templates na Meta...</span>}
          {metaTemplates?.length === 0 && !metaError && <span className={styles.hint}>Nenhum template aprovado. Crie e aprove em business.facebook.com &gt; Gerenciador do WhatsApp.</span>}
          {!metaTemplate && metaTemplates && metaTemplates.length > 0 && (
            <div className={styles.templateList}>
              {metaTemplates.map((item) => (
                <button key={item.id} type="button" className={styles.templateItem} onClick={() => chooseMetaTemplate(item)}>
                  <strong>{item.name} · {item.language}</strong>
                  <small>{item.components.find((component) => component.type === 'BODY')?.text || ''}</small>
                </button>
              ))}
            </div>
          )}
          {metaTemplate && (
            <>
              <div className={styles.row}>
                <strong className={styles.grow}>{metaTemplate.name} · {metaTemplate.language}</strong>
                <button type="button" className={styles.ghostBtn} onClick={() => setMetaTemplate(null)}>Trocar</button>
              </div>
              <span className={styles.hint} style={{ whiteSpace: 'pre-wrap' }}>{metaTemplate.body}</span>
              {metaTemplate.params.map((param, index) => (
                <label key={index} className={styles.field}>
                  <span>{`{{${index + 1}}}`} será</span>
                  <input className={styles.input} value={param} onChange={(e) => setMetaTemplate({ ...metaTemplate, params: metaTemplate.params.map((item, i) => (i === index ? e.target.value : item)) })} {...bind(`param-${index}`)} />
                </label>
              ))}
              {metaTemplate.params.length > 0 && <VariableBar groups={variableGroups} onPick={pickVariable} />}
            </>
          )}
        </div>
      )}
    </>
  );

  const sendingStep = (
    <>
      <div className={styles.card}>
        <div className={styles.cardHead}><h2>Quando</h2></div>
        <div className={styles.chips}>
          <button type="button" className={`${styles.chip} ${when === 'now' ? styles.chipOn : ''}`} onClick={() => setWhen('now')}>Começar agora</button>
          <button type="button" className={`${styles.chip} ${when === 'schedule' ? styles.chipOn : ''}`} onClick={() => setWhen('schedule')}>Agendar</button>
          <button type="button" className={`${styles.chip} ${when === 'draft' ? styles.chipOn : ''}`} onClick={() => setWhen('draft')}>Salvar como rascunho</button>
        </div>
        {when === 'schedule' && (
          <label className={styles.field}>
            <span>Data e hora de início</span>
            <input className={styles.input} type="datetime-local" min={minDate} value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
          </label>
        )}
      </div>

      <div className={styles.card}>
        <div className={styles.cardHead}><h2>Ritmo</h2></div>
        <div className={styles.speedGrid}>
          {SPEEDS.map((item) => (
            <button key={item.id} type="button" className={`${styles.choice} ${speed === item.id ? styles.choiceOn : ''}`} onClick={() => chooseSpeed(item.id)}>
              <span><strong>{item.label}</strong><small>{item.min}–{item.max}s entre mensagens</small></span>
            </button>
          ))}
          <button type="button" className={`${styles.choice} ${speed === 'custom' ? styles.choiceOn : ''}`} onClick={() => setSpeed('custom')}>
            <span><strong>Personalizado</strong><small>Você define o intervalo</small></span>
          </button>
        </div>
        <span className={styles.hint}>{SPEEDS.find((item) => item.id === speed)?.hint || 'O intervalo é sorteado entre o mínimo e o máximo a cada mensagem.'}</span>
        {speed === 'custom' && (
          <div className={styles.grid2}>
            <label className={styles.field}><span>Mínimo (segundos)</span><input className={styles.input} type="number" min={2} max={600} value={delay.min} onChange={(e) => setDelay({ ...delay, min: Number(e.target.value) })} /></label>
            <label className={styles.field}><span>Máximo (segundos)</span><input className={styles.input} type="number" min={2} max={600} value={delay.max} onChange={(e) => setDelay({ ...delay, max: Number(e.target.value) })} /></label>
          </div>
        )}
        <label className={styles.check}><input type="checkbox" checked={useWindow} onChange={(e) => setUseWindow(e.target.checked)} /><span>Enviar só em horário comercial (fora dele a campanha espera)</span></label>
        {useWindow && (
          <>
            <div className={styles.grid2}>
              <label className={styles.field}><span>Das</span><input className={styles.input} type="time" value={sendWindow.start} onChange={(e) => setSendWindow({ ...sendWindow, start: e.target.value })} /></label>
              <label className={styles.field}><span>Até as</span><input className={styles.input} type="time" value={sendWindow.end} onChange={(e) => setSendWindow({ ...sendWindow, end: e.target.value })} /></label>
            </div>
            <div className={styles.days}>
              {WEEKDAYS.map((day, index) => (
                <button key={day} type="button" className={`${styles.day} ${sendWindow.days.includes(index) ? styles.dayOn : ''}`} onClick={() => setSendWindow({ ...sendWindow, days: sendWindow.days.includes(index) ? sendWindow.days.filter((item) => item !== index) : [...sendWindow.days, index].sort() })}>{day.slice(0, 3)}</button>
              ))}
            </div>
          </>
        )}
        <label className={styles.check}><input type="checkbox" checked={useLimit} onChange={(e) => setUseLimit(e.target.checked)} /><span>Limitar mensagens por dia (protege números novos)</span></label>
        {useLimit && <input className={styles.input} type="number" min={1} max={10000} value={dailyLimit} onChange={(e) => setDailyLimit(Number(e.target.value))} />}
      </div>

      <div className={styles.card}>
        <div className={styles.cardHead}><h2>Quando o contato responder</h2></div>
        <div className={styles.grid2}>
          <label className={styles.field}>
            <span>Encaminhar</span>
            <select className={styles.input} value={routeType} onChange={(e) => { setRouteType(e.target.value as typeof routeType); setRouteToId(''); }}>
              <option value="none">Não mudar nada</option>
              <option value="user">Para uma pessoa da equipe</option>
              <option value="stage">Para uma etapa do funil</option>
            </select>
          </label>
          {routeType !== 'none' && (
            <label className={styles.field}>
              <span>{routeType === 'user' ? 'Pessoa' : 'Etapa'}</span>
              <select className={styles.input} value={routeToId} onChange={(e) => setRouteToId(e.target.value)}>
                <option value="">Escolha</option>
                {(routeType === 'user' ? options?.team : options?.stages)?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
          )}
        </div>
        <div className={styles.grid2}>
          <label className={styles.field}>
            <span>Pôr a etiqueta</span>
            <input className={styles.input} list="campaign-tags" value={tagOnReply} maxLength={40} placeholder="respondeu campanha" onChange={(e) => setTagOnReply(e.target.value)} />
            <datalist id="campaign-tags">{options?.tags.map((tag) => <option key={tag} value={tag} />)}</datalist>
          </label>
          <label className={styles.field}>
            <span>Iniciar a automação</span>
            <select className={styles.input} value={flowOnReply} onChange={(e) => setFlowOnReply(e.target.value)}>
              <option value="">Nenhuma</option>
              {options?.flows.map((flow) => <option key={flow.id} value={flow.id} disabled={flow.status !== 'active'}>{flow.name}{flow.status !== 'active' ? ' (inativa)' : ''}</option>)}
            </select>
          </label>
        </div>
        <span className={styles.hint}>Vale para a primeira resposta em até 7 dias. As automações com gatilho &quot;Mensagem recebida&quot; também rodam normalmente.</span>
        {audienceType === 'file' && (
          <label className={styles.check}><input type="checkbox" checked={createLeads} onChange={(e) => setCreateLeads(e.target.checked)} /><span>Cadastrar como lead quem receber (com a etiqueta &quot;disparos&quot;). Sem isso, o lead só é criado quando a pessoa responde.</span></label>
        )}
      </div>
    </>
  );

  const summary = (
    <ul className={styles.summaryList}>
      <li><span>Público</span><span>{audienceType === 'file' ? file?.name || '—' : 'Leads do CRM'}</span></li>
      <li><span>Vão receber</span><span>{validCount.toLocaleString('pt-BR')}</span></li>
      <li><span>Canal</span><span>{channelLabel}</span></li>
      <li><span>Ritmo</span><span>{delay.min}–{delay.max}s</span></li>
      <li><span>Horário</span><span>{useWindow ? `${sendWindow.start}–${sendWindow.end}` : 'Qualquer hora'}</span></li>
      {useLimit && <li><span>Limite por dia</span><span>{dailyLimit}</span></li>}
      <li><span>Início</span><span>{when === 'now' ? 'Agora' : when === 'schedule' ? (scheduledAt ? new Date(scheduledAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—') : 'Rascunho'}</span></li>
      {eta && when !== 'draft' && <li><span>Previsão de término</span><span>{eta.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} ({formatDuration(eta.getTime() - (when === 'schedule' && scheduledAt ? new Date(scheduledAt).getTime() : openedAt))})</span></li>}
    </ul>
  );

  const reviewStep = (
    <div className={styles.card}>
      <div className={styles.cardHead}><h2>Tudo certo?</h2></div>
      {summary}
      {routeType !== 'none' || tagOnReply || flowOnReply ? (
        <span className={styles.hint}>Ao responder: {[routeType === 'user' ? `vai para ${options?.team.find((item) => item.id === routeToId)?.name}` : routeType === 'stage' ? `vai para a etapa ${options?.stages.find((item) => item.id === routeToId)?.name}` : '', tagOnReply ? `ganha a etiqueta "${tagOnReply}"` : '', flowOnReply ? `entra na automação "${options?.flows.find((item) => item.id === flowOnReply)?.name}"` : ''].filter(Boolean).join(', ')}.</span>
      ) : null}
      {options && !options.worker && <div className={styles.banner}><AlertTriangle size={16} /><span>O envio automático está desligado neste servidor: a campanha fica na fila até ele ser ligado (<code>CONTENT_SCHEDULER_ENABLED=true</code>).</span></div>}
      <div className={styles.banner}><AlertTriangle size={16} /><span>Envie só para quem conhece sua empresa. Muitas denúncias de spam podem bloquear o número no WhatsApp.</span></div>
    </div>
  );

  return (
    <div className={styles.page}>
      <div className={styles.detailHead}>
        <div className={styles.detailTitle}>
          <Link href="/disparos" className={styles.backLink}><ArrowLeft size={15} /> Disparos</Link>
          <h1>Nova campanha</h1>
        </div>
      </div>

      <nav className={styles.steps} aria-label="Passos">
        {STEPS.map((label, index) => (
          <button key={label} type="button" disabled={!canGo(index)} className={`${styles.stepBtn} ${step === index ? styles.stepOn : ''} ${index < step ? styles.stepDone : ''}`} onClick={() => setStep(index)}>
            <span>{index < step ? '✓' : index + 1}</span> <em>{label}</em>
          </button>
        ))}
      </nav>

      {error && <div className={styles.errorBox}><AlertTriangle size={16} /><span>{error}</span></div>}

      <div className={styles.wizard}>
        <div className={styles.wizardMain}>
          {step === 0 && audienceStep}
          {step === 1 && messageStep}
          {step === 2 && sendingStep}
          {step === 3 && reviewStep}

          <div className={styles.wizardNav}>
            <button type="button" className={styles.secondaryBtn} disabled={step === 0} onClick={() => setStep(step - 1)}><ArrowLeft size={15} /> Voltar</button>
            {problem && <span className={styles.hint} style={{ alignSelf: 'center' }}>{problem}</span>}
            {step < 3 ? (
              <button type="button" className={styles.primaryBtn} disabled={Boolean(problem)} onClick={() => setStep(step + 1)}>Continuar <ArrowRight size={15} /></button>
            ) : (
              <button type="button" className={styles.primaryBtn} disabled={busy || [0, 1, 2].some((i) => stepProblem(i))} onClick={submit}>
                {busy ? <Loader2 size={15} className={styles.spin} /> : <Send size={15} />}
                {when === 'now' ? `Iniciar envio para ${validCount}` : when === 'schedule' ? 'Agendar campanha' : 'Salvar rascunho'}
              </button>
            )}
          </div>
        </div>

        <aside className={styles.wizardSide}>
          <div className={styles.card}>
            <div className={styles.cardHead}><h3>Prévia</h3><span className={styles.hint}>{samples[0] ? samples[0].name || samples[0].phone : 'contato de exemplo'}</span></div>
            <PhonePreview messages={previews} media={channel === 'web' ? media : null} />
            {channel === 'web' && variants.some((item) => item.trim()) && <span className={styles.hint}>Mostrando a mensagem principal; cada contato recebe uma das {variants.filter((item) => item.trim()).length + 1} versões.</span>}
          </div>
          {step >= 1 && (
            <div className={styles.card}>
              <div className={styles.cardHead}><h3>Enviar um teste</h3></div>
              <div className={styles.row}>
                <input className={`${styles.input} ${styles.grow}`} placeholder="Seu WhatsApp com DDD" value={testPhone} onChange={(e) => setTestPhone(e.target.value)} />
                <button type="button" className={styles.secondaryBtn} disabled={!testPhone.trim() || testState?.busy || Boolean(stepProblem(1))} onClick={sendTest}>
                  {testState?.busy ? <Loader2 size={15} className={styles.spin} /> : <Send size={15} />} Testar
                </button>
              </div>
              {testState?.message && <span className={testState.ok ? styles.hint : styles.errorBox}>{testState.message}</span>}
            </div>
          )}
          {step >= 2 && <div className={styles.card}><div className={styles.cardHead}><h3>Resumo</h3></div>{summary}</div>}
        </aside>
      </div>
    </div>
  );
}
