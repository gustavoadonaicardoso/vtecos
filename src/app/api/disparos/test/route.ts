import { NextResponse } from 'next/server';
import { requireCampaignUser } from '@/lib/disparos/auth';
import { sendTest } from '@/services/disparos.service';

export const runtime = 'nodejs';

// POST { phone, sample, template, variants, channel, metaTemplate, media, optoutText, ... }
export async function POST(request: Request) {
  const auth = await requireCampaignUser();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  const result = await sendTest(auth.tenantId, await request.json().catch(() => ({})));
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ data: result });
}
