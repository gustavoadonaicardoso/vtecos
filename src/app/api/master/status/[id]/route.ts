import { NextResponse } from 'next/server';
import { logAudit } from '@/lib/audit';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requirePlatformAdmin } from '@/lib/session';
import { addNoticeUpdate, deleteNotice, resolveNotice, saveNotice } from '@/services/status.service';

type Context = { params: Promise<{ id: string }> };

/** action: "edit" (campos), "update" (linha do tempo) ou "resolve" (encerrar). */
export async function PATCH(request: Request, { params }: Context) {
  const auth = await requirePlatformAdmin();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const result =
    body.action === 'update' ? await addNoticeUpdate(id, body.message, auth.profile)
    : body.action === 'resolve' ? await resolveNotice(id, body.message, auth.profile)
    : body.action === 'edit' ? await saveNotice(id, body.notice || {}, auth.profile)
    : { error: 'Ação desconhecida.' };
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 });
  if (body.action === 'resolve') {
    await logAudit({ id: auth.profile.id, name: auth.profile.name }, 'SETTINGS_UPDATE', `Encerrou o aviso de status "${result.title}".`, 'system_notice', result.id, supabaseAdmin, auth.tenantId);
  }
  return NextResponse.json({ data: result });
}

export async function DELETE(_request: Request, { params }: Context) {
  const auth = await requirePlatformAdmin();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  const { id } = await params;
  const result = await deleteNotice(id);
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 });
  await logAudit({ id: auth.profile.id, name: auth.profile.name }, 'SETTINGS_UPDATE', 'Apagou um aviso de status.', 'system_notice', id, supabaseAdmin, auth.tenantId);
  return NextResponse.json({ data: result });
}
