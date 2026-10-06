import { NextResponse } from 'next/server';
import { requireCampaignUser } from '@/lib/disparos/auth';
import { campaignAction, type CampaignAction } from '@/services/disparos.service';

export const runtime = 'nodejs';

const ACTIONS: CampaignAction[] = ['start', 'resume', 'pause', 'cancel', 'retry_failed', 'schedule', 'duplicate'];

// POST { action, scheduledAt? }
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireCampaignUser();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  if (!ACTIONS.includes(body.action)) return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
  const result = await campaignAction(auth.tenantId, auth.profile, id, body.action, { scheduledAt: body.scheduledAt });
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ data: result });
}
