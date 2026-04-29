import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key);
}

function renderMessage(template: string, data: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => data[key] ?? '');
}

export async function GET() {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('blast_campaigns')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ campaigns: data });
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabase();
    const body = await req.json();
    const { name, template, columnsConfig, delayMin, delayMax, contacts, routeType, routeToId, routeToLabel } = body;

    if (!name || !template || !contacts?.length) {
      return NextResponse.json({ error: 'Dados incompletos' }, { status: 400 });
    }

    const phoneColumn = columnsConfig.find((c: any) => c.isPhone)?.key;
    if (!phoneColumn) {
      return NextResponse.json({ error: 'Nenhuma coluna marcada como telefone' }, { status: 400 });
    }

    const { data: campaign, error: campaignError } = await supabase
      .from('blast_campaigns')
      .insert([{
        name,
        template,
        columns_config: columnsConfig,
        delay_min: delayMin ?? 3,
        delay_max: delayMax ?? 8,
        status: 'draft',
        total_contacts: contacts.length,
        route_type: routeType ?? 'none',
        route_to_id: routeToId ?? null,
        route_to_label: routeToLabel ?? null,
      }])
      .select()
      .single();

    if (campaignError || !campaign) {
      return NextResponse.json({ error: campaignError?.message ?? 'Erro ao criar campanha' }, { status: 500 });
    }

    const contactRows = contacts.map((row: Record<string, string>) => {
      const phone = row[phoneColumn] ?? '';
      const rendered = renderMessage(template, row);
      return {
        campaign_id: campaign.id,
        phone,
        data: row,
        rendered_message: rendered,
        status: 'pending',
      };
    });

    const BATCH = 500;
    for (let i = 0; i < contactRows.length; i += BATCH) {
      const { error: insertError } = await supabase
        .from('blast_contacts')
        .insert(contactRows.slice(i, i + BATCH));
      if (insertError) {
        await supabase.from('blast_campaigns').delete().eq('id', campaign.id);
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }
    }

    return NextResponse.json({ campaign });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
