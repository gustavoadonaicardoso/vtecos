import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key);
}

const GRAPH_VERSION = 'v21.0';

export interface MetaTemplate {
  id: string;
  name: string;
  status: string;
  category: string;
  language: string;
  components: MetaTemplateComponent[];
}

export interface MetaTemplateComponent {
  type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS';
  format?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
  text?: string;
  buttons?: any[];
}

export async function GET() {
  const supabase = getSupabase();

  const { data: item, error } = await supabase
    .from('integrations_config')
    .select('config')
    .eq('provider', 'whatsapp_meta')
    .maybeSingle();

  if (error || !item) {
    return NextResponse.json(
      { error: 'WhatsApp Meta não configurado. Acesse Integrações para configurar.' },
      { status: 400 }
    );
  }

  const { token, wabaId } = item.config as { token: string; wabaId: string; phoneId: string };

  if (!token || !wabaId) {
    return NextResponse.json(
      { error: 'Token ou WABA ID ausentes na configuração da integração Meta.' },
      { status: 400 }
    );
  }

  try {
    const url = `https://graph.facebook.com/${GRAPH_VERSION}/${wabaId}/message_templates?fields=id,name,status,category,language,components&limit=200&access_token=${token}`;
    const res = await fetch(url);
    const data = await res.json();

    if (!res.ok) {
      const msg = data?.error?.message ?? 'Erro ao buscar templates da Meta';
      return NextResponse.json({ error: msg }, { status: res.status });
    }

    const templates: MetaTemplate[] = (data.data ?? []).filter(
      (t: MetaTemplate) => t.status === 'APPROVED'
    );

    return NextResponse.json({ templates });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
