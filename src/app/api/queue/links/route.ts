import { NextResponse } from 'next/server';
import { requireActiveProfile } from '@/lib/session';
import { displayKeyOf } from '@/services/tenant-public.service';

/** Links do totem e do painel DESTA empresa (levam a chave dela). */
export async function GET() {
  const auth = await requireActiveProfile({ module: 'senhas' });
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });

  const key = await displayKeyOf(auth.tenantId);
  if (!key) return NextResponse.json({ error: 'Rode a migration de separação por empresa.' }, { status: 500 });
  return NextResponse.json({ data: { display: `/display?k=${key}`, totem: `/totem?k=${key}` } });
}
