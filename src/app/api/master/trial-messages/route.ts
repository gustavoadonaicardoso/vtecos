import { NextResponse } from 'next/server';
import { logAudit } from '@/lib/audit';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requirePlatformAdmin } from '@/lib/session';
import { createLimiter } from '@/lib/rate-limit';
import { TRIAL_MESSAGE_INFO, TRIAL_MESSAGE_ORDER, renderTrialMessage, sampleVars, type TrialMessageKey } from '@/lib/trial-messages';
import { platformWhatsAppStatus, saveTrialMessageSettings, trialMessageSettings } from '@/services/trial-messages.service';

/**
 * Painel Master > Plataforma > Mensagens do teste grátis: textos, liga e
 * desliga, e envio de teste pelo WhatsApp da Vórtice.
 */
const testLimit = createLimiter({ windowMs: 60 * 60 * 1000, max: 20 });

export async function GET() {
  const auth = await requirePlatformAdmin();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  const [settings, whatsapp] = await Promise.all([trialMessageSettings(), platformWhatsAppStatus()]);
  return NextResponse.json({ data: { ...settings, whatsapp } });
}

export async function PUT(request: Request) {
  const auth = await requirePlatformAdmin();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  const body = await request.json().catch(() => ({}));
  const result = await saveTrialMessageSettings(body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  await logAudit({ id: auth.profile.id, name: auth.profile.name }, 'SETTINGS_UPDATE', `Alterou as mensagens do teste grátis (${result.data.enabled ? 'ligadas' : 'desligadas'}).`, 'platform', 'trial_messages', supabaseAdmin, auth.tenantId);
  return NextResponse.json({ data: { ...result.data, whatsapp: await platformWhatsAppStatus() } });
}

/** Envia uma mensagem de exemplo (com dados fictícios) para um número. */
export async function POST(request: Request) {
  const auth = await requirePlatformAdmin();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  const body = await request.json().catch(() => ({}));
  const key = String(body.key) as TrialMessageKey;
  const phone = String(body.phone || '').replace(/\D/g, '');
  if (!TRIAL_MESSAGE_ORDER.includes(key)) return NextResponse.json({ error: 'Escolha a mensagem.' }, { status: 400 });
  if (phone.length < 10 || phone.length > 13) return NextResponse.json({ error: 'Informe o WhatsApp com DDD.' }, { status: 400 });
  const limit = testLimit.blocked(auth.profile.id);
  if (limit.blocked) return NextResponse.json({ error: 'Muitos envios de teste. Tente de novo mais tarde.' }, { status: 429 });
  testLimit.hit(auth.profile.id);
  const template = typeof body.text === 'string' && body.text.trim() ? String(body.text) : (await trialMessageSettings()).texts[key];
  try {
    const { deliverWhatsApp } = await import('@/lib/whatsapp-outbound');
    await deliverWhatsApp(auth.tenantId, phone, { text: `[Teste — ${TRIAL_MESSAGE_INFO[key].label}]\n\n${renderTrialMessage(template.slice(0, 1500), sampleVars())}` });
    return NextResponse.json({ data: { ok: true } });
  } catch (error) {
    return NextResponse.json({ error: `Não saiu pelo WhatsApp da Vórtice: ${error instanceof Error ? error.message : 'erro desconhecido'}` }, { status: 502 });
  }
}
