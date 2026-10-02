import { NextResponse } from 'next/server';
import { requirePostAccess } from '@/lib/social/access';
import { claimAndPublishPost } from '@/lib/social/publisher';
import { validatePostForPublishing } from '@/lib/social/rules';
import { getAccountsWithTokens, getPost, setPostStatus } from '@/services/social.service';
import type { SocialPlatform, SocialPostStatus } from '@/types';

export const runtime = 'nodejs';

/** 'failed' entra porque nenhum destino saiu -- dá pra corrigir e reenviar inteiro. */
const SUBMITTABLE: SocialPostStatus[] = ['draft', 'rejected', 'scheduled', 'failed'];

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requirePostAccess(id);
  if ('error' in access) {
    return NextResponse.json({ error: access.error.message }, { status: access.error.status });
  }

  const { post } = access;
  if (!SUBMITTABLE.includes(post.status)) {
    return NextResponse.json({ error: 'Este post não pode ser enviado no status atual.' }, { status: 409 });
  }

  const body = await request.json().catch(() => ({}));
  const mode = body?.mode === 'now' ? 'now' : 'schedule';

  const accounts = await getAccountsWithTokens(post.targets.map((target) => target.account_id));
  if (accounts.some((account) => account.status === 'disconnected')) {
    return NextResponse.json({ error: 'Uma das contas de destino está desconectada. Reconecte ou remova ela do post.' }, { status: 400 });
  }

  const platforms = [...new Set(accounts.map((account) => account.platform))] as SocialPlatform[];
  const errors = validatePostForPublishing({ caption: post.caption, media: post.media, platforms });
  if (errors.length > 0) return NextResponse.json({ error: errors.join(' ') }, { status: 400 });

  if (mode === 'schedule') {
    if (!post.scheduled_at || new Date(post.scheduled_at).getTime() <= Date.now()) {
      return NextResponse.json({ error: 'Escolha uma data e hora no futuro para agendar.' }, { status: 400 });
    }
    const result = await setPostStatus(id, 'scheduled', { rejection_reason: null });
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
  } else {
    const result = await setPostStatus(id, 'scheduled', {
      scheduled_at: new Date().toISOString(),
      rejection_reason: null,
    });
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
    // Mesmo caminho do agendador: se ele pegar o post no mesmo segundo, a
    // reivindicação garante que só um dos dois publica.
    await claimAndPublishPost(id, ['scheduled']);
  }

  return NextResponse.json({ success: true, data: await getPost(id) });
}
