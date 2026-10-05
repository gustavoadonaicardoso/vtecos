import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { resolveTenantByDisplayKey } from '@/services/tenant-public.service';
import { getQueueSettings, queueToday } from '@/services/queue.service';

export const dynamic = 'force-dynamic';

/**
 * Público (TV do painel e totem): senhas chamadas hoje e identidade visual
 * DA EMPRESA dona da chave. Só o que já aparece na tela da sala -- número,
 * primeiro nome e guichê. Telefone e documento nunca saem daqui.
 */
export async function GET(request: Request) {
  const tenant = await resolveTenantByDisplayKey(new URL(request.url).searchParams.get('key'));
  if (!tenant) return NextResponse.json({ error: 'Painel não encontrado.' }, { status: 404 });

  const [{ data: tickets }, settings, { count: waiting }] = await Promise.all([
    supabaseAdmin
      .from('attendance_queue_tickets')
      .select('id, number, name, desk, status, priority, called_at, call_count')
      .eq('tenant_id', tenant.id)
      .eq('queue_date', queueToday())
      .not('called_at', 'is', null)
      .order('called_at', { ascending: false })
      .limit(6),
    getQueueSettings(tenant),
    supabaseAdmin
      .from('attendance_queue_tickets')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id)
      .eq('queue_date', queueToday())
      .eq('status', 'waiting'),
  ]);

  return NextResponse.json(
    {
      tenant: { name: tenant.name },
      settings,
      waiting: waiting ?? 0,
      tickets: (tickets || []).map((ticket) => ({
        id: ticket.id,
        number: ticket.number,
        priority: ticket.priority === true,
        desk: ticket.desk,
        status: ticket.status,
        calledAt: ticket.called_at,
        callCount: ticket.call_count,
        name: (ticket.name || '').trim().split(/\s+/)[0] || '',
      })),
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
