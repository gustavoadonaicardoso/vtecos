import { NextResponse } from 'next/server';
import { fetchLeadsAndStages, createLead } from '@/services/leads.service';
import { requireActiveProfile } from '@/lib/session';
import { emitIntegrationEvent, leadEventData } from '@/lib/integrations/events';
import { fireAutomation, onLeadCreated } from '@/lib/automations/engine';

/**
 * Antes: userId/role vinham direto de headers enviados pelo próprio
 * navegador (x-user-id/x-user-role) -- qualquer um podia se declarar
 * ADMIN e ver/editar leads de qualquer colega. Agora vem da sessão
 * verificada contra o Supabase Auth.
 */
export async function GET() {
  try {
    const auth = await requireActiveProfile({ module: 'crm' });
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
    }

    const data = await fetchLeadsAndStages(auth.tenantId, { userId: auth.profile.id, role: auth.profile.role });
    if (!data) return NextResponse.json({ error: 'Failed to fetch leads' }, { status: 500 });
    return NextResponse.json({ data }, { status: 200 });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erro interno.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireActiveProfile({ module: 'crm' });
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
    }

    const leadData = await request.json();
    const result = await createLead(auth.tenantId, leadData);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    const lead = result.data!;
    emitIntegrationEvent(auth.tenantId, 'lead.created', leadEventData({
      id: lead.id,
      name: lead.name,
      phone: lead.phone,
      email: lead.email,
      value: parseFloat(String(lead.value || '0').replace(/[^0-9,-]+/g, '').replace(',', '.')) || 0,
      stage_id: lead.pipelineStage,
      created_at: lead.createdAt,
    }, 'manual'));
    fireAutomation(onLeadCreated, auth.tenantId, lead.id, 'manual');

    return NextResponse.json({ data: result.data }, { status: 201 });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erro interno.' }, { status: 500 });
  }
}
