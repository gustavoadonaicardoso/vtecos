import { NextResponse } from 'next/server';
import { logAudit } from '@/lib/audit';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { emitIntegrationEvent, leadEventData } from '@/lib/integrations/events';
import { fireAutomation, onLeadCreated } from '@/lib/automations/engine';

/**
 * Captura de leads (Integrações > Captura de leads): formulário do site,
 * landing page, Make/Zapier... A chave na URL (?key=) identifica a empresa.
 * Aceita JSON e formulário HTML; formulário com campo "redirect" volta
 * para a página de obrigado do site.
 */

export const runtime = 'nodejs';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Api-Key',
};

// 30 leads por minuto por chave (memória do processo).
const hits = new Map<string, number[]>();
function limited(key: string) {
  const now = Date.now();
  const recent = (hits.get(key) || []).filter((at) => now - at < 60_000);
  recent.push(now);
  hits.set(key, recent);
  return recent.length > 30;
}

const field = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : typeof value === 'number' ? String(value) : '');

function thanksPage(message: string, status = 200) {
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>vtec os</title></head>
<body style="font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#f1f5f9;color:#0f172a">
<div style="max-width:420px;padding:32px;border-radius:16px;background:#fff;box-shadow:0 10px 30px rgba(15,23,42,.1);text-align:center"><p style="font-size:1.1rem;margin:0">${message}</p></div></body></html>`;
  return new NextResponse(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', ...CORS } });
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const contentType = request.headers.get('content-type') || '';
  const isForm = contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data');

  const fail = (message: string, status: number) =>
    isForm ? thanksPage(message, status) : NextResponse.json({ error: message }, { status, headers: CORS });

  const key = url.searchParams.get('key') || request.headers.get('x-api-key') || '';
  if (!/^lc_[a-f0-9]{32}$/.test(key)) return fail('Chave de captura inválida.', 401);
  if (limited(key)) return fail('Muitos envios seguidos. Tente de novo em um minuto.', 429);

  let body: Record<string, unknown> = {};
  try {
    body = isForm ? Object.fromEntries((await request.formData()).entries()) : await request.json();
  } catch {
    return fail('Corpo inválido: envie JSON ou um formulário.', 400);
  }

  // tenant-scope: ok (a chave é que diz de qual empresa é o lead)
  const { data: integration } = await supabaseAdmin
    .from('integrations_config')
    .select('tenant_id, config')
    .eq('provider', 'lead_capture')
    .eq('config->>key', key)
    .maybeSingle();
  if (!integration || integration.config?.enabled === false) return fail('Chave de captura inválida ou desativada.', 401);

  const tenantId = integration.tenant_id as string;
  const { data: tenant } = await supabaseAdmin.from('tenants').select('status, is_platform').eq('id', tenantId).maybeSingle();
  if (!tenant || (!tenant.is_platform && tenant.status !== 'ACTIVE')) return fail('Esta empresa está com o acesso suspenso.', 403);

  const name = field(body.name ?? body.nome, 120);
  if (!name) return fail('O campo "name" (nome) é obrigatório.', 400);
  const phone = field(body.phone ?? body.telefone ?? body.whatsapp, 30).replace(/[^\d+]/g, '') || null;
  const email = field(body.email, 160).toLowerCase() || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail('E-mail inválido.', 400);
  const value = Number(String(field(body.value ?? body.valor, 30)).replace(/\./g, '').replace(',', '.')) || 0;
  const message = field(body.message ?? body.mensagem, 500);

  const { data: stage } = await supabaseAdmin.from('pipeline_stages').select('id').eq('tenant_id', tenantId).order('position').limit(1).maybeSingle();
  const row = {
    tenant_id: tenantId,
    name,
    phone,
    email,
    value,
    stage_id: stage?.id ?? null,
    last_msg: message ? `📝 ${message}` : '📝 Formulário do site',
  };

  // Bancos sem a coluna "source" (migration 202610080001) ainda recebem o lead.
  let { data: lead, error } = await supabaseAdmin.from('leads').insert({ ...row, tenant_id: tenantId, source: 'Formulário' }).select().single();
  if (error && /source/.test(error.message)) ({ data: lead, error } = await supabaseAdmin.from('leads').insert({ ...row, tenant_id: tenantId }).select().single());
  if (error || !lead) {
    console.error('[Captura de leads] Falha ao criar lead:', error?.message);
    return fail('Não foi possível registrar agora. Tente de novo em instantes.', 500);
  }

  await logAudit(null, 'LEAD_CREATE', `Lead ${name} criado pelo formulário/API de captura.`, 'lead', lead.id, supabaseAdmin, tenantId).catch(() => {});
  emitIntegrationEvent(tenantId, 'lead.created', leadEventData(lead, 'form'));
  fireAutomation(onLeadCreated, tenantId, String(lead.id), 'form');

  if (isForm) {
    const redirect = field(body.redirect, 500);
    if (/^https?:\/\//i.test(redirect)) return NextResponse.redirect(redirect, { status: 303, headers: CORS });
    return thanksPage('Recebemos seus dados. Em breve entraremos em contato!');
  }
  return NextResponse.json({ success: true, id: lead.id }, { status: 201, headers: CORS });
}
