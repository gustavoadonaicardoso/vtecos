/**
 * Disparos (campanhas de WhatsApp): tipos e regras puras, usados pelas
 * telas e pelo servidor (sem banco e sem React).
 */

import { cleanVariableName, emptyContext, fold, nextTimeOfDay, pickMessage, renderTemplate, zonedParts, zonedTime, type RunContext } from '@/lib/automations/flow';

export type CampaignStatus = 'draft' | 'scheduled' | 'running' | 'paused' | 'completed' | 'canceled';
export type ContactStatus = 'pending' | 'sending' | 'sent' | 'failed' | 'skipped' | 'canceled';
export type Channel = 'web' | 'api';

export interface SendWindow {
  start: string;
  end: string;
  /** 0 = domingo ... 6 = sábado */
  days: number[];
}

export interface ColumnConfig {
  key: string;
  /** Nome da variável na mensagem ({{var}}). */
  var: string;
  isPhone?: boolean;
  isName?: boolean;
}

export interface CrmAudience {
  type: 'crm';
  stageIds?: string[];
  tags?: string[];
  assignedTo?: string[];
  createdWithinDays?: number | null;
}

export interface FileAudience {
  type: 'file';
  fileName?: string;
}

export interface MetaTemplateChoice {
  name: string;
  language: string;
  body: string;
  /** Um texto (com {{variáveis}}) para cada {{1}}, {{2}}... do template. */
  params: string[];
}

export interface CampaignCounts {
  total: number;
  pending: number;
  sent: number;
  failed: number;
  skipped: number;
  replied: number;
  optouts: number;
}

export interface CampaignSummary {
  id: string;
  name: string;
  status: CampaignStatus;
  channel: Channel;
  template: string;
  created_at: string;
  scheduled_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  next_send_at: string | null;
  status_detail: string | null;
  last_error: string | null;
  delay_min: number;
  delay_max: number;
  send_window: SendWindow | null;
  daily_limit: number | null;
  counts: CampaignCounts;
}

export interface CampaignDetail extends CampaignSummary {
  variants: string[];
  meta_template: MetaTemplateChoice | null;
  media_url: string | null;
  media_kind: 'image' | 'document' | 'video' | null;
  media_name: string | null;
  optout_text: string | null;
  audience: CrmAudience | FileAudience | Record<string, never>;
  columns_config: ColumnConfig[];
  create_leads: boolean;
  route_type: 'none' | 'user' | 'stage';
  route_to_id: string | null;
  route_to_label: string | null;
  tag_on_reply: string | null;
  flow_on_reply: string | null;
  sent_today: number;
}

export interface CampaignContact {
  id: string;
  phone: string;
  name: string | null;
  lead_id: string | null;
  status: ContactStatus;
  error_msg: string | null;
  rendered_message: string | null;
  sent_at: string | null;
  replied_at: string | null;
  reply_text: string | null;
}

export const STATUS_LABEL: Record<CampaignStatus, string> = {
  draft: 'Rascunho',
  scheduled: 'Agendada',
  running: 'Enviando',
  paused: 'Pausada',
  completed: 'Concluída',
  canceled: 'Cancelada',
};

export const CONTACT_STATUS_LABEL: Record<ContactStatus, string> = {
  pending: 'Na fila',
  sending: 'Enviando',
  sent: 'Enviada',
  failed: 'Falhou',
  skipped: 'Pulada',
  canceled: 'Cancelada',
};

/** Ritmo de envio (segundos entre uma mensagem e outra, sorteado no intervalo). */
export const SPEEDS = [
  { id: 'safe', label: 'Segura', min: 25, max: 60, hint: 'Recomendada para o WhatsApp Web e números novos (~80 por hora).' },
  { id: 'normal', label: 'Normal', min: 10, max: 25, hint: 'Boa para números já aquecidos (~200 por hora).' },
  { id: 'fast', label: 'Rápida', min: 4, max: 10, hint: 'Só para a API oficial ou listas pequenas (~500 por hora).' },
] as const;

export const DEFAULT_WINDOW: SendWindow = { start: '08:00', end: '20:00', days: [1, 2, 3, 4, 5, 6] };
export const DEFAULT_OPTOUT_TEXT = 'Para não receber mais mensagens, responda SAIR.';

/** Respostas que contam como pedido para sair (a mensagem inteira, sem acento/pontuação). */
const OPTOUT_WORDS = ['sair', 'parar', 'pare', 'stop', 'cancelar', 'descadastrar', 'remover', 'nao quero mais', 'nao quero receber', 'nao envie mais', 'me tira da lista', 'me remova'];

export function isOptOut(text: string) {
  const clean = fold(text).replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
  return OPTOUT_WORDS.includes(clean);
}

/** Telefone para envio: só dígitos, com 55 para números brasileiros. Vazio = inválido. */
export function normalizePhone(raw: string): string {
  let digits = String(raw || '').replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = digits.replace(/^0+/, '');
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  return digits.length >= 12 && digits.length <= 15 ? digits : '';
}

/** Últimos 8 dígitos (acha o mesmo número com ou sem o nono dígito, com ou sem 55). */
export const phoneSuffix = (phone: string) => phone.replace(/\D/g, '').slice(-8);

/** Nome de variável para uma coluna da planilha ("Nome Completo" → nome_completo). */
export const columnVariable = (key: string) => cleanVariableName(key.normalize('NFD').replace(/[̀-ͯ]/g, '')) || 'coluna';

const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

export function validWindow(window: SendWindow | null | undefined): window is SendWindow {
  return Boolean(window && /^\d{2}:\d{2}$/.test(window.start) && /^\d{2}:\d{2}$/.test(window.end) && window.end > window.start && Array.isArray(window.days) && window.days.length > 0);
}

export function insideWindow(window: SendWindow | null | undefined, at: Date) {
  if (!validWindow(window)) return true;
  const now = zonedParts(at);
  const minute = now.hour * 60 + now.minute;
  return window.days.includes(now.weekday) && minute >= minutesOf(window.start) && minute < minutesOf(window.end);
}

/** Próximo instante dentro da janela (ou o próprio `from` se já estiver dentro). */
export function nextWindowStart(window: SendWindow | null | undefined, from: Date): Date {
  if (!validWindow(window) || insideWindow(window, from)) return from;
  const today = zonedParts(from);
  for (let offset = 0; offset < 8; offset += 1) {
    const candidate = zonedTime(today.year, today.month, today.day + offset, Number(window.start.slice(0, 2)), Number(window.start.slice(3, 5)));
    if (candidate.getTime() > from.getTime() && window.days.includes(zonedParts(candidate).weekday)) return candidate;
  }
  return nextTimeOfDay(window.start, false, from);
}

/** Início do dia seguinte dentro da janela (limite diário atingido). */
export function nextDayStart(window: SendWindow | null | undefined, from: Date): Date {
  const p = zonedParts(from);
  const midnight = zonedTime(p.year, p.month, p.day + 1, 0, 0);
  return nextWindowStart(window, midnight);
}

/** Início do dia de hoje (fuso de São Paulo). */
export function startOfTodaySP(at: Date) {
  const p = zonedParts(at);
  return zonedTime(p.year, p.month, p.day, 0, 0);
}

/**
 * Previsão de término: intervalo médio entre mensagens, respeitando a
 * janela de horário e o limite diário (aproximação, para a tela).
 */
export function estimateFinish(pending: number, options: { delayMin: number; delayMax: number; window: SendWindow | null; dailyLimit: number | null; sentToday?: number; from?: Date }): Date | null {
  if (pending <= 0) return null;
  const average = Math.max(1, (options.delayMin + options.delayMax) / 2);
  let at = nextWindowStart(options.window, options.from || new Date());
  let left = pending;
  let sentToday = options.sentToday || 0;
  for (let guard = 0; guard < 400 && left > 0; guard += 1) {
    const dayEnd = (() => {
      if (!validWindow(options.window)) return new Date(startOfTodaySP(at).getTime() + 86400_000);
      const p = zonedParts(at);
      return zonedTime(p.year, p.month, p.day, Number(options.window.end.slice(0, 2)), Number(options.window.end.slice(3, 5)));
    })();
    const byTime = Math.floor((dayEnd.getTime() - at.getTime()) / 1000 / average);
    const byLimit = options.dailyLimit ? Math.max(0, options.dailyLimit - sentToday) : Infinity;
    const today = Math.max(0, Math.min(left, byTime, byLimit));
    if (today >= left) return new Date(at.getTime() + left * average * 1000);
    left -= today;
    sentToday = 0;
    at = nextDayStart(options.window, at);
  }
  return null;
}

export function formatDuration(ms: number) {
  const minutes = Math.max(1, Math.round(ms / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) return rest ? `${hours} h ${rest} min` : `${hours} h`;
  const days = Math.floor(hours / 24);
  return `${days} dia(s) e ${hours % 24} h`;
}

/** {{1}}, {{2}}... de um template da Meta, em ordem. */
export function templateParamCount(body: string) {
  let max = 0;
  for (const match of body.matchAll(/\{\{(\d+)\}\}/g)) max = Math.max(max, Number(match[1]));
  return max;
}

/** Texto do template da Meta com os parâmetros já trocados. */
export function fillTemplateBody(body: string, values: string[]) {
  return body.replace(/\{\{(\d+)\}\}/g, (_, n: string) => values[Number(n) - 1] ?? '');
}

// ── Mensagem de cada contato ────────────────────────────────

export interface RenderInput {
  template: string;
  variants: string[];
  optoutText: string | null;
  channel: Channel;
  metaTemplate: MetaTemplateChoice | null;
}

/** Variáveis da linha da planilha: nome original (se der) e nome limpo. */
export function rowVariables(data: Record<string, unknown>) {
  const vars: Record<string, string> = {};
  for (const [key, value] of Object.entries(data || {})) {
    const valueText = value === null || value === undefined ? '' : String(value).slice(0, 1000);
    vars[columnVariable(key)] = valueText;
    if (/^[\w.]+$/.test(key)) vars[key] = valueText;
  }
  return vars;
}

export function contextFor(contact: { name?: string | null; phone: string; data?: Record<string, unknown> }, lead: Record<string, any> | null, company: RunContext['company']): RunContext { // eslint-disable-line @typescript-eslint/no-explicit-any
  const base = emptyContext().lead;
  return emptyContext({
    lead: lead
      ? { ...base, id: String(lead.id), name: String(lead.name || contact.name || ''), phone: String(lead.phone || contact.phone), email: String(lead.email || ''), cpf_cnpj: String(lead.cpf_cnpj || ''), tags: Array.isArray(lead.tags) ? lead.tags : [], value: Number(lead.value) || 0, source: String(lead.source || ''), created_at: String(lead.created_at || '') }
      : { ...base, name: String(contact.name || ''), phone: contact.phone },
    company,
    vars: rowVariables(contact.data || {}),
  });
}

/** Texto (WhatsApp Web) ou parâmetros do template (API oficial) para um contato. */
export function renderForContact(input: RenderInput, ctx: RunContext) {
  if (input.channel === 'api' && input.metaTemplate) {
    const params = input.metaTemplate.params.map((param) => renderTemplate(param, ctx).trim().slice(0, 1000));
    return { text: fillTemplateBody(input.metaTemplate.body, params), params };
  }
  const body = renderTemplate(pickMessage({ message: input.template, variants: input.variants }), ctx).trim();
  return { text: input.optoutText ? `${body}\n\n${input.optoutText}`.trim() : body, params: [] as string[] };
}
