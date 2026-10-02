import { NextResponse } from 'next/server';
import { requireAdminProfile } from '@/lib/session';
import { disconnectAccount, setAccountProject } from '@/services/social.service';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Vincula (ou desvincula, com projectId null) a conta a um Projeto. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminProfile();
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  }

  const body = await request.json().catch(() => ({}));
  const projectId = body?.projectId ?? null;
  if (projectId !== null && (typeof projectId !== 'string' || !UUID_PATTERN.test(projectId))) {
    return NextResponse.json({ error: 'Projeto inválido.' }, { status: 400 });
  }

  const { id } = await params;
  const result = await setAccountProject(id, projectId);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminProfile();
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  }

  const { id } = await params;
  const result = await disconnectAccount(id);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ success: true });
}
