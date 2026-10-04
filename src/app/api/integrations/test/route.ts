import { NextResponse } from 'next/server';
import { requireAdminProfile } from '@/lib/session';
import { PROVIDERS, testIntegration, type Provider } from '@/services/integrations.service';

export const runtime = 'nodejs';

// POST { provider }: testa a integração com a configuração salva.
export async function POST(request: Request) {
  const auth = await requireAdminProfile();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });

  const body = await request.json().catch(() => ({}));
  const provider = String(body.provider || '') as Provider;
  if (!PROVIDERS.includes(provider)) return NextResponse.json({ error: 'Integração desconhecida.' }, { status: 400 });

  const result = await testIntegration(auth.tenantId, provider);
  return NextResponse.json({ data: result });
}
