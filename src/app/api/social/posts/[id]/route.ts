import { NextResponse } from 'next/server';
import { requireActiveProfile } from '@/lib/session';
import { needsApproval, requirePostAccess } from '@/lib/social/access';
import { parsePostInput } from '@/lib/social/input';
import { deletePost, getPost, getSocialSettings, transitionPostStatus, updatePost } from '@/services/social.service';
import type { SocialPostStatus } from '@/types';

/** Depois que começou a sair (ou saiu) pra rede, o post não muda mais por aqui. */
const LOCKED_STATUSES: SocialPostStatus[] = ['publishing', 'published', 'published_late', 'partial'];
const REAPPROVAL_STATUSES: SocialPostStatus[] = ['scheduled', 'failed'];

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireActiveProfile({ module: 'social', permission: 'social.view' });
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  }

  const { id } = await params;
  const post = await getPost(auth.tenantId, id);
  if (!post) return NextResponse.json({ error: 'Post não encontrado.' }, { status: 404 });
  return NextResponse.json({ success: true, data: post });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requirePostAccess(id);
  if ('error' in access) {
    return NextResponse.json({ error: access.error.message }, { status: access.error.status });
  }

  if (LOCKED_STATUSES.includes(access.post.status)) {
    return NextResponse.json({ error: 'Este post já foi (ou está sendo) publicado e não pode ser editado.' }, { status: 409 });
  }

  const body = await request.json().catch(() => null);
  const parsed = parsePostInput(body);
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  // Quem precisa de aprovação não pode mudar um post já aprovado (agendado) ou
  // que falhou e seria reenviado pelo "Tentar de novo": volta pra rascunho.
  // Volta ANTES de gravar o conteúdo novo, senão o agendador poderia pegar o
  // post editado entre as duas operações e publicar algo não aprovado.
  const settings = await getSocialSettings(access.tenantId);
  const revertToDraft = needsApproval(access.profile, settings) && REAPPROVAL_STATUSES.includes(access.post.status);
  if (revertToDraft) {
    const moved = await transitionPostStatus(access.tenantId, id, [access.post.status], 'draft', { approved_by: null, approved_at: null });
    if (!moved) {
      return NextResponse.json({ error: 'O post mudou de status enquanto você editava. Atualize a página.' }, { status: 409 });
    }
  }

  const result = await updatePost(access.tenantId, id, parsed.input);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ success: true, revertedToDraft: revertToDraft, data: result.data });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requirePostAccess(id);
  if ('error' in access) {
    return NextResponse.json({ error: access.error.message }, { status: access.error.status });
  }

  if (access.post.status === 'publishing') {
    return NextResponse.json({ error: 'Aguarde a publicação terminar antes de excluir.' }, { status: 409 });
  }

  const result = await deletePost(access.tenantId, id);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ success: true });
}
