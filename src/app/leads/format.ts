import type { Lead } from '@/types';
import { EXTRA_FIELDS, brDate } from '@/lib/lead-fields';

export function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return `${parts[0]?.[0] || '?'}${parts.length > 1 ? parts[parts.length - 1][0] : ''}`.toUpperCase();
}

/** 1234.5 -> "1.234,50" (campo de valor). */
export const moneyInput = (value: number) => (value ? value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '');

/** "1.234,50" ou "1234.5" -> 1234.5 */
export function parseMoneyInput(text: string) {
  const clean = text.trim();
  if (!clean) return 0;
  const normalized = clean.includes(',') || /^\d{1,3}(\.\d{3})+$/.test(clean) ? clean.replace(/\./g, '').replace(',', '.') : clean;
  const value = Number.parseFloat(normalized);
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
}

export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export const digits = (value: string) => value.replace(/\D/g, '');

/** Exporta os leads filtrados em CSV (abre no Excel com acentos). */
export function exportCsv(leads: Lead[], stageName: (id: string) => string, ownerName: (id?: string | null) => string) {
  // Campos extras e personalizados entram como colunas (a senha de acesso nunca é exportada).
  const customKeys = Array.from(new Set(leads.flatMap((lead) => Object.keys(lead.customFields || {}))));
  const header = ['Nome', 'Telefone', 'E-mail', 'CPF/CNPJ', 'Etapa', 'Responsável', 'Etiquetas', 'Origem', 'Valor', 'Entrada', 'Situação', 'Observações', ...EXTRA_FIELDS.map((field) => field.label), ...customKeys];
  const rows = leads.map((lead) => [
    lead.name,
    lead.phone,
    lead.email,
    lead.cpfCnpj,
    stageName(lead.pipelineStage),
    ownerName(lead.assignedTo),
    lead.tags.join(', '),
    lead.source || '',
    (lead.valueNumber ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
    lead.entryDate,
    lead.status,
    (lead.notes || '').replace(/\s+/g, ' '),
    ...EXTRA_FIELDS.map((field) => (field.key === 'birthDate' && lead.extra?.birthDate ? brDate(lead.extra.birthDate) : lead.extra?.[field.key] || '')),
    ...customKeys.map((key) => lead.customFields?.[key] || ''),
  ]);
  const escape = (value: string) => (/[";\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  const csv = '﻿' + [header, ...rows].map((row) => row.map((cell) => escape(String(cell ?? ''))).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
