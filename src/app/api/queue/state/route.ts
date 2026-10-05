import { NextResponse } from 'next/server';
import { requireActiveProfile } from '@/lib/session';
import { getQueueSettings, listTodayTickets } from '@/services/queue.service';
import { displayKeyOf } from '@/services/tenant-public.service';

export const dynamic = 'force-dynamic';

/** Recepção: senhas de hoje, configurações e links do totem/TV desta empresa. */
export async function GET() {
  const auth = await requireActiveProfile({ module: 'senhas' });
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });

  try {
    const tenant = { id: auth.tenantId, name: auth.tenantName };
    const [tickets, settings, key] = await Promise.all([listTodayTickets(auth.tenantId), getQueueSettings(tenant), displayKeyOf(auth.tenantId)]);
    return NextResponse.json({
      data: {
        tickets,
        settings,
        links: key ? { display: `/display?k=${key}`, totem: `/totem?k=${key}` } : null,
        canManage: auth.profile.role === 'ADMIN' || auth.profile.role === 'MANAGER',
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Falha ao carregar a fila.' }, { status: 500 });
  }
}
