import { NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/session';
import { seedMissingDefaults } from '@/services/help.service';

// POST: adiciona os artigos padrão que ainda não existem (não mexe nos editados).
export async function POST() {
  const auth = await requirePlatformAdmin();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });

  const result = await seedMissingDefaults();
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ data: result.data });
}
