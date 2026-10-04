import { NextResponse } from 'next/server';
import { updateLeadInDb, deleteLeadFromDb, moveLeadToStage, fetchLeadOwner, fetchLeadStage } from '@/services/leads.service';
import { requireActiveProfile } from '@/lib/session';
import { fireAutomation, onStageChanged } from '@/lib/automations/engine';

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

    const body = await request.json();
    const { action, ...updates } = body;

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

    return NextResponse.json({ success: true }, { status: 200 });
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

    const result = await deleteLeadFromDb(auth.tenantId, leadId);
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erro interno.' }, { status: 500 });
  }
}
