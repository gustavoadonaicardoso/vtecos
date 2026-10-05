import { NextResponse } from 'next/server';
import { requireActiveProfile } from '@/lib/session';
import { loadChatLead, sendMediaToLead } from '@/services/conversations.service';

export const runtime = 'nodejs';

/** Arquivo, imagem ou áudio da equipe para o cliente. */
export async function POST(request: Request) {
  const auth = await requireActiveProfile({ module: 'crm' });
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });

  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  const leadId = form?.get('leadId');
  const caption = form?.get('caption');
  if (!(file instanceof File) || typeof leadId !== 'string') return NextResponse.json({ error: 'Escolha o arquivo.' }, { status: 400 });

  const lead = await loadChatLead(auth.tenantId, leadId, auth.profile);
  if ('error' in lead) return NextResponse.json({ error: lead.error }, { status: lead.status });

  const result = await sendMediaToLead(
    auth.tenantId,
    auth.profile.id,
    lead,
    { buffer: Buffer.from(await file.arrayBuffer()), name: file.name || 'arquivo', mimetype: file.type || 'application/octet-stream' },
    typeof caption === 'string' ? caption.trim().slice(0, 1024) : ''
  );
  if (!result.ok) return NextResponse.json({ error: result.error, data: result.message ?? null }, { status: 502 });
  return NextResponse.json({ data: result.message });
}
