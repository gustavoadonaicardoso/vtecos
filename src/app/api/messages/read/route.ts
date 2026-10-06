import { NextResponse } from 'next/server';
import { requireActiveProfile } from '@/lib/session';
import { loadChatLead, markLeadRead } from '@/services/conversations.service';

/** Conversa aberta: zera as não lidas do lead. */
export async function POST(request: Request) {
  const auth = await requireActiveProfile({ module: 'crm', permission: 'messages.view' });
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  const body = await request.json().catch(() => ({}));
  const leadId = typeof body.leadId === 'string' ? body.leadId : '';
  const lead = await loadChatLead(auth.tenantId, leadId, auth.profile);
  if ('error' in lead) return NextResponse.json({ error: lead.error }, { status: lead.status });
  await markLeadRead(auth.tenantId, lead.id);
  return NextResponse.json({ success: true });
}
