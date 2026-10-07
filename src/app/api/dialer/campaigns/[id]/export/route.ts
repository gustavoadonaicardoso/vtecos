import { NextResponse } from 'next/server';
import { requireActiveProfile } from '@/lib/session';
import { exportCampaign, isDialerManager } from '@/services/dialer.service';
import { CONTACT_STATUS_LABEL, outcomeLabel } from '@/lib/dialer/types';

type Context = { params: Promise<{ id: string }> };

const cell = (value: unknown) => {
  const text = String(value ?? '');
  // Evita fórmula ao abrir no Excel (=, +, -, @).
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[";\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** Resultado da campanha em CSV (abre no Excel). */
export async function GET(_request: Request, { params }: Context) {
  const auth = await requireActiveProfile({ module: 'crm', permission: 'leads.view' });
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  if (!isDialerManager(auth.profile.role)) return NextResponse.json({ error: 'Só administradores e gerentes exportam campanhas.' }, { status: 403 });
  const { id } = await params;
  const contacts = await exportCampaign(auth.tenantId, id);
  if ('error' in contacts) return NextResponse.json({ error: contacts.error }, { status: 404 });

  const extra = [...new Set(contacts.flatMap((contact) => Object.keys(contact.data)))];
  const header = ['Nome', 'Telefone', 'Situação', 'Resultado', 'Anotação', 'Atendente', 'Tentativas', 'Conversa (s)', 'Ligado em', ...extra];
  const lines = contacts.map((contact) => [
    contact.name, contact.phone, CONTACT_STATUS_LABEL[contact.status], outcomeLabel(contact.outcome), contact.notes, contact.agentName,
    contact.attempts, contact.talkSeconds ?? '', contact.dialedAt ? new Date(contact.dialedAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '',
    ...extra.map((key) => contact.data[key] || ''),
  ].map(cell).join(';'));
  const csv = `﻿${[header.map(cell).join(';'), ...lines].join('\r\n')}`;
  return new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="discador-${id.slice(0, 8)}.csv"` } });
}
