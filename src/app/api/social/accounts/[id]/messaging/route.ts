import { NextResponse } from 'next/server';
import { requireAdminProfile } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { enablePageMessaging } from '@/lib/social/inbox';

/** Liga (de novo) o recebimento do Direct/Messenger na Página desta conta. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminProfile({ module: 'social', permission: 'social.view' });
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });

  const { id } = await params;
  const { data: account } = await supabaseAdmin.from('social_accounts').select('page_id').eq('tenant_id', auth.tenantId).eq('id', id).maybeSingle();
  if (!account) return NextResponse.json({ error: 'Conta não encontrada.' }, { status: 404 });

  const result = await enablePageMessaging(auth.tenantId, String(account.page_id));
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ success: true });
}
