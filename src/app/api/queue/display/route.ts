import { NextResponse } from 'next/server';
import { getDisplayConfig, listDisplayMedia } from '@/services/queue-display.service';

export const dynamic = 'force-dynamic';

/**
 * Público (a TV do painel não faz login): devolve a rotina e a playlist
 * ativa. É o mesmo conteúdo que aparece na tela para quem está na sala.
 */
export async function GET() {
  const config = await getDisplayConfig();
  const media = config.enabled ? await listDisplayMedia(true) : { success: true as const, data: [] };
  return NextResponse.json(
    { success: true, data: { config, media: media.success ? media.data : [] } },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
