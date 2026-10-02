import { NextResponse } from 'next/server';
import { canManageAllPosts, needsApproval, requirePostAccess } from '@/lib/social/access';
import { claimAndPublishPost } from '@/lib/social/publisher';
import { checkPostReady } from '@/lib/social/readiness';
import { getPost, getSocialSettings, notifyApprovers, notifyUser, transitionPostStatus } from '@/services/social.service';
import type { SocialPostStatus } from '@/types';

export const runtime = 'nodejs';

/** 'failed' entra porque nenhum destino saiu -- dá pra corrigir e reenviar inteiro. */
const SUBMITTABLE: SocialPostStatus[] = ['draft', 'rejected', 'scheduled', 'failed'];

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requirePostAccess(id);
  if ('error' in access) {
    return NextResponse.json({ error: access.error.message }, { status: access.error.status });
  }

  const { post, profile } = access;
  // Admin/gerente pode editar um post pendente e já agendar/publicar: isso conta como aprovação.
  const allowed = canManageAllPosts(profile) ? [...SUBMITTABLE, 'pending_approval' as const] : SUBMITTABLE;
  if (!allowed.includes(post.status)) {
    return NextResponse.json({ error: 'Este post não pode ser enviado no status atual.' }, { status: 409 });
  }

  const body = await request.json().catch(() => ({}));
  const mode = body?.mode === 'now' ? 'now' : 'schedule';

  const problem = await checkPostReady(post);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  if (mode === 'schedule' && (!post.scheduled_at || new Date(post.scheduled_at).getTime() <= Date.now())) {
    return NextResponse.json({ error: 'Escolha uma data e hora no futuro para agendar.' }, { status: 400 });
  }

  const settings = await getSocialSettings();
  const conflict = NextResponse.json({ error: 'O post mudou enquanto você enviava. Atualize a página.' }, { status: 409 });

  if (needsApproval(profile, settings)) {
    // "Publicar agora" vira "publicar assim que aprovar": sem horário marcado.
    const moved = await transitionPostStatus(id, [post.status], 'pending_approval', {
      scheduled_at: mode === 'now' ? null : post.scheduled_at,
      rejection_reason: null,
      approved_by: null,
      approved_at: null,
    });
    if (!moved) return conflict;

    await notifyApprovers(
      'Post aguardando aprovação',
      `${profile.name} enviou um post de Redes Sociais para aprovação.`,
      '/social?tab=posts&status=pending_approval',
      profile.id
    );
    return NextResponse.json({ success: true, pendingApproval: true, data: await getPost(id) });
  }

  const now = new Date().toISOString();
  const approval = post.status === 'pending_approval' ? { approved_by: profile.id, approved_at: now } : {};
  const moved = await transitionPostStatus(id, [post.status], 'scheduled', {
    rejection_reason: null,
    ...approval,
    ...(mode === 'now' ? { scheduled_at: now } : {}),
  });
  if (!moved) return conflict;

  if (post.status === 'pending_approval' && post.created_by !== profile.id) {
    await notifyUser(
      post.created_by,
      'Post aprovado',
      mode === 'now' ? 'Seu post foi aprovado e está sendo publicado.' : 'Seu post foi aprovado e está agendado.'
    );
  }

  if (mode === 'now') {
    // Mesmo caminho do agendador: se ele pegar o post no mesmo segundo, a
    // reivindicação garante que só um dos dois publica.
    await claimAndPublishPost(id, ['scheduled']);
  }

  return NextResponse.json({ success: true, data: await getPost(id) });
}
