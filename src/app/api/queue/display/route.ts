import { NextResponse } from 'next/server';
import { getDisplayConfig, listDisplayMedia } from '@/services/queue-display.service';
import { resolveTenantByDisplayKey } from '@/services/tenant-public.service';

export const dynamic = 'force-dynamic';

/**
 * Público (a TV do painel não faz login): devolve a rotina e a playlist
 * ativa DA EMPRESA dona da chave (?key=). Sem chave válida, nada.
 */
export async function GET(request: Request) {
  const tenant = await resolveTenantByDisplayKey(new URL(request.url).searchParams.get('key'));
  if (!tenant) return NextResponse.json({ error: 'Painel não encontrado.' }, { status: 404 });

  const config = await getDisplayConfig(tenant.id);
  const media = config.enabled ? await listDisplayMedia(tenant.id, true) : { success: true as const, data: [] };
  return NextResponse.json(
    { success: true, data: { config, media: media.success ? media.data : [] } },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
