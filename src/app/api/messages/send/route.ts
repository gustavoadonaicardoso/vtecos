import { NextResponse } from 'next/server';
import { requireActiveProfile } from '@/lib/session';
import { loadChatLead, sendTextToLead } from '@/services/conversations.service';

/** Mensagem de texto da equipe para o cliente (WhatsApp Web ou API oficial). */
export async function POST(request: Request) {
  const auth = await requireActiveProfile({ module: 'crm', permission: 'messages.view' });
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });

  const body = await request.json().catch(() => ({}));
  const leadId = typeof body.leadId === 'string' ? body.leadId : '';
  const text = typeof body.text === 'string' ? body.text.trim().slice(0, 4096) : '';
  const retryId = typeof body.retryId === 'string' ? body.retryId : null;
  if (!leadId || (!text && !retryId)) return NextResponse.json({ error: 'Escreva a mensagem.' }, { status: 400 });

  const lead = await loadChatLead(auth.tenantId, leadId, auth.profile);
  if ('error' in lead) return NextResponse.json({ error: lead.error }, { status: lead.status });

  let messageText = text;
  if (retryId) {
    const { supabaseAdmin } = await import('@/lib/supabase-admin');
    const { data } = await supabaseAdmin.from('chat_messages').select('text').eq('tenant_id', auth.tenantId).eq('id', retryId).maybeSingle();
    messageText = String(data?.text || '');
    if (!messageText) return NextResponse.json({ error: 'Mensagem não encontrada.' }, { status: 404 });
  }

  const result = await sendTextToLead(auth.tenantId, auth.profile.id, lead, messageText, retryId);
  if (!result.ok) return NextResponse.json({ error: result.error, data: result.message ?? null }, { status: 502 });
  return NextResponse.json({ data: result.message });
}
