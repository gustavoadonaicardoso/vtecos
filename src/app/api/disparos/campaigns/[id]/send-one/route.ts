import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: campaignId } = await params;
  const supabase = getSupabase();

  try {
    const { contactId } = await req.json();

    const { data: contact, error: contactError } = await supabase
      .from('blast_contacts')
      .select('*')
      .eq('id', contactId)
      .eq('campaign_id', campaignId)
      .single();

    if (contactError || !contact) {
      return NextResponse.json({ error: 'Contato não encontrado' }, { status: 404 });
    }

    await supabase
      .from('blast_contacts')
      .update({ status: 'sending' })
      .eq('id', contactId);

    const { data: configItem } = await supabase
      .from('integrations_config')
      .select('config')
      .eq('provider', 'zapi')
      .maybeSingle();

    if (!configItem) {
      await supabase
        .from('blast_contacts')
        .update({ status: 'failed', error_msg: 'Z-API não configurada' })
        .eq('id', contactId);
      await incrementFailed(supabase, campaignId);
      return NextResponse.json({ success: false, error: 'Z-API não configurada' });
    }

    const { instanceId, token, clientToken } = configItem.config as any;

    let cleanPhone = (contact.phone ?? '').replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      await supabase
        .from('blast_contacts')
        .update({ status: 'failed', error_msg: 'Telefone inválido' })
        .eq('id', contactId);
      await incrementFailed(supabase, campaignId);
      return NextResponse.json({ success: false, error: 'Telefone inválido' });
    }
    if (!cleanPhone.startsWith('55')) cleanPhone = '55' + cleanPhone;

    const message = contact.rendered_message ?? '';

    const response = await fetch(
      `https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(clientToken ? { 'Client-Token': clientToken } : {}),
        },
        body: JSON.stringify({ phone: cleanPhone, message }),
      }
    );

    if (response.ok) {
      await supabase
        .from('blast_contacts')
        .update({ status: 'sent', sent_at: new Date().toISOString(), error_msg: null })
        .eq('id', contactId);
      await incrementSent(supabase, campaignId);
      return NextResponse.json({ success: true });
    } else {
      const errBody = await response.text();
      await supabase
        .from('blast_contacts')
        .update({ status: 'failed', error_msg: errBody.slice(0, 200) })
        .eq('id', contactId);
      await incrementFailed(supabase, campaignId);
      return NextResponse.json({ success: false, error: errBody });
    }
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

async function incrementSent(supabase: any, campaignId: string) {
  const { data } = await supabase
    .from('blast_campaigns')
    .select('sent_count, total_contacts, failed_count')
    .eq('id', campaignId)
    .single();
  if (!data) return;
  const newSent = (data.sent_count ?? 0) + 1;
  const done = newSent + (data.failed_count ?? 0) >= (data.total_contacts ?? 0);
  await supabase
    .from('blast_campaigns')
    .update({ sent_count: newSent, status: done ? 'completed' : 'running', updated_at: new Date().toISOString() })
    .eq('id', campaignId);
}

async function incrementFailed(supabase: any, campaignId: string) {
  const { data } = await supabase
    .from('blast_campaigns')
    .select('sent_count, total_contacts, failed_count')
    .eq('id', campaignId)
    .single();
  if (!data) return;
  const newFailed = (data.failed_count ?? 0) + 1;
  const done = (data.sent_count ?? 0) + newFailed >= (data.total_contacts ?? 0);
  await supabase
    .from('blast_campaigns')
    .update({ failed_count: newFailed, status: done ? 'completed' : 'running', updated_at: new Date().toISOString() })
    .eq('id', campaignId);
}
