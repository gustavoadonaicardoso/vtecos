import { NextResponse } from 'next/server';
import { requireActiveProfile } from '@/lib/session';
import { isMetaAppConfigured } from '@/lib/social/meta-graph';
import { listAccounts } from '@/services/social.service';

export async function GET() {
  const auth = await requireActiveProfile({ module: 'social' });
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  }

  const result = await listAccounts(auth.tenantId);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });

  return NextResponse.json({
    success: true,
    data: result.data,
    metaConfigured: isMetaAppConfigured(),
  });
}
