import { NextResponse } from 'next/server';
import { logAudit } from '@/lib/audit';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requirePlatformAdmin } from '@/lib/session';
import { checkGeminiKey } from '@/lib/ai';
import { platformSettings, platformSettingsView, savePlatformSettings } from '@/lib/platform-settings';

/**
 * Painel Master > Plataforma: app da Meta, webhook do WhatsApp e IA
 * padrão da Vórtice. Só administradores da empresa da plataforma. Os
 * segredos nunca voltam para a tela.
 */
export async function GET() {
  const auth = await requirePlatformAdmin();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  return NextResponse.json({ data: await platformSettingsView() });
}

export async function PUT(request: Request) {
  const auth = await requirePlatformAdmin();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  const body = await request.json().catch(() => ({}));
  const clear = Array.isArray(body.clear) ? body.clear.filter((item: unknown): item is string => typeof item === 'string') : [];
  const result = await savePlatformSettings((body.values || {}) as Record<string, unknown>, clear);
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 });
  await logAudit({ id: auth.profile.id, name: auth.profile.name }, 'SETTINGS_UPDATE', 'Alterou as configurações da plataforma (Painel Master > Plataforma).', 'platform', 'settings', supabaseAdmin, auth.tenantId);
  return NextResponse.json({ data: await platformSettingsView() });
}

/** Testa o que está salvo: app da Meta, chave do Gemini ou IA local. */
export async function POST(request: Request) {
  const auth = await requirePlatformAdmin();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  const { target } = await request.json().catch(() => ({}));
  const settings = await platformSettings();

  if (target === 'meta') {
    if (!settings.metaAppId || !settings.metaAppSecret) return NextResponse.json({ data: { ok: false, message: 'Preencha o ID e a chave secreta do app e salve antes de testar.' } });
    try {
      const params = new URLSearchParams({ client_id: settings.metaAppId, client_secret: settings.metaAppSecret, grant_type: 'client_credentials' });
      const response = await fetch(`https://graph.facebook.com/${process.env.META_GRAPH_VERSION || 'v23.0'}/oauth/access_token?${params}`, { signal: AbortSignal.timeout(10_000) });
      const json = await response.json().catch(() => ({}));
      return NextResponse.json({ data: json.access_token ? { ok: true, message: 'A Meta aceitou o ID e a chave secreta do app.' } : { ok: false, message: `A Meta recusou: ${json?.error?.message || `resposta ${response.status}`}` } });
    } catch {
      return NextResponse.json({ data: { ok: false, message: 'Não foi possível falar com a Meta agora.' } });
    }
  }

  if (target === 'gemini') {
    if (!settings.geminiKey) return NextResponse.json({ data: { ok: false, message: 'Cole a chave do Gemini e salve antes de testar.' } });
    const checked = await checkGeminiKey(settings.geminiKey);
    return NextResponse.json({ data: checked.ok ? { ok: true, message: 'Chave do Gemini funcionando.' } : { ok: false, message: checked.error } });
  }

  if (target === 'ollama') {
    try {
      const response = await fetch(`${settings.ollamaUrl.replace(/\/+$/, '')}/api/tags`, { signal: AbortSignal.timeout(5_000) });
      const json = await response.json().catch(() => ({}));
      const models = Array.isArray(json.models) ? json.models.map((model: { name?: string }) => String(model.name || '')) : [];
      if (!response.ok) return NextResponse.json({ data: { ok: false, message: `A IA local respondeu ${response.status}.` } });
      const found = models.some((name: string) => name === settings.ollamaModel || name === `${settings.ollamaModel}:latest`);
      return NextResponse.json({ data: found ? { ok: true, message: `IA local funcionando com o modelo ${settings.ollamaModel}.` } : { ok: false, message: `A IA local respondeu, mas o modelo ${settings.ollamaModel} não foi baixado. Na VPS: ollama pull ${settings.ollamaModel}` } });
    } catch {
      return NextResponse.json({ data: { ok: false, message: `Não foi possível falar com a IA local em ${settings.ollamaUrl}. Confira se o Ollama está ligado (systemctl status ollama).` } });
    }
  }

  return NextResponse.json({ error: 'Teste desconhecido.' }, { status: 400 });
}
