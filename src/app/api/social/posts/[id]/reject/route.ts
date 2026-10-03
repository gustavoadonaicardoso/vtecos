import { NextResponse } from 'next/server';
import { canManageAllPosts, requirePostAccess } from '@/lib/social/access';
import { getPost, notifyUser, transitionPostStatus } from '@/services/social.service';

/** Reprova um post pendente. O motivo é obrigatório: é o que o autor vê pra corrigir. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requirePostAccess(id);
  if ('error' in access) {
    return NextResponse.json({ error: access.error.message }, { status: access.error.status });
  }

  const { post, profile } = access;
  if (!canManageAllPosts(profile)) {
    return NextResponse.json({ error: 'Só administradores e gerentes reprovam posts.' }, { status: 403 });
  }
  if (post.status !== 'pending_approval') {
    return NextResponse.json({ error: 'Este post não está aguardando aprovação.' }, { status: 409 });
  }

  const body = await request.json().catch(() => ({}));
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
  if (reason.length < 3) {
    return NextResponse.json({ error: 'Explique o motivo da reprovação.' }, { status: 400 });
  }
  if (reason.length > 500) {
    return NextResponse.json({ error: 'O motivo pode ter no máximo 500 caracteres.' }, { status: 400 });
  }

  const moved = await transitionPostStatus(access.tenantId, id, ['pending_approval'], 'rejected', {
    rejection_reason: reason,
    approved_by: null,
    approved_at: null,
  });
  if (!moved) {
    return NextResponse.json({ error: 'Outra pessoa já revisou este post. Atualize a página.' }, { status: 409 });
  }

  await notifyUser(
    post.created_by,
    'Post reprovado',
    `${profile.name} reprovou seu post: "${reason}". Ajuste e envie de novo.`,
    '/social?tab=posts&status=rejected'
  );

  return NextResponse.json({ success: true, data: await getPost(access.tenantId, id) });
}
