/**
 * Status do sistema: tipos e catálogo compartilhados entre o servidor,
 * a faixa do topo e o Painel Master > Status.
 */

export type NoticeKind = 'incident' | 'maintenance' | 'info';
export type NoticeAudience = 'all' | 'tenants';
/** Situação calculada: programado (ainda não começou), ativo, encerrado. */
export type NoticePhase = 'scheduled' | 'active' | 'resolved';
export type HealthStatus = 'ok' | 'down' | 'off' | 'unknown';

export interface NoticeUpdate {
  at: string;
  message: string;
  by?: string | null;
}

/** O que o Painel Master edita e lista. */
export interface SystemNotice {
  id: string;
  kind: NoticeKind;
  title: string;
  message: string;
  services: string[];
  audience: NoticeAudience;
  targetTenants: string[];
  startsAt: string;
  endsAt: string | null;
  resolvedAt: string | null;
  updates: NoticeUpdate[];
  healthService: string | null;
  phase: NoticePhase;
  createdAt: string;
  updatedAt: string;
}

/** O que a faixa do topo recebe (já filtrado para quem está logado). */
export interface VisibleNotice {
  id: string;
  kind: NoticeKind;
  title: string;
  message: string;
  services: string[];
  phase: NoticePhase;
  startsAt: string;
  endsAt: string | null;
  resolvedAt: string | null;
  lastUpdate: NoticeUpdate | null;
  /** Muda a cada atualização: o "fechar" vale só até a próxima novidade. */
  version: string;
}

export interface ServiceHealth {
  service: string;
  status: HealthStatus;
  message: string | null;
  latencyMs: number | null;
  since: string;
  checkedAt: string;
}

/** Partes do sistema que um aviso pode citar (e que a verificação acompanha). */
export const STATUS_SERVICES: { key: string; label: string }[] = [
  { key: 'sistema', label: 'Acesso ao sistema' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'ia', label: 'Inteligência artificial' },
  { key: 'automacoes', label: 'Automações' },
  { key: 'disparos', label: 'Disparos' },
  { key: 'agendamento', label: 'Agendamento' },
  { key: 'redes', label: 'Redes Sociais' },
  { key: 'discador', label: 'Discador' },
  { key: 'integracoes', label: 'Integrações' },
];

export const serviceLabel = (key: string) => STATUS_SERVICES.find((item) => item.key === key)?.label || key;

export const KIND_LABEL: Record<NoticeKind, string> = {
  incident: 'Instabilidade',
  maintenance: 'Manutenção programada',
  info: 'Informativo',
};

/** Manutenção aparece na faixa a partir de quantas horas antes. */
export const MAINTENANCE_HEADS_UP_HOURS = 72;
/** Aviso encerrado continua na faixa (em verde) por este tempo. */
export const RESOLVED_VISIBLE_HOURS = 2;

/** O que a verificação automática acompanha e quais partes do sistema cada item afeta. */
export const HEALTH_CHECKS: { key: string; label: string; services: string[] }[] = [
  { key: 'banco', label: 'Banco de dados', services: ['sistema'] },
  { key: 'ia', label: 'IA padrão da Vórtice', services: ['ia'] },
  { key: 'meta', label: 'API da Meta', services: ['whatsapp', 'redes'] },
  { key: 'automacoes', label: 'Agendador das Automações', services: ['automacoes'] },
  { key: 'disparos', label: 'Envio dos Disparos', services: ['disparos'] },
  { key: 'agendamento', label: 'Envios do Agendamento', services: ['agendamento'] },
  { key: 'redes', label: 'Publicação das Redes Sociais', services: ['redes'] },
];

export const healthLabel = (key: string) => HEALTH_CHECKS.find((item) => item.key === key)?.label || key;
