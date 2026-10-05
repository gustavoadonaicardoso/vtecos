import { NextResponse } from 'next/server';
import { requireActiveProfile } from '@/lib/session';
import { logAudit } from '@/lib/audit';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { bulkUpdateLeads, type BulkAction } from '@/services/leads.service';
import { fireAutomation, onStageChanged } from '@/lib/automations/engine';

const ACTIONS = new Set<BulkAction>(['assign', 'stage', 'addTag', 'removeTag', 'block', 'unblock', 'delete']);
const LABEL: Record<BulkAction, string> = {
  assign: 'trocou o responsável de', stage: 'mudou a etapa de', addTag: 'pôs etiqueta em', removeTag: 'tirou etiqueta de',
  block: 'bloqueou', unblock: 'desbloqueou', delete: 'excluiu',
};

/** Ações em vários leads de uma vez (seleção na tela de Leads). */
export async function POST(request: Request) {
  const auth = await requireActiveProfile({ module: 'crm' });
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });

  const body = await request.json().catch(() => ({}));
  const action = body.action as BulkAction;
  const ids = Array.isArray(body.ids) ? body.ids.filter((id: unknown): id is string => typeof id === 'string').slice(0, 1000) : [];
  const value = typeof body.value === 'string' ? body.value : null;
  if (!ACTIONS.has(action) || ids.length === 0) return NextResponse.json({ error: 'Selecione os leads e a ação.' }, { status: 400 });
  if ((action === 'stage' && !value)) return NextResponse.json({ error: 'Escolha a etapa.' }, { status: 400 });

  const isManager = ['ADMIN', 'MANAGER'].includes(auth.profile.role);
  if (action === 'assign' && !isManager) {
    return NextResponse.json({ error: 'Só administradores e gerentes trocam o responsável.' }, { status: 403 });
  }

  const result = await bulkUpdateLeads(auth.tenantId, ids, action, value, isManager ? null : auth.profile.id);
  if (!result.success || !result.data) return NextResponse.json({ error: result.error }, { status: 400 });

  if (action === 'stage' && value) {
    for (const id of result.data.ids) fireAutomation(onStageChanged, auth.tenantId, id, value);
  }
  logAudit(
    { id: auth.profile.id, name: auth.profile.name },
    action === 'delete' ? 'LEAD_DELETE' : 'LEAD_UPDATE',
    `Em massa: ${LABEL[action]} ${result.data.count} lead(s)${value && action !== 'assign' ? ` (${value})` : ''}.`,
    'lead',
    undefined,
    supabaseAdmin,
    auth.tenantId
  ).catch(() => {});

  return NextResponse.json({ data: { count: result.data.count } });
}
