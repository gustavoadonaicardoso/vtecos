import { NextResponse } from 'next/server';
import { requireActiveProfile } from '@/lib/session';
import { logAudit } from '@/lib/audit';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { fetchLeadName, fetchLeadOwner } from '@/services/leads.service';
import { getAccessPassword } from '@/services/lead-fields.service';

/**
 * Senha de acesso do lead ("Mostrar" no painel do lead e respostas
 * rápidas com {{senha_acesso}}). Mesma regra de quem edita o lead:
 * vendedor só vê a dos próprios leads. Cada consulta fica na auditoria.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireActiveProfile({ module: 'crm', permission: ['leads.view', 'pipeline.view', 'messages.view'] });
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  const { id: leadId } = await params;
  const name = await fetchLeadName(auth.tenantId, leadId);
  if (!name) return NextResponse.json({ error: 'Lead não encontrado.' }, { status: 404 });
  if (!['ADMIN', 'MANAGER'].includes(auth.profile.role) && (await fetchLeadOwner(auth.tenantId, leadId)) !== auth.profile.id) {
    return NextResponse.json({ error: 'Você não tem permissão para ver a senha deste lead.' }, { status: 403 });
  }
  const password = await getAccessPassword(auth.tenantId, leadId);
  if (password) {
    logAudit({ id: auth.profile.id, name: auth.profile.name }, 'LEAD_SECRET_VIEW', `Viu a senha de acesso do lead ${name}.`, 'lead', leadId, supabaseAdmin, auth.tenantId).catch(() => {});
  }
  return NextResponse.json({ data: { password } }, { headers: { 'Cache-Control': 'no-store' } });
}
