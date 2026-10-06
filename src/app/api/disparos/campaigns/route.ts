import { NextResponse } from 'next/server';
import { requireCampaignUser } from '@/lib/disparos/auth';
import { createCampaign, listCampaigns } from '@/services/disparos.service';

export const runtime = 'nodejs';

export async function GET() {
  const auth = await requireCampaignUser();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  const result = await listCampaigns(auth.tenantId);
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ data: result });
}

// POST { name, action: draft|start|schedule, audience, template, ... }
export async function POST(request: Request) {
  const auth = await requireCampaignUser();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  const body = await request.json().catch(() => ({}));
  const result = await createCampaign(auth.tenantId, auth.profile, body);
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ data: result });
}
