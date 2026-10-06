import { NextResponse } from 'next/server';
import { fetchLeadsAndStages, createLead, findLeadByPhone, parseMoney } from '@/services/leads.service';
import { requireActiveProfile } from '@/lib/session';
import { logAudit } from '@/lib/audit';
import { supabaseAdmin } from '@/lib/supabase-admin';
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
    // permission: open (Início, Metas, Relatórios e Agenda também usam a lista; vendedor já só recebe os próprios leads)
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
    const auth = await requireActiveProfile({ module: 'crm', permission: ['leads.view', 'leads.create', 'pipeline.view'] });
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
    }

    const body = await request.json().catch(() => ({}));
    // Vendedor só cadastra leads para si mesmo.
    const isSeller = !['ADMIN', 'MANAGER'].includes(auth.profile.role);
    const input = { ...body, assignedTo: isSeller ? auth.profile.id : body.assignedTo };

    // Mesmo telefone já cadastrado: avisa (a pessoa pode cadastrar mesmo assim).
    if (!body.force && typeof body.phone === 'string') {
      const existing = await findLeadByPhone(auth.tenantId, body.phone);
      if (existing) {
        const visible = !isSeller || existing.assigned_to === auth.profile.id;
        return NextResponse.json(
          { error: `Já existe um lead com este telefone${visible ? `: ${existing.name}` : ' (de outro vendedor)'}.`, duplicate: visible ? { id: existing.id, name: existing.name } : { id: null, name: null } },
          { status: 409 }
        );
      }
    }

    const result = await createLead(auth.tenantId, input);
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    const lead = result.data!;
    emitIntegrationEvent(auth.tenantId, 'lead.created', leadEventData({
      id: lead.id,
      name: lead.name,
      phone: lead.phone,
      email: lead.email,
      value: lead.valueNumber ?? parseMoney(lead.value),
      stage_id: lead.pipelineStage,
      created_at: lead.createdAt,
    }, 'manual'));
    fireAutomation(onLeadCreated, auth.tenantId, lead.id, 'manual');
    logAudit({ id: auth.profile.id, name: auth.profile.name }, 'LEAD_CREATE', `Lead ${lead.name} cadastrado manualmente.`, 'lead', lead.id, supabaseAdmin, auth.tenantId).catch(() => {});

    return NextResponse.json({ data: lead }, { status: 201 });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erro interno.' }, { status: 500 });
  }
}
