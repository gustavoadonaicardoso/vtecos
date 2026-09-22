/**
 * ============================================================
 * VÓRTICE CRM — Disparos (Blast Campaigns) Service
 * ============================================================
 * Responsável por todas as operações de banco relacionadas a
 * campanhas de disparo em massa (blast_campaigns/blast_contacts).
 * As rotas em src/app/api/disparos/campaigns/** delegam para cá.
 * ============================================================
 */

import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { sendWhatsAppWebMessage } from '@/lib/whatsapp-web';
import type { ServiceResult } from '@/types';

function renderMessage(template: string, data: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => data[key] ?? '');
}

export async function fetchCampaigns() {
  const { data, error } = await supabase
    .from('blast_campaigns')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return { success: false as const, error: error.message };
  return { success: true as const, data };
}

export async function fetchCampaignWithContacts(campaignId: string) {
  const { data: campaign, error } = await supabase
    .from('blast_campaigns')
    .select('*')
    .eq('id', campaignId)
    .single();

  if (error) return { success: false as const, error: error.message };

  const { data: contacts } = await supabase
    .from('blast_contacts')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: true });

  return { success: true as const, data: { campaign, contacts: contacts ?? [] } };
}

export async function createCampaign(body: {
  name: string;
  template: string;
  columnsConfig: Array<{ key: string; isPhone?: boolean }>;
  delayMin?: number;
  delayMax?: number;
  contacts: Record<string, string>[];
  routeType?: string;
  routeToId?: string | null;
  routeToLabel?: string | null;
}): Promise<ServiceResult<{ id: string }>> {
  const { name, template, columnsConfig, delayMin, delayMax, contacts, routeType, routeToId, routeToLabel } = body;

  if (!name || !template || !contacts?.length) {
    return { success: false, error: 'Dados incompletos' };
  }

  const phoneColumn = columnsConfig.find((c) => c.isPhone)?.key;
  if (!phoneColumn) {
    return { success: false, error: 'Nenhuma coluna marcada como telefone' };
  }

  const { data: campaign, error: campaignError } = await supabase
    .from('blast_campaigns')
    .insert([{
      name,
      template,
      columns_config: columnsConfig,
      delay_min: delayMin ?? 3,
      delay_max: delayMax ?? 8,
      status: 'draft',
      total_contacts: contacts.length,
      route_type: routeType ?? 'none',
      route_to_id: routeToId ?? null,
      route_to_label: routeToLabel ?? null,
    }])
    .select()
    .single();

  if (campaignError || !campaign) {
    return { success: false, error: campaignError?.message ?? 'Erro ao criar campanha' };
  }

  const contactRows = contacts.map((row) => {
    const phone = row[phoneColumn] ?? '';
    const rendered = renderMessage(template, row);
    return {
      campaign_id: campaign.id,
      phone,
      data: row,
      rendered_message: rendered,
      status: 'pending',
    };
  });

  const BATCH = 500;
  for (let i = 0; i < contactRows.length; i += BATCH) {
    const { error: insertError } = await supabase
      .from('blast_contacts')
      .insert(contactRows.slice(i, i + BATCH));

    if (insertError) {
      await supabase.from('blast_campaigns').delete().eq('id', campaign.id);
      return { success: false, error: insertError.message };
    }
  }

  return { success: true, data: campaign };
}

export async function updateCampaign(campaignId: string, updates: Record<string, unknown>): Promise<ServiceResult> {
  const { error } = await supabase
    .from('blast_campaigns')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', campaignId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function deleteCampaign(campaignId: string): Promise<ServiceResult> {
  const { error } = await supabase.from('blast_campaigns').delete().eq('id', campaignId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

async function incrementCampaignCount(campaignId: string, field: 'sent_count' | 'failed_count') {
  const { data } = await supabase
    .from('blast_campaigns')
    .select('sent_count, total_contacts, failed_count')
    .eq('id', campaignId)
    .single();

  if (!data) return;

  const newValue = (data[field] ?? 0) + 1;
  const otherField = field === 'sent_count' ? (data.failed_count ?? 0) : (data.sent_count ?? 0);
  const done = newValue + otherField >= (data.total_contacts ?? 0);

  await supabase
    .from('blast_campaigns')
    .update({ [field]: newValue, status: done ? 'completed' : 'running', updated_at: new Date().toISOString() })
    .eq('id', campaignId);
}

/**
 * Envia a mensagem de um contato específico da campanha pelo WhatsApp
 * Web e atualiza os contadores da campanha conforme o resultado.
 */
export async function sendCampaignContact(campaignId: string, contactId: string): Promise<ServiceResult> {
  const { data: contact, error: contactError } = await supabase
    .from('blast_contacts')
    .select('*')
    .eq('id', contactId)
    .eq('campaign_id', campaignId)
    .single();

  if (contactError || !contact) {
    return { success: false, error: 'Contato não encontrado' };
  }

  await supabase.from('blast_contacts').update({ status: 'sending' }).eq('id', contactId);

  let cleanPhone = (contact.phone ?? '').replace(/\D/g, '');
  if (cleanPhone.length < 10) {
    await supabase
      .from('blast_contacts')
      .update({ status: 'failed', error_msg: 'Telefone inválido' })
      .eq('id', contactId);
    await incrementCampaignCount(campaignId, 'failed_count');
    return { success: false, error: 'Telefone inválido' };
  }
  if (!cleanPhone.startsWith('55')) cleanPhone = '55' + cleanPhone;

  const message = contact.rendered_message ?? '';

  try {
    await sendWhatsAppWebMessage(cleanPhone, message);
    await supabase
      .from('blast_contacts')
      .update({ status: 'sent', sent_at: new Date().toISOString(), error_msg: null })
      .eq('id', contactId);
    await incrementCampaignCount(campaignId, 'sent_count');
    return { success: true };
  } catch (sendError) {
    const errorMessage = sendError instanceof Error ? sendError.message : 'Falha no envio pelo WhatsApp Web';
    await supabase
      .from('blast_contacts')
      .update({ status: 'failed', error_msg: errorMessage.slice(0, 200) })
      .eq('id', contactId);
    await incrementCampaignCount(campaignId, 'failed_count');
    return { success: false, error: errorMessage };
  }
}
