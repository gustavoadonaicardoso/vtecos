'use client';

import React, { useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowRight, ArrowUp, Braces, Copy, Loader2, Plus, RefreshCw, Trash2, Upload, X } from 'lucide-react';
import styles from '../automations.module.css';
import {
  aiCategories,
  BUILTIN_VARIABLES,
  businessHours,
  cleanVariableName,
  CONDITION_FIELDS,
  conditionRules,
  flowVariables,
  isTrigger,
  keyValues,
  menuOptions,
  NO_VALUE_OPERATORS,
  OPERATOR_LABEL,
  portLabel,
  stringList,
  switchCases,
  triggerOf,
  VALIDATION_LABEL,
  WEEKDAYS,
  type AnswerValidation,
  type ConditionOperator,
  type FlowGraph,
  type FlowNode,
  type NodeConfig,
} from '@/lib/automations/flow';
import { BLOCKS, newItemId, type EditorOptions } from '../library';

interface InspectorProps {
  node: FlowNode;
  graph: FlowGraph;
  options: EditorOptions | null;
  readOnly: boolean;
  flowId: string;
  webhookToken: string | null;
  onRegenerateToken: () => void;
  onLabel: (label: string) => void;
  onConfig: (config: NodeConfig) => void;
  onRemoveConnection: (connectionId: string) => void;
  onDelete: () => void;
  onClose: () => void;
}

type VariableGroup = { group: string; items: { name: string; description: string }[] };

/** Variáveis disponíveis: as prontas + as que os blocos deste fluxo guardam + as do gatilho. */
function variableGroups(graph: FlowGraph): VariableGroup[] {
  const groups: VariableGroup[] = [...BUILTIN_VARIABLES];
  const own = flowVariables(graph);
  if (graph.nodes.some((node) => node.type === 'webhook')) own.push({ name: 'webhook_status', description: 'Código de resposta do último webhook' });
  if (own.length) groups.unshift({ group: 'Deste fluxo', items: own });
  const trigger = triggerOf(graph);
  if (trigger?.type === 'trigger-tag') groups.unshift({ group: 'Gatilho', items: [{ name: 'etiqueta', description: 'Etiqueta que disparou o fluxo' }] });
  if (trigger?.type === 'trigger-webhook') {
    groups.unshift({ group: 'Dados recebidos', items: [{ name: 'entrada.nome_do_campo', description: 'Troque pelo nome do campo enviado (ex.: entrada.pedido)' }] });
  }
  return groups;
}

function VariablePicker({ groups, disabled, onPick }: { groups: VariableGroup[]; disabled: boolean; onPick: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const term = search.trim().toLowerCase();
  const filtered = groups
    .map((group) => ({ ...group, items: group.items.filter((item) => `${item.name} ${item.description}`.toLowerCase().includes(term)) }))
    .filter((group) => group.items.length > 0);
  return (
    <div className={styles.varPicker}>
      <button type="button" className={styles.varToggle} disabled={disabled} onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <Braces size={12} /> Inserir variável
      </button>
      {open && (
        <div className={styles.varMenu} role="listbox">
          <input className={styles.input} autoFocus placeholder="Buscar variável" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className={styles.varList}>
            {filtered.map((group) => (
              <div key={group.group}>
                <span className={styles.sectionLabel}>{group.group}</span>
                {group.items.map((item) => (
                  <button key={item.name} type="button" onClick={() => { onPick(item.name); setOpen(false); setSearch(''); }}>
                    <code>{`{{${item.name}}}`}</code>
                    <small>{item.description}</small>
                  </button>
                ))}
              </div>
            ))}
            {filtered.length === 0 && <small className={styles.note}>Nada encontrado.</small>}
          </div>
          <small className={styles.note}>Dica: {'{{lead.first_name|cliente}}'} usa &quot;cliente&quot; quando o nome está vazio.</small>
        </div>
      )}
    </div>
  );
}

/** Campo de texto com {{variáveis}}: insere onde o cursor está. */
function TemplateInput({ value, onChange, groups, disabled, rows, placeholder, maxLength }: {
  value: string;
  onChange: (value: string) => void;
  groups: VariableGroup[];
  disabled: boolean;
  rows?: number;
  placeholder?: string;
  maxLength?: number;
}) {
  const ref = useRef<HTMLTextAreaElement & HTMLInputElement>(null);
  // Onde o cursor estava (o campo perde o foco ao abrir o seletor). Sem cursor: no fim.
  const caret = useRef<{ start: number; end: number } | null>(null);
  const remember = () => {
    if (ref.current) caret.current = { start: ref.current.selectionStart ?? value.length, end: ref.current.selectionEnd ?? value.length };
  };
  const insert = (name: string) => {
    const element = ref.current;
    const token = `{{${name}}}`;
    const start = Math.min(caret.current?.start ?? value.length, value.length);
    const end = Math.min(caret.current?.end ?? value.length, value.length);
    caret.current = { start: start + token.length, end: start + token.length };
    onChange(`${value.slice(0, start)}${token}${value.slice(end)}`);
    requestAnimationFrame(() => {
      element?.focus();
      element?.setSelectionRange(start + token.length, start + token.length);
    });
  };
  return (
    <>
      {rows ? (
        <textarea ref={ref} className={styles.input} rows={rows} value={value} placeholder={placeholder} maxLength={maxLength} onChange={(e) => onChange(e.target.value)} onSelect={remember} onKeyUp={remember} onClick={remember} />
      ) : (
        <input ref={ref} className={styles.input} value={value} placeholder={placeholder} maxLength={maxLength} onChange={(e) => onChange(e.target.value)} onSelect={remember} onKeyUp={remember} onClick={remember} />
      )}
      <VariablePicker groups={groups} disabled={disabled} onPick={insert} />
    </>
  );
}

function Field({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className={styles.field}>
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </div>
  );
}

function Check({ checked, onChange, children }: { checked: boolean; onChange: (value: boolean) => void; children: React.ReactNode }) {
  return (
    <label className={styles.check}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  );
}

/** Botões de subir/descer/remover de uma linha de lista. */
function RowActions({ index, total, onMove, onRemove, min = 0 }: { index: number; total: number; onMove: (from: number, to: number) => void; onRemove: () => void; min?: number }) {
  return (
    <div className={styles.rowActions}>
      <button type="button" aria-label="Subir" disabled={index === 0} onClick={() => onMove(index, index - 1)}><ArrowUp size={13} /></button>
      <button type="button" aria-label="Descer" disabled={index === total - 1} onClick={() => onMove(index, index + 1)}><ArrowDown size={13} /></button>
      <button type="button" aria-label="Remover" disabled={total <= min} onClick={onRemove}><Trash2 size={13} /></button>
    </div>
  );
}

function moveItem<T>(list: T[], from: number, to: number) {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** Escolher pessoas da equipe (vários). */
function MemberPicker({ value, onChange, options, emptyHint }: { value: string[]; onChange: (value: string[]) => void; options: EditorOptions | null; emptyHint: string }) {
  const team = options?.team || [];
  return (
    <div className={styles.pickList}>
      {team.length === 0 && <small className={styles.note}>Carregando a equipe...</small>}
      {team.map((member) => (
        <label key={member.id} className={`${styles.check} ${styles.pickItem}`}>
          <input type="checkbox" checked={value.includes(member.id)} onChange={(e) => onChange(e.target.checked ? [...value, member.id] : value.filter((id) => id !== member.id))} />
          <span>
            <strong>{member.name}</strong>
            <small>{{ ADMIN: 'Administrador', MANAGER: 'Gerente', SELLER: 'Vendedor' }[member.role || ''] || member.role}{member.hasPhone === false ? ' · sem telefone no perfil' : ''}</small>
          </span>
        </label>
      ))}
      {value.length === 0 && team.length > 0 && <small className={styles.note}>{emptyHint}</small>}
    </div>
  );
}

/** O que comparar: campos do lead, data/hora, valores do fluxo ou outro (digitado). */
function FieldSelect({ value, onChange, graph }: { value: string; onChange: (value: string) => void; graph: FlowGraph }) {
  const own = flowVariables(graph);
  const known = CONDITION_FIELDS.some((item) => item.value === value) || own.some((item) => item.name === value);
  const [custom, setCustom] = useState(Boolean(value) && !known);
  return (
    <div className={styles.stack}>
      <select className={styles.input} value={custom ? '__custom' : value} onChange={(e) => {
        if (e.target.value === '__custom') { setCustom(true); return; }
        setCustom(false);
        onChange(e.target.value);
      }}>
        <option value="">Escolha</option>
        <optgroup label="Contato e conversa">
          {CONDITION_FIELDS.map((field) => <option key={field.value} value={field.value}>{field.label}</option>)}
        </optgroup>
        {own.length > 0 && (
          <optgroup label="Valores deste fluxo">
            {own.map((item) => <option key={item.name} value={item.name}>{`{{${item.name}}}`} · {item.description}</option>)}
          </optgroup>
        )}
        <option value="__custom">Outra variável (digitar)…</option>
      </select>
      {custom && <input className={styles.input} value={value} placeholder="ex.: entrada.produto" onChange={(e) => onChange(e.target.value.replace(/[^\w.]/g, ''))} />}
    </div>
  );
}

function DurationInput({ minutes, onChange, allowZero }: { minutes: number; onChange: (minutes: number) => void; allowZero?: boolean }) {
  const unit = minutes > 0 && minutes % 1440 === 0 ? 1440 : minutes > 0 && minutes % 60 === 0 ? 60 : 1;
  const min = allowZero ? 0 : 1;
  return (
    <div className={styles.inline}>
      <input className={styles.input} type="number" min={min} value={Math.max(min, Math.round(minutes / unit))} onChange={(e) => onChange(Math.max(min, Number(e.target.value) || 0) * unit)} />
      <select className={styles.input} value={unit} onChange={(e) => onChange(Math.max(min, Math.round(minutes / unit)) * Number(e.target.value))}>
        <option value={1}>minutos</option>
        <option value={60}>horas</option>
        <option value={1440}>dias</option>
      </select>
    </div>
  );
}

function MediaUpload({ disabled, onUploaded }: { disabled: boolean; onUploaded: (file: { url: string; kind: NodeConfig['mediaKind']; fileName: string }) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const upload = async (file: File) => {
    setBusy(true);
    setError('');
    const form = new FormData();
    form.append('file', file);
    const response = await fetch('/api/automations/upload', { method: 'POST', body: form });
    const json = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) setError(json.error || 'Não foi possível enviar o arquivo.');
    else onUploaded(json.data);
  };
  return (
    <div className={styles.stack}>
      <label className={`${styles.secondaryBtn} ${disabled || busy ? styles.disabledLabel : ''}`}>
        {busy ? <Loader2 size={15} className={styles.spin} /> : <Upload size={15} />} {busy ? 'Enviando...' : 'Enviar arquivo do computador'}
        <input type="file" hidden disabled={disabled || busy} accept="image/*,video/mp4,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.zip" onChange={(e) => { const file = e.target.files?.[0]; if (file) upload(file); e.target.value = ''; }} />
      </label>
      {error && <small className={styles.errorText}>{error}</small>}
    </div>
  );
}

const ROLE_HINT = 'Ninguém escolhido = vendedores e gerentes ativos.';

export default function Inspector({ node, graph, options, readOnly, flowId, webhookToken, onRegenerateToken, onLabel, onConfig, onRemoveConnection, onDelete, onClose }: InspectorProps) {
  const c = node.config;
  const block = BLOCKS[node.type];
  const groups = useMemo(() => variableGroups(graph), [graph]);
  const set = (changes: NodeConfig) => onConfig(changes);
  const tpl = (key: keyof NodeConfig, props: { rows?: number; placeholder?: string; maxLength?: number } = {}) => (
    <TemplateInput value={String(c[key] ?? '')} onChange={(value) => set({ [key]: value })} groups={groups} disabled={readOnly} {...props} />
  );
  const [copied, setCopied] = useState(false);

  const connections = graph.connections.filter((connection) => connection.fromId === node.id || connection.toId === node.id);
  const hookUrl = webhookToken && typeof window !== 'undefined' ? `${window.location.origin}/api/automations/hooks/${webhookToken}` : '';
  const stageOptions = (empty: string) => (
    <>
      <option value="">{empty}</option>
      {options?.stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
    </>
  );
  const tagList = <datalist id={`tags-${node.id}`}>{options?.tags.map((tag) => <option key={tag} value={tag} />)}</datalist>;

  return (
    <div className={styles.inspector}>
      <div className={styles.inspectorHead}>
        <span className={styles.blockIcon} style={{ color: block.color, background: `${block.color}1f` }}><block.icon size={18} /></span>
        <div>
          <small>{isTrigger(node.type) ? 'Gatilho' : 'Bloco'}</small>
          <strong>{block.description}</strong>
        </div>
        <button type="button" className={styles.iconBtn} onClick={onClose} aria-label="Fechar"><X size={16} /></button>
      </div>

      <fieldset className={styles.inspectorBody} disabled={readOnly}>
        <Field label="Nome do bloco">
          <input className={styles.input} value={node.label} maxLength={80} onChange={(e) => onLabel(e.target.value)} />
        </Field>

        {/* ── Gatilhos ── */}
        {node.type === 'trigger-message' && (
          <>
            <Field label="Quais mensagens">
              <select className={styles.input} value={c.matchMode || 'any'} onChange={(e) => set({ matchMode: e.target.value as NodeConfig['matchMode'] })}>
                <option value="any">Qualquer mensagem</option>
                <option value="keywords">Que contenha uma das palavras-chave</option>
                <option value="exact">Exatamente igual a uma das palavras</option>
              </select>
            </Field>
            {c.matchMode && c.matchMode !== 'any' && (
              <Field label="Palavras-chave" hint="Separe por vírgula. Não diferencia maiúsculas nem acentos.">
                <input className={styles.input} value={c.keywords || ''} placeholder="orçamento, preço, valor" onChange={(e) => set({ keywords: e.target.value })} />
              </Field>
            )}
            <Check checked={Boolean(c.onlyNewContacts)} onChange={(value) => set({ onlyNewContacts: value })}>Só no primeiro contato (número que ainda não era lead)</Check>
          </>
        )}

        {node.type === 'trigger-lead' && (
          <Field label="Origem do lead">
            <select className={styles.input} value={c.source || 'any'} onChange={(e) => set({ source: e.target.value as NodeConfig['source'] })}>
              <option value="any">Qualquer origem</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="form">Formulário do site / captura de leads</option>
              <option value="manual">Cadastro manual</option>
              <option value="totem">Totem de senhas</option>
              <option value="webhook">Outro sistema (webhook de uma automação)</option>
            </select>
          </Field>
        )}

        {node.type === 'trigger-stage' && (
          <Field label="Etapa do funil">
            <select className={styles.input} value={c.stageId || ''} onChange={(e) => set({ stageId: e.target.value })}>{stageOptions('Escolha a etapa')}</select>
          </Field>
        )}

        {node.type === 'trigger-tag' && (
          <Field label="Etiqueta" hint="Quando alguém (ou outra automação) colocar essa etiqueta no lead. Use {{etiqueta}} nas mensagens.">
            <input className={styles.input} list={`tags-${node.id}`} value={c.tag || ''} maxLength={40} placeholder="cliente vip" onChange={(e) => set({ tag: e.target.value })} />
            {tagList}
          </Field>
        )}

        {node.type === 'trigger-inactive' && (
          <>
            <Field label="Situação da conversa">
              <select className={styles.input} value={c.inactiveWho || 'any'} onChange={(e) => set({ inactiveWho: e.target.value as NodeConfig['inactiveWho'] })}>
                <option value="customer_silent">O cliente não respondeu a última mensagem da empresa</option>
                <option value="customer_waiting">O cliente está esperando resposta da equipe</option>
                <option value="any">Qualquer conversa parada</option>
              </select>
            </Field>
            <Field label="Parada há" hint="Conta a partir da última mensagem (de qualquer lado). O agendador confere a cada 5 minutos.">
              <DurationInput minutes={(Number(c.inactiveHours) || 1) * 60} onChange={(minutes) => set({ inactiveHours: Math.max(1, Math.round(minutes / 60)) })} />
            </Field>
            <Field label="Só na etapa (opcional)">
              <select className={styles.input} value={c.stageId || ''} onChange={(e) => set({ stageId: e.target.value })}>{stageOptions('Qualquer etapa')}</select>
            </Field>
          </>
        )}

        {node.type === 'trigger-schedule' && (
          <>
            <Field label="Repetir">
              <select className={styles.input} value={c.scheduleMode || 'weekdays'} onChange={(e) => set({ scheduleMode: e.target.value as NodeConfig['scheduleMode'] })}>
                <option value="daily">Todo dia</option>
                <option value="weekdays">De segunda a sexta</option>
                <option value="weekly">Toda semana</option>
                <option value="monthly">Todo mês</option>
                <option value="once">Uma vez só</option>
              </select>
            </Field>
            <div className={styles.formRow}>
              {c.scheduleMode === 'weekly' && (
                <Field label="Dia da semana">
                  <select className={styles.input} value={c.scheduleWeekday ?? 1} onChange={(e) => set({ scheduleWeekday: Number(e.target.value) })}>
                    {WEEKDAYS.map((day, index) => <option key={day} value={index}>{day}</option>)}
                  </select>
                </Field>
              )}
              {c.scheduleMode === 'monthly' && (
                <Field label="Dia do mês" hint="Dia 31 em mês curto = último dia.">
                  <input className={styles.input} type="number" min={1} max={31} value={c.scheduleDay ?? 1} onChange={(e) => set({ scheduleDay: Math.min(31, Math.max(1, Number(e.target.value) || 1)) })} />
                </Field>
              )}
              {c.scheduleMode === 'once' && (
                <Field label="Data">
                  <input className={styles.input} type="date" value={c.scheduleDate || ''} onChange={(e) => set({ scheduleDate: e.target.value })} />
                </Field>
              )}
              <Field label="Horário (Brasília)">
                <input className={styles.input} type="time" value={c.scheduleTime || ''} onChange={(e) => set({ scheduleTime: e.target.value })} />
              </Field>
            </div>
            <span className={styles.sectionLabel}>Para quais leads</span>
            <Field label="Etapa do funil">
              <select className={styles.input} value={c.filterStageId || ''} onChange={(e) => set({ filterStageId: e.target.value })}>{stageOptions('Qualquer etapa')}</select>
            </Field>
            <Field label="Com a etiqueta" hint="Até 1.000 leads por disparo. Eles entram numa fila e saem 60 por minuto.">
              <input className={styles.input} list={`tags-${node.id}`} value={c.filterTag || ''} placeholder="Qualquer etiqueta" onChange={(e) => set({ filterTag: e.target.value })} />
              {tagList}
            </Field>
          </>
        )}

        {node.type === 'trigger-webhook' && (
          <>
            <Field label="Endereço do fluxo (POST)" hint="Cole no Make, Zapier, n8n, no seu site ou ERP. Funciona com o fluxo ativo.">
              {hookUrl ? (
                <div className={styles.copyRow}>
                  <code>{hookUrl}</code>
                  <button type="button" className={styles.iconBtn} aria-label="Copiar" onClick={() => { navigator.clipboard?.writeText(hookUrl); setCopied(true); window.setTimeout(() => setCopied(false), 1500); }}>
                    <Copy size={14} />
                  </button>
                </div>
              ) : (
                <small className={styles.note}>O endereço aparece depois de salvar (alguns segundos).</small>
              )}
              {copied && <small className={styles.okText}>Copiado!</small>}
              {!readOnly && (
                <button type="button" className={styles.linkBtn} onClick={onRegenerateToken}><RefreshCw size={13} /> {webhookToken ? 'Gerar endereço novo' : 'Gerar endereço'}</button>
              )}
            </Field>
            <div className={styles.formRow}>
              <Field label="Campo do telefone">
                <input className={styles.input} value={c.phoneField || ''} placeholder="phone" onChange={(e) => set({ phoneField: e.target.value.replace(/[^\w.[\]-]/g, '') })} />
              </Field>
              <Field label="Campo do nome">
                <input className={styles.input} value={c.nameField || ''} placeholder="name" onChange={(e) => set({ nameField: e.target.value.replace(/[^\w.[\]-]/g, '') })} />
              </Field>
            </div>
            <Field label="Campo do e-mail">
              <input className={styles.input} value={c.emailField || ''} placeholder="email" onChange={(e) => set({ emailField: e.target.value.replace(/[^\w.[\]-]/g, '') })} />
            </Field>
            <Check checked={c.createLead !== false} onChange={(value) => set({ createLead: value })}>Criar o lead se o telefone ainda não estiver no CRM</Check>
            <small className={styles.note}>
              Exemplo de corpo: <code>{'{"phone": "11999998888", "name": "Maria", "pedido": "1234"}'}</code>. Todo campo enviado vira <code>{'{{entrada.campo}}'}</code> (ex.: <code>{'{{entrada.pedido}}'}</code>).
            </small>
          </>
        )}

        {node.type === 'trigger-manual' && (
          <small className={styles.note}>Este fluxo só começa quando alguém da equipe clica em &quot;Rodar para leads&quot; (no topo do editor) e escolhe os contatos. Qualquer fluxo ativo também pode ser rodado assim.</small>
        )}

        {isTrigger(node.type) && node.type !== 'trigger-manual' && (
          <div className={styles.formRow}>
            <Field label="Não repetir por (horas)" hint="0 = pode rodar de novo assim que terminar.">
              <input className={styles.input} type="number" min={0} max={720} value={c.reentryHours ?? 24} onChange={(e) => set({ reentryHours: Math.max(0, Number(e.target.value) || 0) })} />
            </Field>
            <Field label="Máximo por lead" hint="0 = sem limite de vezes.">
              <input className={styles.input} type="number" min={0} max={100} value={c.maxRunsPerLead ?? 0} onChange={(e) => set({ maxRunsPerLead: Math.max(0, Number(e.target.value) || 0) })} />
            </Field>
          </div>
        )}

        {/* ── Conversa ── */}
        {node.type === 'send-message' && (
          <>
            <Field label="Mensagem">{tpl('message', { rows: 5 })}</Field>
            {stringList(c.variants).map((variant, index) => (
              <Field key={index} label={`Variação ${index + 2}`}>
                <TemplateInput value={variant} rows={3} groups={groups} disabled={readOnly} onChange={(value) => set({ variants: stringList(c.variants).map((item, i) => (i === index ? value : item)) })} />
                <button type="button" className={styles.linkBtn} onClick={() => set({ variants: stringList(c.variants).filter((_, i) => i !== index) })}><Trash2 size={13} /> Remover variação</button>
              </Field>
            ))}
            {stringList(c.variants).length < 4 && (
              <button type="button" className={styles.linkBtn} onClick={() => set({ variants: [...stringList(c.variants), ''] })}>
                <Plus size={13} /> Adicionar variação (uma é sorteada a cada envio)
              </button>
            )}
            <Field label='Mostrar "digitando..." antes' hint="Só no WhatsApp Web. Deixa a conversa mais natural.">
              <select className={styles.input} value={c.typingSeconds ?? 0} onChange={(e) => set({ typingSeconds: Number(e.target.value) })}>
                {[0, 1, 2, 3, 5, 8, 10].map((seconds) => <option key={seconds} value={seconds}>{seconds === 0 ? 'Não' : `${seconds} segundo(s)`}</option>)}
              </select>
            </Field>
          </>
        )}

        {node.type === 'send-media' && (
          <>
            <Field label="Tipo">
              <select className={styles.input} value={c.mediaKind || 'image'} onChange={(e) => set({ mediaKind: e.target.value as NodeConfig['mediaKind'] })}>
                <option value="image">Imagem</option>
                <option value="video">Vídeo (MP4)</option>
                <option value="audio">Áudio</option>
                <option value="document">Documento (PDF, planilha...)</option>
              </select>
            </Field>
            <MediaUpload disabled={readOnly} onUploaded={(file) => set({ mediaUrl: file.url, mediaKind: file.kind, fileName: file.fileName })} />
            <Field label="Ou o link público do arquivo (https)">
              <input className={styles.input} value={c.mediaUrl || ''} placeholder="https://..." onChange={(e) => set({ mediaUrl: e.target.value })} />
            </Field>
            {c.mediaKind === 'document' && (
              <Field label="Nome do arquivo para o contato">
                <input className={styles.input} value={c.fileName || ''} placeholder="proposta.pdf" onChange={(e) => set({ fileName: e.target.value })} />
              </Field>
            )}
            {c.mediaKind !== 'audio' && <Field label="Legenda (opcional)">{tpl('caption', { rows: 2 })}</Field>}
          </>
        )}

        {node.type === 'question' && (
          <>
            <Field label="Pergunta">{tpl('question', { rows: 4 })}</Field>
            <Field label="Tipo de resposta" hint={c.validation && c.validation !== 'text' ? 'Resposta fora do formato: pede de novo e, depois das tentativas, segue por "Resposta inválida".' : undefined}>
              <select className={styles.input} value={c.validation || 'text'} onChange={(e) => set({ validation: e.target.value as AnswerValidation })}>
                {Object.entries(VALIDATION_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </Field>
            <div className={styles.formRow}>
              <Field label="Guardar como" hint="Use depois como {{nome}}.">
                <input className={styles.input} value={c.variable || ''} placeholder="interesse" onChange={(e) => set({ variable: cleanVariableName(e.target.value) })} />
              </Field>
              <Field label="Salvar também no lead">
                <select className={styles.input} value={c.saveTo || ''} onChange={(e) => set({ saveTo: e.target.value as NodeConfig['saveTo'] })}>
                  <option value="">Não</option>
                  <option value="name">Nome</option>
                  <option value="email">E-mail</option>
                  <option value="cpf_cnpj">CPF/CNPJ</option>
                  <option value="value">Valor</option>
                  <option value="notes">Observações</option>
                </select>
              </Field>
            </div>
            <div className={styles.formRow}>
              <Field label="Esperar resposta (horas)">
                <input className={styles.input} type="number" min={1} max={168} value={c.timeoutHours ?? 24} onChange={(e) => set({ timeoutHours: Math.min(168, Math.max(1, Number(e.target.value) || 1)) })} />
              </Field>
              {c.validation && c.validation !== 'text' && (
                <Field label="Tentativas">
                  <input className={styles.input} type="number" min={1} max={5} value={c.maxAttempts ?? 2} onChange={(e) => set({ maxAttempts: Math.min(5, Math.max(1, Number(e.target.value) || 1)) })} />
                </Field>
              )}
            </div>
            {c.validation && c.validation !== 'text' && <Field label="Mensagem quando a resposta for inválida" hint="Vazio = mensagem padrão do tipo escolhido.">{tpl('retryMessage', { rows: 2 })}</Field>}
          </>
        )}

        {node.type === 'menu' && (
          <>
            <Field label="Mensagem do menu">{tpl('question', { rows: 3 })}</Field>
            <span className={styles.sectionLabel}>Opções (cada uma tem a sua saída)</span>
            {menuOptions(c).map((option, index, list) => (
              <div key={option.id} className={styles.listRow}>
                <span className={styles.rowBadge}>{index + 1}</span>
                <div className={styles.stack}>
                  <input className={styles.input} value={option.label} maxLength={60} placeholder="Texto da opção" onChange={(e) => set({ options: list.map((item) => (item.id === option.id ? { ...item, label: e.target.value } : item)) })} />
                  <input className={`${styles.input} ${styles.inputSmall}`} value={option.keywords || ''} placeholder="Palavras que também valem (ex.: preço, valor)" onChange={(e) => set({ options: list.map((item) => (item.id === option.id ? { ...item, keywords: e.target.value } : item)) })} />
                </div>
                <RowActions index={index} total={list.length} min={2} onMove={(from, to) => set({ options: moveItem(list, from, to) })} onRemove={() => set({ options: list.filter((item) => item.id !== option.id) })} />
              </div>
            ))}
            {menuOptions(c).length < 10 && (
              <button type="button" className={styles.linkBtn} onClick={() => set({ options: [...menuOptions(c), { id: newItemId('opt'), label: '', keywords: '' }] })}><Plus size={13} /> Adicionar opção</button>
            )}
            <small className={styles.note}>O contato pode responder com o número, com o texto da opção ou com uma das palavras.</small>
            <div className={styles.formRow}>
              <Field label="Guardar a escolha como">
                <input className={styles.input} value={c.variable || ''} placeholder="opcao" onChange={(e) => set({ variable: cleanVariableName(e.target.value) })} />
              </Field>
              <Field label="Esperar (horas)">
                <input className={styles.input} type="number" min={1} max={168} value={c.timeoutHours ?? 24} onChange={(e) => set({ timeoutHours: Math.min(168, Math.max(1, Number(e.target.value) || 1)) })} />
              </Field>
            </div>
            <div className={styles.formRow}>
              <Field label="Tentativas">
                <input className={styles.input} type="number" min={1} max={5} value={c.maxAttempts ?? 2} onChange={(e) => set({ maxAttempts: Math.min(5, Math.max(1, Number(e.target.value) || 1)) })} />
              </Field>
            </div>
            <Field label="Mensagem quando a opção for inválida">{tpl('retryMessage', { rows: 2 })}</Field>
            <Check checked={Boolean(c.useButtons)} onChange={(value) => set({ useButtons: value })}>
              Usar botões (até 3 opções) ou lista (até 10) na API oficial do WhatsApp. No WhatsApp Web vai numerado.
            </Check>
            {c.useButtons && menuOptions(c).length > 3 && (
              <Field label="Texto do botão da lista">
                <input className={styles.input} value={c.buttonLabel || ''} maxLength={20} placeholder="Ver opções" onChange={(e) => set({ buttonLabel: e.target.value })} />
              </Field>
            )}
          </>
        )}

        {node.type === 'wait-reply' && (
          <>
            <Field label="Esperar resposta por (horas)" hint='Respondeu: segue por "Respondeu". Passou o prazo: "Sem resposta".'>
              <input className={styles.input} type="number" min={1} max={168} value={c.timeoutHours ?? 24} onChange={(e) => set({ timeoutHours: Math.min(168, Math.max(1, Number(e.target.value) || 1)) })} />
            </Field>
            <Field label="Guardar a resposta como (opcional)">
              <input className={styles.input} value={c.variable || ''} placeholder="resposta" onChange={(e) => set({ variable: cleanVariableName(e.target.value) })} />
            </Field>
          </>
        )}

        {/* ── Lógica ── */}
        {node.type === 'condition' && (
          <>
            <Field label="Seguir por Sim quando">
              <select className={styles.input} value={c.logic || 'all'} onChange={(e) => set({ logic: e.target.value as NodeConfig['logic'] })}>
                <option value="all">Todas as regras valem (E)</option>
                <option value="any">Qualquer regra vale (OU)</option>
              </select>
            </Field>
            {conditionRules(c).map((rule, index, list) => (
              <div key={index} className={styles.ruleCard}>
                <div className={styles.ruleHead}>
                  <span className={styles.sectionLabel}>Regra {index + 1}</span>
                  <button type="button" className={styles.iconBtn} aria-label="Remover regra" disabled={list.length <= 1} onClick={() => set({ rules: list.filter((_, i) => i !== index), conditionField: undefined })}><Trash2 size={13} /></button>
                </div>
                <FieldSelect value={rule.field} graph={graph} onChange={(field) => set({ rules: list.map((item, i) => (i === index ? { ...item, field } : item)) })} />
                <select className={styles.input} value={rule.operator} onChange={(e) => set({ rules: list.map((item, i) => (i === index ? { ...item, operator: e.target.value as ConditionOperator } : item)) })}>
                  {Object.entries(OPERATOR_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                {!NO_VALUE_OPERATORS.includes(rule.operator) && (
                  <TemplateInput value={rule.value || ''} groups={groups} disabled={readOnly} placeholder='Valor (várias opções: "sim, quero")' onChange={(value) => set({ rules: list.map((item, i) => (i === index ? { ...item, value } : item)) })} />
                )}
              </div>
            ))}
            {conditionRules(c).length < 10 && (
              <button type="button" className={styles.linkBtn} onClick={() => set({ rules: [...conditionRules(c), { field: 'message', operator: 'contains', value: '' }] })}><Plus size={13} /> Adicionar regra</button>
            )}
            <small className={styles.note}>Não diferencia maiúsculas nem acentos. &quot;Maior/menor&quot; compara números (R$ 1.500,00 vale) ou horas (hh:mm).</small>
          </>
        )}

        {node.type === 'switch' && (
          <>
            <Field label="Comparar"><FieldSelect value={c.switchField || ''} graph={graph} onChange={(switchField) => set({ switchField })} /></Field>
            <Field label="Regra">
              <select className={styles.input} value={c.switchMode || 'contains'} onChange={(e) => set({ switchMode: e.target.value as NodeConfig['switchMode'] })}>
                <option value="contains">Contém</option>
                <option value="equals">É igual a</option>
              </select>
            </Field>
            <span className={styles.sectionLabel}>Casos (o primeiro que bater é seguido)</span>
            {switchCases(c).map((item, index, list) => (
              <div key={item.id} className={styles.listRow}>
                <span className={styles.rowBadge}>{index + 1}</span>
                <div className={styles.stack}>
                  <input className={styles.input} value={item.label} maxLength={40} placeholder="Nome da saída" onChange={(e) => set({ cases: list.map((row) => (row.id === item.id ? { ...row, label: e.target.value } : row)) })} />
                  <input className={`${styles.input} ${styles.inputSmall}`} value={item.value} placeholder="Valores (separados por vírgula)" onChange={(e) => set({ cases: list.map((row) => (row.id === item.id ? { ...row, value: e.target.value } : row)) })} />
                </div>
                <RowActions index={index} total={list.length} min={1} onMove={(from, to) => set({ cases: moveItem(list, from, to) })} onRemove={() => set({ cases: list.filter((row) => row.id !== item.id) })} />
              </div>
            ))}
            {switchCases(c).length < 12 && (
              <button type="button" className={styles.linkBtn} onClick={() => set({ cases: [...switchCases(c), { id: newItemId('case'), label: '', value: '' }] })}><Plus size={13} /> Adicionar caso</button>
            )}
          </>
        )}

        {node.type === 'business-hours' && (
          <>
            <span className={styles.sectionLabel}>Expediente (horário de Brasília)</span>
            {WEEKDAYS.map((day, index) => {
              const hours = businessHours(c);
              const row = hours.find((item) => item.day === index);
              const update = (changes: { start?: string; end?: string }) => set({ hours: hours.map((item) => (item.day === index ? { ...item, ...changes } : item)) });
              return (
                <div key={day} className={styles.hoursRow}>
                  <label className={styles.check}>
                    <input type="checkbox" checked={Boolean(row)} onChange={(e) => set({ hours: e.target.checked ? [...hours, { day: index, start: '08:00', end: '18:00' }].sort((a, b) => a.day - b.day) : hours.filter((item) => item.day !== index) })} />
                    <span>{day}</span>
                  </label>
                  {row ? (
                    <div className={styles.inline}>
                      <input className={styles.input} type="time" value={row.start} onChange={(e) => update({ start: e.target.value })} aria-label={`Abre ${day}`} />
                      <input className={styles.input} type="time" value={row.end} onChange={(e) => update({ end: e.target.value })} aria-label={`Fecha ${day}`} />
                    </div>
                  ) : (
                    <small className={styles.note}>Fechado</small>
                  )}
                </div>
              );
            })}
          </>
        )}

        {node.type === 'split-ab' && (
          <Field label={`Caminho A: ${c.percentA ?? 50}% · Caminho B: ${100 - (Number(c.percentA) || 50)}%`} hint="Cada contato é sorteado. Compare os resultados em Execuções.">
            <input type="range" min={1} max={99} value={c.percentA ?? 50} onChange={(e) => set({ percentA: Number(e.target.value) })} />
          </Field>
        )}

        {node.type === 'delay' && (
          <>
            <Field label="Como esperar">
              <select className={styles.input} value={c.delayMode || 'duration'} onChange={(e) => set({ delayMode: e.target.value as NodeConfig['delayMode'] })}>
                <option value="duration">Por um tempo</option>
                <option value="until_time">Até um horário</option>
              </select>
            </Field>
            {c.delayMode === 'until_time' ? (
              <>
                <Field label="Até as (horário de Brasília)" hint="Se o horário de hoje já passou, espera até amanhã.">
                  <input className={styles.input} type="time" value={c.untilTime || ''} onChange={(e) => set({ untilTime: e.target.value })} />
                </Field>
                <Check checked={Boolean(c.untilWeekdays)} onChange={(value) => set({ untilWeekdays: value })}>Só em dia útil (pula sábado e domingo)</Check>
              </>
            ) : (
              <Field label="Esperar">
                <DurationInput minutes={Number(c.waitMinutes) || 1} onChange={(waitMinutes) => set({ waitMinutes })} />
              </Field>
            )}
          </>
        )}

        {node.type === 'set-variable' && (
          <>
            <Field label="Nome do valor" hint="Use depois como {{nome}} nas mensagens e condições.">
              <input className={styles.input} value={c.variable || ''} placeholder="contador" onChange={(e) => set({ variable: cleanVariableName(e.target.value) })} />
            </Field>
            <Field label="Operação">
              <select className={styles.input} value={c.operation || 'set'} onChange={(e) => set({ operation: e.target.value as NodeConfig['operation'] })}>
                <option value="set">Definir como</option>
                <option value="append">Juntar texto no fim</option>
                <option value="increment">Somar (número)</option>
                <option value="decrement">Subtrair (número)</option>
                <option value="clear">Limpar</option>
              </select>
            </Field>
            {c.operation !== 'clear' && <Field label={c.operation === 'increment' || c.operation === 'decrement' ? 'Quanto (vazio = 1)' : 'Valor'}>{tpl('value')}</Field>}
          </>
        )}

        {node.type === 'start-flow' && (
          <Field label="Fluxo" hint="O contato entra no outro fluxo levando os valores guardados até aqui. Este fluxo continua.">
            <select className={styles.input} value={c.flowId || ''} onChange={(e) => set({ flowId: e.target.value })}>
              <option value="">Escolha o fluxo</option>
              {options?.flows.filter((flow) => flow.id !== flowId).map((flow) => (
                <option key={flow.id} value={flow.id}>{flow.name}{flow.status !== 'active' ? ' (não está ativo)' : ''}</option>
              ))}
            </select>
          </Field>
        )}

        {node.type === 'end' && (
          <Check checked={Boolean(c.stopOthers)} onChange={(value) => set({ stopOthers: value })}>
            Cancelar também as outras automações que estão esperando por este contato
          </Check>
        )}

        {/* ── CRM e equipe ── */}
        {node.type === 'update-lead' && (
          <>
            <Field label="O que mudar">
              <select className={styles.input} value={c.field || 'stage'} onChange={(e) => set({ field: e.target.value as NodeConfig['field'], fieldValue: '' })}>
                <option value="stage">Etapa do funil</option>
                <option value="assigned_to">Responsável</option>
                <option value="value">Valor</option>
                <option value="name">Nome</option>
                <option value="email">E-mail</option>
                <option value="cpf_cnpj">CPF/CNPJ</option>
                <option value="source">Origem</option>
              </select>
            </Field>
            {c.field === 'stage' || !c.field ? (
              <Field label="Nova etapa">
                <select className={styles.input} value={c.fieldValue || ''} onChange={(e) => set({ fieldValue: e.target.value })}>{stageOptions('Escolha a etapa')}</select>
              </Field>
            ) : c.field === 'assigned_to' ? (
              <Field label="Novo responsável" hint='Para dividir entre várias pessoas, use o bloco "Distribuir lead".'>
                <select className={styles.input} value={c.fieldValue || ''} onChange={(e) => set({ fieldValue: e.target.value })}>
                  <option value="">Escolha a pessoa</option>
                  {options?.team.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
                </select>
              </Field>
            ) : (
              <Field label="Novo valor" hint="Pode usar respostas: {{email}}, {{valor}}...">{tpl('fieldValue')}</Field>
            )}
          </>
        )}

        {node.type === 'tag-lead' && (
          <>
            <Field label="Ação">
              <select className={styles.input} value={c.tagAction || 'add'} onChange={(e) => set({ tagAction: e.target.value as NodeConfig['tagAction'] })}>
                <option value="add">Adicionar etiqueta</option>
                <option value="remove">Tirar etiqueta</option>
              </select>
            </Field>
            <Field label="Etiqueta(s)" hint="Várias separadas por vírgula. Adicionar dispara os fluxos com gatilho &quot;Etiqueta adicionada&quot;.">
              <input className={styles.input} list={`tags-${node.id}`} value={c.tag || ''} placeholder="cliente quente" onChange={(e) => set({ tag: e.target.value })} />
              {tagList}
            </Field>
          </>
        )}

        {node.type === 'assign-lead' && (
          <>
            <Field label="Como escolher">
              <select className={styles.input} value={c.assignMode || 'round_robin'} onChange={(e) => set({ assignMode: e.target.value as NodeConfig['assignMode'] })}>
                <option value="round_robin">Rodízio (um para cada, em ordem)</option>
                <option value="least_busy">Quem tem menos leads</option>
                <option value="specific">Sempre a mesma pessoa (a primeira marcada)</option>
              </select>
            </Field>
            <Field label="Entre quem">
              <MemberPicker value={stringList(c.assignees)} options={options} emptyHint={ROLE_HINT} onChange={(assignees) => set({ assignees })} />
            </Field>
            <Check checked={Boolean(c.onlyIfUnassigned)} onChange={(value) => set({ onlyIfUnassigned: value })}>Só se o lead ainda não tiver responsável</Check>
            <Check checked={c.notifyAssignee !== false} onChange={(value) => set({ notifyAssignee: value })}>Avisar quem recebeu (sino)</Check>
          </>
        )}

        {node.type === 'add-note' && <Field label="Anotação" hint="Vai para as Observações do lead, com data e hora.">{tpl('note', { rows: 4 })}</Field>}

        {node.type === 'create-task' && (
          <>
            <Field label="Título">{tpl('taskTitle', { maxLength: 160 })}</Field>
            <Field label="Descrição (opcional)">{tpl('taskDescription', { rows: 3 })}</Field>
            <Field label="Prazo (a partir de agora)" hint="Aparece na Agenda e avisa no sino na hora do prazo.">
              <DurationInput minutes={Number(c.dueMinutes) || 0} allowZero onChange={(dueMinutes) => set({ dueMinutes })} />
            </Field>
            <div className={styles.formRow}>
              <Field label="Responsável">
                <select className={styles.input} value={c.taskAssignee || 'assigned'} onChange={(e) => set({ taskAssignee: e.target.value })}>
                  <option value="assigned">Responsável pelo lead</option>
                  {options?.team.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
                </select>
              </Field>
              <Field label="Prioridade">
                <select className={styles.input} value={c.priority || 'medium'} onChange={(e) => set({ priority: e.target.value as NodeConfig['priority'] })}>
                  <option value="low">Baixa</option>
                  <option value="medium">Média</option>
                  <option value="high">Alta</option>
                </select>
              </Field>
            </div>
          </>
        )}

        {node.type === 'notify-team' && (
          <>
            <Field label="Quem recebe">
              <select className={styles.input} value={c.target || 'assigned'} onChange={(e) => set({ target: e.target.value as NodeConfig['target'] })}>
                <option value="assigned">Responsável pelo lead (sem responsável: admins e gerentes)</option>
                <option value="admins">Administradores e gerentes</option>
                <option value="everyone">Toda a equipe</option>
                <option value="specific">Pessoas escolhidas</option>
              </select>
            </Field>
            {c.target === 'specific' && <MemberPicker value={stringList(c.targetUsers)} options={options} emptyHint="Marque pelo menos uma pessoa." onChange={(targetUsers) => set({ targetUsers })} />}
            <Field label="Aviso" hint="Aparece no sino de notificações; clicar abre a conversa do lead.">{tpl('message', { rows: 3 })}</Field>
            <Check checked={Boolean(c.alsoWhatsApp)} onChange={(value) => set({ alsoWhatsApp: value })}>
              Mandar também pelo WhatsApp da empresa para o celular de cada pessoa (telefone do perfil em Equipe)
            </Check>
          </>
        )}

        {node.type === 'webhook' && (
          <>
            <div className={styles.formRow}>
              <Field label="Método">
                <select className={styles.input} value={c.method || 'POST'} onChange={(e) => set({ method: e.target.value as NodeConfig['method'] })}>
                  {['POST', 'GET', 'PUT', 'PATCH'].map((method) => <option key={method}>{method}</option>)}
                </select>
              </Field>
            </div>
            <Field label="URL (https)" hint="Pode ter variáveis, ex.: https://api.site.com/clientes/{{lead.cpf_cnpj}}">{tpl('url', { placeholder: 'https://hook.make.com/...' })}</Field>
            <span className={styles.sectionLabel}>Cabeçalhos</span>
            {keyValues(c.headers).map((header, index, list) => (
              <div key={index} className={styles.inline}>
                <input className={styles.input} value={header.key} placeholder="Authorization" onChange={(e) => set({ headers: list.map((item, i) => (i === index ? { ...item, key: e.target.value } : item)) })} />
                <input className={styles.input} value={header.value} placeholder="Bearer ..." onChange={(e) => set({ headers: list.map((item, i) => (i === index ? { ...item, value: e.target.value } : item)) })} />
                <button type="button" className={styles.iconBtn} aria-label="Remover" onClick={() => set({ headers: list.filter((_, i) => i !== index) })}><Trash2 size={13} /></button>
              </div>
            ))}
            {keyValues(c.headers).length < 10 && <button type="button" className={styles.linkBtn} onClick={() => set({ headers: [...keyValues(c.headers), { key: 'X-Chave', value: '' }] })}><Plus size={13} /> Adicionar cabeçalho</button>}
            {c.method !== 'GET' && (
              <>
                <Field label="Corpo">
                  <select className={styles.input} value={c.bodyMode || 'default'} onChange={(e) => set({ bodyMode: e.target.value as NodeConfig['bodyMode'] })}>
                    <option value="default">Padrão (lead, valores e mensagem em JSON)</option>
                    <option value="custom">Personalizado</option>
                  </select>
                </Field>
                {c.bodyMode === 'custom' && <Field label="Corpo personalizado" hint="As variáveis são escapadas para JSON automaticamente.">{tpl('body', { rows: 5, placeholder: '{"nome": "{{lead.name}}", "telefone": "{{lead.phone}}"}' })}</Field>}
              </>
            )}
            <span className={styles.sectionLabel}>Guardar da resposta (JSON)</span>
            {(Array.isArray(c.responseMap) ? c.responseMap : []).map((mapping, index, list) => (
              <div key={index} className={styles.inline}>
                <input className={styles.input} value={mapping.path || ''} placeholder="data.status" onChange={(e) => set({ responseMap: list.map((item, i) => (i === index ? { ...item, path: e.target.value } : item)) })} />
                <input className={styles.input} value={mapping.variable || ''} placeholder="status_pedido" onChange={(e) => set({ responseMap: list.map((item, i) => (i === index ? { ...item, variable: cleanVariableName(e.target.value) } : item)) })} />
                <button type="button" className={styles.iconBtn} aria-label="Remover" onClick={() => set({ responseMap: list.filter((_, i) => i !== index) })}><Trash2 size={13} /></button>
              </div>
            ))}
            {(c.responseMap || []).length < 10 && <button type="button" className={styles.linkBtn} onClick={() => set({ responseMap: [...(c.responseMap || []), { path: '', variable: '' }] })}><Plus size={13} /> Guardar um campo</button>}
            <small className={styles.note}>Caminho como <code>cliente.nome</code> ou <code>itens[0].preco</code>. Resposta 2xx segue por &quot;Sucesso&quot;; erro ou demora acima de 10 s, por &quot;Erro&quot; (se estiver ligada). O código fica em <code>{'{{webhook_status}}'}</code>.</small>
          </>
        )}

        {/* ── IA ── */}
        {node.type === 'ai-chat' && (
          <>
            {options && !options.ai && <div className={styles.banner}>Nenhuma IA configurada no servidor (GEMINI_API_KEY ou AI_PROVIDER=ollama).</div>}
            <Field label="Instruções para a IA" hint="O que a empresa faz, produtos, preços que podem ser ditos, horários, endereço, formas de pagamento e o que a IA não pode prometer.">{tpl('aiInstructions', { rows: 9 })}</Field>
            <div className={styles.formRow}>
              <Field label="Juntar mensagens por (s)" hint="Espera o cliente terminar de digitar e responde tudo de uma vez.">
                <input className={styles.input} type="number" min={1} max={60} value={c.groupSeconds ?? 8} onChange={(e) => set({ groupSeconds: Math.min(60, Math.max(1, Number(e.target.value) || 1)) })} />
              </Field>
              <Field label="Encerrar após (h) sem resposta" hint="Depois disso segue por “Cliente parou de responder”.">
                <input className={styles.input} type="number" min={1} max={168} value={c.timeoutHours ?? 24} onChange={(e) => set({ timeoutHours: Math.min(168, Math.max(1, Number(e.target.value) || 1)) })} />
              </Field>
            </div>
            <div className={styles.formRow}>
              <Field label="Ficar quieta quando a equipe responde (h)" hint="0 = a IA continua respondendo junto.">
                <input className={styles.input} type="number" min={0} max={720} value={c.humanPauseHours ?? 2} onChange={(e) => set({ humanPauseHours: Math.min(720, Math.max(0, Number(e.target.value) || 0)) })} />
              </Field>
              <Field label="Máximo de respostas da IA" hint="Passando disso, chama a equipe.">
                <input className={styles.input} type="number" min={1} max={200} value={c.maxTurns ?? 30} onChange={(e) => set({ maxTurns: Math.min(200, Math.max(1, Number(e.target.value) || 1)) })} />
              </Field>
            </div>
            <Check checked={c.allowHandoff !== false} onChange={(value) => set({ allowHandoff: value })}>Passar para a equipe quando o cliente pedir uma pessoa (ou a IA não souber)</Check>
            {c.allowHandoff !== false && (
              <>
                <Field label="Mensagem ao passar para a equipe">{tpl('handoffMessage', { rows: 2 })}</Field>
                <Field label="IA em silêncio depois disso (h)" hint="Tempo para a equipe assumir. Em Mensagens dá para retomar antes.">
                  <input className={styles.input} type="number" min={0} max={720} value={c.handoffPauseHours ?? 24} onChange={(e) => set({ handoffPauseHours: Math.min(720, Math.max(0, Number(e.target.value) || 0)) })} />
                </Field>
              </>
            )}
            <small className={styles.note}>A conversa fica aberta: cada mensagem do cliente é respondida lendo as últimas 20 da conversa. Mensagens que chegam enquanto a IA pensa entram na próxima resposta. Em Mensagens, o botão &quot;Pausar IA&quot; cala a IA naquela conversa. No gatilho, deixe &quot;Não repetir por&quot; em 0.</small>
          </>
        )}

        {node.type === 'ai-reply' && (
          <>
            {options && !options.ai && <div className={styles.banner}>Nenhuma IA configurada no servidor (GEMINI_API_KEY ou AI_PROVIDER=ollama).</div>}
            <Field label="Instruções para a IA" hint="Diga o que a empresa faz, horários, regras, o que não pode prometer. Quanto mais claro, melhor.">{tpl('aiInstructions', { rows: 6 })}</Field>
            <Field label="Responder a">{tpl('aiInput')}</Field>
            <Check checked={c.aiSend !== false} onChange={(value) => set({ aiSend: value })}>Enviar a resposta para o contato no WhatsApp</Check>
            <Field label="Guardar a resposta como">
              <input className={styles.input} value={c.variable || ''} placeholder="resposta_ia" onChange={(e) => set({ variable: cleanVariableName(e.target.value) })} />
            </Field>
            <small className={styles.note}>A IA lê as últimas 12 mensagens da conversa. Se falhar, segue pela saída &quot;Erro&quot;.</small>
          </>
        )}

        {node.type === 'ai-classify' && (
          <>
            {options && !options.ai && <div className={styles.banner}>Nenhuma IA configurada no servidor (GEMINI_API_KEY ou AI_PROVIDER=ollama).</div>}
            <Field label="Texto a classificar">{tpl('aiInput')}</Field>
            <span className={styles.sectionLabel}>Categorias (cada uma tem a sua saída)</span>
            {aiCategories(c).map((item, index, list) => (
              <div key={item.id} className={styles.listRow}>
                <span className={styles.rowBadge}>{index + 1}</span>
                <div className={styles.stack}>
                  <input className={styles.input} value={item.label} maxLength={40} placeholder="Nome da categoria" onChange={(e) => set({ categories: list.map((row) => (row.id === item.id ? { ...row, label: e.target.value } : row)) })} />
                  <input className={`${styles.input} ${styles.inputSmall}`} value={item.description || ''} placeholder="Quando usar (ajuda a IA)" onChange={(e) => set({ categories: list.map((row) => (row.id === item.id ? { ...row, description: e.target.value } : row)) })} />
                </div>
                <RowActions index={index} total={list.length} min={2} onMove={(from, to) => set({ categories: moveItem(list, from, to) })} onRemove={() => set({ categories: list.filter((row) => row.id !== item.id) })} />
              </div>
            ))}
            {aiCategories(c).length < 10 && (
              <button type="button" className={styles.linkBtn} onClick={() => set({ categories: [...aiCategories(c), { id: newItemId('cat'), label: '', description: '' }] })}><Plus size={13} /> Adicionar categoria</button>
            )}
            <Field label="Guardar a categoria como">
              <input className={styles.input} value={c.variable || ''} placeholder="categoria" onChange={(e) => set({ variable: cleanVariableName(e.target.value) })} />
            </Field>
          </>
        )}
      </fieldset>

      <div className={styles.inspectorSection}>
        <span className={styles.sectionLabel}>Ligações deste bloco</span>
        {connections.length === 0 && <small className={styles.note}>Clique na bolinha da direita de um bloco e depois no bloco de destino para ligar.</small>}
        {connections.map((connection) => {
          const outgoing = connection.fromId === node.id;
          const other = graph.nodes.find((item) => item.id === (outgoing ? connection.toId : connection.fromId));
          const port = outgoing ? portLabel(node, connection.fromPort) : '';
          return (
            <div key={connection.id} className={styles.connectionRow}>
              {outgoing ? <ArrowRight size={13} /> : <ArrowRight size={13} style={{ transform: 'rotate(180deg)' }} />}
              <span>{port ? `${port} → ` : ''}{other?.label || 'Bloco removido'}</span>
              {!readOnly && <button type="button" onClick={() => onRemoveConnection(connection.id)} aria-label="Remover ligação"><X size={13} /></button>}
            </div>
          );
        })}
      </div>

      {!readOnly && (
        <button type="button" className={styles.dangerBtn} onClick={onDelete}><Trash2 size={15} /> Remover bloco</button>
      )}
    </div>
  );
}
