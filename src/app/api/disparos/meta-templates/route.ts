import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireCampaignUser } from '@/lib/disparos/auth';
import { getWhatsAppConfig } from '@/lib/whatsapp';
import { META_GRAPH_URL } from '@/lib/meta-graph-version';
import type { MetaWhatsAppConfig } from '@/types';

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
  buttons?: unknown[];
}

export async function GET() {
  const auth = await requireCampaignUser();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });

  // Configuração da Meta DESTA empresa (a mesma usada no envio).
  let config: MetaWhatsAppConfig;
  try {
    config = await getWhatsAppConfig(supabaseAdmin, auth.tenantId);
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'WhatsApp Meta não configurado. Acesse Integrações para configurar.' },
      { status: 400 }
    );
  }

  try {
    const url = `${META_GRAPH_URL}/${encodeURIComponent(config.businessAccountId)}/message_templates?fields=id,name,status,category,language,components&limit=200`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${config.accessToken}` }, signal: AbortSignal.timeout(15_000) });
    const data = await res.json();

    if (!res.ok) {
      const msg = data?.error?.message ?? 'Erro ao buscar templates da Meta';
      return NextResponse.json({ error: msg }, { status: res.status });
    }

    const templates: MetaTemplate[] = (data.data ?? []).filter(
      (t: MetaTemplate) => t.status === 'APPROVED'
    );

    return NextResponse.json({ templates });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erro.' }, { status: 500 });
  }
}
