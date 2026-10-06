import { NextResponse } from 'next/server';
import { requireCampaignUser } from '@/lib/disparos/auth';
import { uploadAutomationMedia } from '@/services/automations.service';

export const runtime = 'nodejs';

// POST multipart { file } -- anexo da campanha (mesmo bucket público das automações).
export async function POST(request: Request) {
  const auth = await requireCampaignUser();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'Escolha um arquivo.' }, { status: 400 });
  const result = await uploadAutomationMedia(auth.tenantId, { buffer: Buffer.from(await file.arrayBuffer()), type: file.type, size: file.size, name: file.name });
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 });
  if (result.kind === 'audio') return NextResponse.json({ error: 'Campanhas aceitam imagem, vídeo ou documento.' }, { status: 400 });
  return NextResponse.json({ data: result });
}
