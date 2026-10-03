import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { resolveTenantByDisplayKey } from '@/services/tenant-public.service';

export const dynamic = 'force-dynamic';

/**
 * Público (TV do painel e totem): senhas chamadas e identidade visual DA
 * EMPRESA dona da chave. Só o que já aparece na tela da sala -- número,
 * primeiro nome e guichê. Telefone e documento nunca saem daqui.
 */
export async function GET(request: Request) {
  const tenant = await resolveTenantByDisplayKey(new URL(request.url).searchParams.get('key'));
  if (!tenant) return NextResponse.json({ error: 'Painel não encontrado.' }, { status: 404 });

  const [{ data: tickets }, { data: settings }] = await Promise.all([
    supabaseAdmin
      .from('attendance_queue_tickets')
      .select('id, number, name, desk, status, created_at, updated_at')
      .eq('tenant_id', tenant.id)
      .in('status', ['calling', 'completed'])
      .order('updated_at', { ascending: false })
      .limit(6),
    supabaseAdmin
      .from('queue_settings')
      .select('logo_url, banner_url, app_name, primary_color, secondary_color, welcome_text')
      .eq('tenant_id', tenant.id)
      .maybeSingle(),
  ]);

  return NextResponse.json(
    {
      tenant: { name: tenant.name },
      settings: settings || null,
      tickets: (tickets || []).map((ticket) => ({ ...ticket, name: (ticket.name || '').trim().split(/\s+/)[0] || '' })),
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
