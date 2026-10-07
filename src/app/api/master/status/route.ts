import { NextResponse } from 'next/server';
import { logAudit } from '@/lib/audit';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requirePlatformAdmin } from '@/lib/session';
import { listHealth } from '@/lib/status/health';
import { listNotices, saveNotice } from '@/services/status.service';

/** Painel Master > Status: avisos publicados e a verificação automática. */
export async function GET() {
  const auth = await requirePlatformAdmin();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  try {
    const [notices, health] = await Promise.all([listNotices(), listHealth()]);
    return NextResponse.json({ data: { notices, health } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Falha ao carregar o status.' }, { status: 500 });
  }
}

/** Publica um aviso. */
export async function POST(request: Request) {
  const auth = await requirePlatformAdmin();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  const result = await saveNotice(null, await request.json().catch(() => ({})), auth.profile);
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 });
  await logAudit({ id: auth.profile.id, name: auth.profile.name }, 'SETTINGS_UPDATE', `Publicou o aviso de status "${result.title}".`, 'system_notice', result.id, supabaseAdmin, auth.tenantId);
  return NextResponse.json({ data: result }, { status: 201 });
}
