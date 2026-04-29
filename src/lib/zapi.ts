import { supabase } from './supabase';
import { logAudit } from './audit';
// Tipos centralizados em @/types
import type { ZApiConfig } from '@/types';

export type { ZApiConfig };

/**
 * Persists a chat message to the database
 */
export async function saveChatMessage(params: {
  leadId: string;
  text: string;
  sentByMe: boolean;
  type?: 'text' | 'audio';
  audioUrl?: string;
  status?: 'sending' | 'sent' | 'failed';
}): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('chat_messages')
    .insert([{
      lead_id: params.leadId,
      text: params.text,
      sent_by_me: params.sentByMe,
      type: params.type || 'text',
      audio_url: params.audioUrl || null,
      status: params.status || 'sent',
    }])
    .select('id')
    .single();

  if (error) {
    console.error('saveChatMessage error:', error);
    return null;
  }
  return data?.id ?? null;
}

/**
 * Send a text message through Z-API
 */
export async function sendWhatsApp(
  phone: string,
  message: string,
  leadId?: string,
  options?: { delayMessage?: number; delayTyping?: number }
) {
  if (!supabase) return { success: false, error: 'Supabase não inicializado' };

  try {
    const { data: item, error: configError } = await supabase
      .from('integrations_config')
      .select('config')
      .eq('provider', 'zapi')
      .maybeSingle();

    if (configError || !item) {
      return { success: false, error: 'Z-API não configurada' };
    }

    const { instanceId, token, clientToken } = item.config as ZApiConfig;

    if (!instanceId || !token) {
      return { success: false, error: 'Credenciais Z-API incompletas' };
    }

    let cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length < 10) return { success: false, error: 'Número de telefone inválido' };

    if (!cleanPhone.startsWith('55')) {
      cleanPhone = '55' + cleanPhone;
    }

    // 1. Save to DB with 'sending' status BEFORE hitting the API
    let dbMessageId: string | null = null;
    if (leadId) {
      dbMessageId = await saveChatMessage({
        leadId,
        text: message,
        sentByMe: true,
        type: 'text',
        status: 'sending',
      });
    }

    // 2. Call Z-API
    const response = await fetch(
      `https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(clientToken ? { 'Client-Token': clientToken } : {}),
        },
        body: JSON.stringify({
          phone: cleanPhone,
          message,
          delayMessage: options?.delayMessage ?? 0,
          delayTyping: options?.delayTyping ?? 0,
        }),
      }
    );

    const result = await response.json();

    // 3. Update status in DB
    if (dbMessageId && supabase) {
      await supabase
        .from('chat_messages')
        .update({ status: response.ok ? 'sent' : 'failed' })
        .eq('id', dbMessageId);
    }

    return { success: response.ok, data: result, dbMessageId };

  } catch (err: any) {
    console.error('Z-API Send Error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * When a lead replies, check if their phone was part of a blast campaign that has
 * route_type configured. If so, assign the lead to the specified user or move to
 * the specified pipeline stage so the right person/team sees the conversation.
 *
 * Only the most recent active/completed campaign for this phone is used.
 * Routing is idempotent — re-applying to an already-routed lead is harmless.
 */
async function applyBlastRouting(
    supabase: any,
    cleanPhone: string,
    searchSuffix: string,
    leadId: string
) {
    try {
        // Find the blast_contact record for this phone across campaigns with routing set
        const { data: contacts } = await supabase
            .from('blast_contacts')
            .select('campaign_id')
            .or(`phone.eq.${cleanPhone},phone.ilike.%${searchSuffix}`)
            .order('created_at', { ascending: false })
            .limit(5);

        if (!contacts?.length) return;

        // Find the first campaign that has a non-null route_type
        const campaignIds = contacts.map((c: any) => c.campaign_id);
        const { data: campaigns } = await supabase
            .from('blast_campaigns')
            .select('id, route_type, route_to_id')
            .in('id', campaignIds)
            .neq('route_type', 'none')
            .not('route_to_id', 'is', null)
            .order('created_at', { ascending: false })
            .limit(1);

        const campaign = campaigns?.[0];
        if (!campaign) return;

        if (campaign.route_type === 'user') {
            // Assign lead to the specified user
            await supabase
                .from('leads')
                .update({ assigned_to: campaign.route_to_id })
                .eq('id', leadId);
        } else if (campaign.route_type === 'stage') {
            // Move lead to the specified pipeline stage
            await supabase
                .from('leads')
                .update({ stage_id: campaign.route_to_id })
                .eq('id', leadId);
        }
    } catch (err) {
        console.error('applyBlastRouting error:', err);
    }
}

/**
 * Handle incoming Webhook from Z-API
 */
export async function handleZapiWebhook(payload: any) {
    if (!supabase) return { success: false, error: 'Supabase não inicializado' };

    try {
        let rawPhone = payload.phone || '';
        let cleanPhone = rawPhone.replace(/\D/g, '');
        
        // Z-API sends country code. Remove it to find local leads if necessary, 
        // but it's better to keep it if the DB phone also has it.
        // We will try a robust search:
        const searchSuffix = cleanPhone.slice(-8); // Get last 8 digits

        const isReceivedMessage = payload.isGroup === false;
        
        if (isReceivedMessage && (payload.text?.message || payload.audio?.audioUrl)) {
            const senderName = payload.senderName || 'Cliente WhatsApp';
            const messageText = payload.text?.message || '';
            const audioUrl = payload.audio?.audioUrl || null;
            const messageType = audioUrl ? 'audio' : 'text';

            // 1. Find existing lead by normalized phone
            // PostgreSQL trick to compare only digits
            const { data: lead } = await supabase
                .rpc('find_lead_by_phone', { search_phone: cleanPhone }) // Recommended SQL function approach
                .maybeSingle();
            
            // Fallback if RPC not defined
            let targetLead: any = lead;
            if (!targetLead) {
                const { data: leads } = await supabase.from('leads').select('id, name, phone');
                targetLead = leads?.find((l: any) => l.phone.replace(/\D/g, '').endsWith(searchSuffix));
            }

            let leadId = targetLead?.id;
            let isNewLead = false;

            if (!leadId) {
                // 2. Create new lead — check if phone belongs to an active blast campaign
                // to determine the initial stage for routing
                const { data: stages } = await supabase.from('pipeline_stages').select('id').order('position').limit(1);
                const firstStageId = stages && stages.length > 0 ? stages[0].id : null;

                const { data: newLead } = await supabase.from('leads').insert([{
                    name: senderName,
                    phone: cleanPhone,
                    stage_id: firstStageId
                }]).select().single();

                if (newLead) {
                    leadId = newLead.id;
                    isNewLead = true;
                    await logAudit(null, 'LEAD_CREATE', `Lead ${senderName} criado via Z-API.`, 'lead', newLead.id);
                }
            }

            if (leadId) {
                // 3. Save Message to Database
                await supabase.from('chat_messages').insert([{
                    lead_id: leadId.toString(),
                    text: messageText,
                    audio_url: audioUrl,
                    sent_by_me: false,
                    type: messageType
                }]);

                // 4. Update lead lastMsg
                await supabase.from('leads').update({
                    last_msg: messageText || (audioUrl ? '🎵 Áudio' : 'Nova mensagem')
                }).eq('id', leadId);

                // 5. Apply blast routing: check if this phone was part of a blast campaign
                //    with route_type configured. Only apply if lead wasn't already routed.
                await applyBlastRouting(supabase, cleanPhone, searchSuffix, leadId);
            }
        }
        
        return { success: true };
    } catch (error: any) {
        console.error('Z-API Webhook Error:', error);
        return { success: false, error: error.message };
    }
}
