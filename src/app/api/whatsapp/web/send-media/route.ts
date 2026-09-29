import { NextResponse } from 'next/server';
import { sendWhatsAppWebMedia } from '@/lib/whatsapp-web';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireActiveProfile } from '@/lib/session';

export const runtime = 'nodejs';

function detectKind(mimetype: string): 'image' | 'audio' | 'document' {
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.startsWith('audio/')) return 'audio';
  return 'document';
}

export async function POST(request: Request) {
  const auth = await requireActiveProfile();
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  }

  let messageId: string | null = null;

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const phone = formData.get('phone');
    const leadId = formData.get('leadId');
    const caption = formData.get('caption');

    if (!(file instanceof File) || typeof phone !== 'string' || typeof leadId !== 'string') {
      return NextResponse.json({ error: 'Campos obrigatórios: file, phone, leadId.' }, { status: 400 });
    }

    const kind = detectKind(file.type || 'application/octet-stream');
    const buffer = Buffer.from(await file.arrayBuffer());
    const captionText = typeof caption === 'string' ? caption : '';

    const safeName = (file.name || 'arquivo').replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${leadId}/${Date.now()}-${safeName}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from('chat-media')
      .upload(storagePath, buffer, { contentType: file.type || undefined, upsert: false });

    if (uploadError) {
      return NextResponse.json({ error: `Falha ao enviar arquivo: ${uploadError.message}` }, { status: 500 });
    }

    const { data: publicUrlData } = supabaseAdmin.storage.from('chat-media').getPublicUrl(storagePath);
    const mediaUrl = publicUrlData.publicUrl;

    const { data: messageRow, error: insertError } = await supabaseAdmin
      .from('chat_messages')
      .insert([{
        lead_id: leadId,
        text: captionText,
        sent_by_me: true,
        type: kind,
        audio_url: mediaUrl,
        status: 'sending',
      }])
      .select('id')
      .single();

    if (insertError || !messageRow) {
      return NextResponse.json({ error: insertError?.message || 'Falha ao registrar mensagem.' }, { status: 500 });
    }
    messageId = messageRow.id;

    await sendWhatsAppWebMedia(phone, buffer, kind, {
      caption: captionText || undefined,
      fileName: file.name,
      mimetype: file.type || 'application/octet-stream',
    });

    await supabaseAdmin.from('chat_messages').update({ status: 'sent' }).eq('id', messageId);

    return NextResponse.json({ success: true, data: { id: messageId, mediaUrl } }, { status: 200 });
  } catch (error) {
    if (messageId) {
      await supabaseAdmin.from('chat_messages').update({ status: 'failed' }).eq('id', messageId);
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Falha no envio do anexo.' },
      { status: 503 }
    );
  }
}
