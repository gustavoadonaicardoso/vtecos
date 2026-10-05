import { NextResponse } from 'next/server';
import { updateLeadInDb, deleteLeadFromDb, moveLeadToStage, fetchLeadOwner, fetchLeadStage, fetchLeadName } from '@/services/leads.service';
import { requireActiveProfile } from '@/lib/session';
import { logAudit } from '@/lib/audit';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { fireAutomation, onStageChanged } from '@/lib/automations/engine';

const FIELD_LABEL: Record<string, string> = {
  name: 'nome', phone: 'telefone', email: 'e-mail', cpfCnpj: 'CPF/CNPJ', value: 'valor', pipelineStage: 'etapa',
  assignedTo: 'responsável', tags: 'etiquetas', notes: 'observações', status: 'bloqueio',
};

/**
 * Antes: qualquer requisição podia editar/apagar qualquer lead, sem
 * checar quem estava pedindo. Agora exige sessão válida e, pra quem
 * não é ADMIN/MANAGER, confere que o lead é mesmo do usuário.
 */
async function authorizeLeadAccess(leadId: string) {
  const auth = await requireActiveProfile({ module: 'crm' });
  if ('error' in auth) return auth;

  if (auth.profile.role === 'ADMIN' || auth.profile.role === 'MANAGER') return auth;

  const ownerId = await fetchLeadOwner(auth.tenantId, leadId);
  if (ownerId !== auth.profile.id) {
    return { error: { message: 'Você não tem permissão para alterar este lead.', status: 403 } };
  }

  return auth;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: leadId } = await params;

    const auth = await authorizeLeadAccess(leadId);
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
    }

    const body = await request.json().catch(() => ({}));
    const { action, ...updates } = body;

    // Vendedor não passa o lead para outra pessoa.
    if (!['ADMIN', 'MANAGER'].includes(auth.profile.role) && 'assignedTo' in updates && updates.assignedTo !== auth.profile.id) {
      return NextResponse.json({ error: 'Só administradores e gerentes trocam o responsável do lead.' }, { status: 403 });
    }

    // Etapa antes da mudança: lead que entra numa etapa dispara as automações dela.
    const nextStage: string | undefined = action === 'move_stage' ? updates.stageId : updates.pipelineStage;
    const previousStage = nextStage ? await fetchLeadStage(auth.tenantId, leadId) : null;
    const notifyStage = () => {
      if (nextStage && nextStage !== previousStage) fireAutomation(onStageChanged, auth.tenantId, leadId, String(nextStage));
    };

    if (action === 'move_stage' && updates.stageId) {
      const result = await moveLeadToStage(auth.tenantId, leadId, updates.stageId);
      if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
      notifyStage();
      return NextResponse.json({ success: true }, { status: 200 });
    }

    const result = await updateLeadInDb(auth.tenantId, leadId, updates);
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
    notifyStage();

    const fields = Object.keys(updates).map((key) => FIELD_LABEL[key]).filter(Boolean);
    if (fields.length > 0 && result.data) {
      logAudit({ id: auth.profile.id, name: auth.profile.name }, 'LEAD_UPDATE', `Lead ${result.data.name}: alterou ${fields.join(', ')}.`, 'lead', leadId, supabaseAdmin, auth.tenantId).catch(() => {});
    }

    return NextResponse.json({ success: true, data: result.data ?? null }, { status: 200 });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erro interno.' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: leadId } = await params;

    const auth = await authorizeLeadAccess(leadId);
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
    }

    const name = await fetchLeadName(auth.tenantId, leadId);
    const result = await deleteLeadFromDb(auth.tenantId, leadId);
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
    logAudit({ id: auth.profile.id, name: auth.profile.name }, 'LEAD_DELETE', `Excluiu o lead ${name || leadId}.`, 'lead', leadId, supabaseAdmin, auth.tenantId).catch(() => {});

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erro interno.' }, { status: 500 });
  }
}
