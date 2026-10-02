import { NextResponse } from 'next/server';
import { requirePostAccess } from '@/lib/social/access';
import { claimAndPublishPost } from '@/lib/social/publisher';
import { getPost } from '@/services/social.service';

export const runtime = 'nodejs';

/** Republica só os destinos que falharam; os que já saíram não são tocados. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requirePostAccess(id);
  if ('error' in access) {
    return NextResponse.json({ error: access.error.message }, { status: access.error.status });
  }

  const result = await claimAndPublishPost(id, ['failed', 'partial']);
  if (!result.claimed) {
    return NextResponse.json({ error: 'Só dá pra tentar de novo posts que falharam.' }, { status: 409 });
  }
  return NextResponse.json({ success: true, data: await getPost(id) });
}
