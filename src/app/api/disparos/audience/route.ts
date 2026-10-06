import { NextResponse } from 'next/server';
import { requireCampaignUser } from '@/lib/disparos/auth';
import { previewAudience } from '@/services/disparos.service';

export const runtime = 'nodejs';

// POST { stageIds?, tags?, assignedTo?, createdWithinDays? } -- quantos leads do CRM entram.
export async function POST(request: Request) {
  const auth = await requireCampaignUser();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  const body = await request.json().catch(() => ({}));
  return NextResponse.json({ data: await previewAudience(auth.tenantId, { ...body, type: 'crm' }) });
}
