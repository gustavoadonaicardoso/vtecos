/**
 * ============================================================
 * VTEC OS — Variáveis das mensagens agendadas
 * ============================================================
 * Nomes em português ({{primeiro_nome}}, {{protocolo}}...) que viram os
 * dados do lead na hora do envio. Por baixo usa as mesmas variáveis das
 * automações ({{lead.first_name}}, {{lead.protocol}}...), que também
 * funcionam. Valor vazio pode ter um texto reserva: {{primeiro_nome|cliente}}.
 * Serve para o navegador (botões) e para o servidor (envio).
 * ============================================================
 */

import { BUILTIN_VARIABLES, variableValue, type RunContext } from '@/lib/automations/flow';

export interface MessageVariable {
  /** O que vai no texto, sem as chaves. */
  name: string;
  label: string;
  /** Variável das automações por trás (vazio = calculada aqui). */
  target: string;
}

export const MESSAGE_VARIABLES: MessageVariable[] = [
  { name: 'primeiro_nome', label: 'Primeiro nome', target: 'lead.first_name' },
  { name: 'nome', label: 'Nome completo', target: 'lead.name' },
  { name: 'protocolo', label: 'Protocolo / nº de atendimento', target: 'lead.protocol' },
  { name: 'telefone', label: 'Telefone', target: 'lead.phone' },
  { name: 'email', label: 'E-mail', target: 'lead.email' },
  { name: 'cpf_cnpj', label: 'CPF/CNPJ', target: 'lead.cpf_cnpj' },
  { name: 'etapa', label: 'Etapa do funil', target: 'lead.stage' },
  { name: 'valor', label: 'Valor', target: 'lead.value' },
  { name: 'responsavel', label: 'Responsável pelo lead', target: 'lead.assigned_first_name' },
  { name: 'atendente', label: 'Quem agendou', target: '' },
  { name: 'empresa', label: 'Nome da empresa', target: 'empresa' },
  { name: 'saudacao', label: 'Bom dia / Boa tarde / Boa noite', target: 'saudacao' },
  { name: 'data', label: 'Data do envio', target: 'data.hoje' },
  { name: 'hora', label: 'Hora do envio', target: 'hora.agora' },
];

const ALIASES = new Map(MESSAGE_VARIABLES.map((item) => [item.name, item.target]));
/** Também aceitos (respostas rápidas antigas e automações). */
ALIASES.set('sobrenome', 'lead.last_name');
ALIASES.set('atendimento', 'lead.protocol');

const PATTERN = /\{\{\s*([\w.]+)\s*(?:\|([^}]*))?\}\}/g;

export interface MessageExtras {
  /** Primeiro nome de quem agendou ({{atendente}}). */
  agentName?: string;
}

function valueOf(name: string, ctx: RunContext, extras: MessageExtras) {
  const key = name.trim().toLowerCase();
  if (key === 'atendente') return extras.agentName || '';
  const target = ALIASES.get(key);
  return variableValue(target || name.trim(), ctx);
}

/** Troca as variáveis pelos dados do lead. */
export function renderMessageTemplate(text: string, ctx: RunContext, extras: MessageExtras = {}) {
  return (text || '').replace(PATTERN, (_, name: string, fallback?: string) => valueOf(name, ctx, extras) || (fallback ?? '').trim());
}

/** Variáveis que o sistema não conhece (provável erro de digitação). */
export function unknownMessageVariables(text: string): string[] {
  // As das automações valem também, menos as que só existem dentro de um fluxo.
  const automation = BUILTIN_VARIABLES.flatMap((group) => group.items.map((item) => item.name)).filter((name) => !name.startsWith('message') && name !== 'fluxo.nome');
  const known = new Set<string>([...ALIASES.keys(), 'atendente', ...automation]);
  const out = new Set<string>();
  for (const match of (text || '').matchAll(PATTERN)) {
    const name = match[1].trim();
    const lower = name.toLowerCase();
    if (!known.has(lower)) out.add(name);
  }
  return Array.from(out);
}
