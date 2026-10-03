import { NextResponse } from 'next/server';
import { canManageAllPosts, requirePostAccess } from '@/lib/social/access';
import { claimAndPublishPost } from '@/lib/social/publisher';
import { checkPostReady, formatServerDateTime } from '@/lib/social/readiness';
import { getPost, notifyUser, transitionPostStatus } from '@/services/social.service';

export const runtime = 'nodejs';

/**
 * Aprova um post pendente. Se o horário pedido ainda está no futuro, ele
 * fica agendado; se já passou (ou o autor pediu "publicar agora"), sai na hora.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requirePostAccess(id);
  if ('error' in access) {
    return NextResponse.json({ error: access.error.message }, { status: access.error.status });
  }

  const { post, profile } = access;
  if (!canManageAllPosts(profile)) {
    return NextResponse.json({ error: 'Só administradores e gerentes aprovam posts.' }, { status: 403 });
  }
  if (post.status !== 'pending_approval') {
    return NextResponse.json({ error: 'Este post não está aguardando aprovação.' }, { status: 409 });
  }

  const problem = await checkPostReady(access.tenantId, post);
  if (problem) return NextResponse.json({ error: `Não dá pra aprovar ainda: ${problem}` }, { status: 400 });

  const now = new Date().toISOString();
  const publishNow = !post.scheduled_at || new Date(post.scheduled_at).getTime() <= Date.now();

  const moved = await transitionPostStatus(access.tenantId, id, ['pending_approval'], 'scheduled', {
    approved_by: profile.id,
    approved_at: now,
    rejection_reason: null,
    ...(publishNow ? { scheduled_at: now } : {}),
  });
  if (!moved) {
    return NextResponse.json({ error: 'Outra pessoa já revisou este post. Atualize a página.' }, { status: 409 });
  }

  if (post.created_by !== profile.id) {
    await notifyUser(
      post.created_by,
      'Post aprovado',
      publishNow
        ? `${profile.name} aprovou seu post e ele está sendo publicado.`
        : `${profile.name} aprovou seu post. Ele sai em ${formatServerDateTime(post.scheduled_at!)}.`
    );
  }

  if (publishNow) await claimAndPublishPost(id, ['scheduled']);

  return NextResponse.json({ success: true, data: await getPost(access.tenantId, id) });
}
