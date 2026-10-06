import { NextResponse } from 'next/server';
import { requireActiveProfile } from '@/lib/session';
import { bannersFor } from '@/services/banners.service';

/** Banners da tela Início para quem está logado (já filtrados por empresa, plano, cargo e data). */
export async function GET() {
  // permission: open (banners do Início)
  const auth = await requireActiveProfile();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });

  try {
    const data = await bannersFor({ tenantId: auth.tenantId, isPlatform: auth.isPlatform, modules: auth.modules, role: auth.profile.role });
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Falha ao carregar os banners.' }, { status: 500 });
  }
}
