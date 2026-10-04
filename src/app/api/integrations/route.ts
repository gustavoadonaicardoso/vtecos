import { NextResponse } from 'next/server';
import { logAudit } from '@/lib/audit';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdminProfile } from '@/lib/session';
import { integrationsOverview, PROVIDERS, removeIntegration, saveIntegration, type Provider } from '@/services/integrations.service';

/**
 * Integrações da empresa logada (só administradores). Os segredos da
 * Meta nunca voltam para o navegador; ao salvar, campo de segredo em
 * branco mantém o valor já salvo.
 */
export async function GET() {
  const auth = await requireAdminProfile();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });

  try {
    const data = await integrationsOverview(auth.tenantId, { isPlatform: auth.isPlatform, modules: auth.modules });
    return NextResponse.json({ data });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erro ao carregar integrações.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminProfile();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });

  try {
    const body = await request.json();
    const provider = String(body.provider || '') as Provider;
    if (!PROVIDERS.includes(provider)) return NextResponse.json({ error: 'Integração desconhecida.' }, { status: 400 });

    const result = await saveIntegration(auth.tenantId, provider, (body.config || {}) as Record<string, unknown>);
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });

    await logAudit(
      { id: auth.profile.id, name: auth.profile.name },
      'SETTINGS_UPDATE',
      `Salvou a integração ${provider}.`,
      'integration',
      provider,
      supabaseAdmin,
      auth.tenantId
    );
    return NextResponse.json({ data: result.data });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erro interno.' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await requireAdminProfile();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });

  const provider = new URL(request.url).searchParams.get('provider');
  if (!provider) return NextResponse.json({ error: 'provider é obrigatório.' }, { status: 400 });

  const result = await removeIntegration(auth.tenantId, provider);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 500 });

  await logAudit(
    { id: auth.profile.id, name: auth.profile.name },
    'SETTINGS_UPDATE',
    `Removeu a integração ${provider}.`,
    'integration',
    provider,
    supabaseAdmin,
    auth.tenantId
  );
  return NextResponse.json({ success: true });
}
