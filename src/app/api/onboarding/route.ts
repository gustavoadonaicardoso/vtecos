import { NextResponse } from 'next/server';
import { requireAdminProfile } from '@/lib/session';
import { dismissOnboarding, onboardingForHome } from '@/services/onboarding.service';

/**
 * Primeiros passos (checklist do Início). Só administradores: são eles
 * que conectam o WhatsApp e cadastram a equipe.
 */
export async function GET() {
  const auth = await requireAdminProfile();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  if (auth.isPlatform) return NextResponse.json({ data: null });
  return NextResponse.json({ data: await onboardingForHome(auth.tenantId, auth.modules) });
}

/** Fecha o quadro de vez ("Já sei usar, ocultar"). */
export async function POST(request: Request) {
  const auth = await requireAdminProfile();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  const body = await request.json().catch(() => ({}));
  if (body.action !== 'dismiss') return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
  await dismissOnboarding(auth.tenantId);
  return NextResponse.json({ data: null });
}
