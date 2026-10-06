import { NextResponse } from 'next/server';
import { requireCampaignUser } from '@/lib/disparos/auth';
import { campaignOptions } from '@/services/disparos.service';

export const runtime = 'nodejs';

// GET -- etapas, equipe, etiquetas, automações e canais de WhatsApp para a tela.
export async function GET() {
  const auth = await requireCampaignUser();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  return NextResponse.json({ data: await campaignOptions(auth.tenantId) });
}
