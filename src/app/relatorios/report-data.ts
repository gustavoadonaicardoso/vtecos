/**
 * Leads no navegador: etapa de ganho, valor e exportação em CSV.
 * Os números dos relatórios vêm do servidor (src/services/reports.service.ts).
 */

import { parseLeadValue } from '@/lib/goals';
import type { Lead, PipelineStage } from '@/types';

export const WON_STAGE = 'ganho';

export const isWon = (lead: Lead) => lead.pipelineStage === WON_STAGE;
export const leadValue = (lead: Lead) => parseLeadValue(lead.value);

export function toCsv(leads: Lead[], stages: PipelineStage[], ownerName: (id: string | null) => string) {
  const stageName = (id: string) => stages.find((stage) => stage.id === id)?.name || id;
  const escape = (value: string | number) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const header = ['Nome', 'E-mail', 'Telefone', 'Etapa', 'Origem', 'Valor', 'Responsável', 'Entrada'];
  const rows = leads.map((lead) => [
    lead.name,
    lead.email,
    lead.phone,
    stageName(lead.pipelineStage),
    lead.source || '',
    leadValue(lead).toFixed(2).replace('.', ','),
    ownerName(lead.assignedTo || null),
    lead.entryDate,
  ]);
  // BOM para o Excel abrir os acentos corretamente; ";" é o separador do Excel em pt-BR.
  return '﻿' + [header, ...rows].map((row) => row.map(escape).join(';')).join('\n');
}
