import { NextResponse } from 'next/server';
import { requireActiveProfile } from '@/lib/session';
import { editorOptions } from '@/services/automations.service';

export const runtime = 'nodejs';

// GET: etapas do funil, equipe e status do WhatsApp para o editor.
export async function GET() {
  const auth = await requireActiveProfile({ module: 'crm' });
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  return NextResponse.json({ data: await editorOptions(auth.tenantId) });
}
