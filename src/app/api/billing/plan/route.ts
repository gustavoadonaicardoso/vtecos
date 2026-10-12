import { NextResponse } from 'next/server';
import { requireAdminProfile } from '@/lib/session';
import { logAudit } from '@/lib/audit';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { cancelPendingPlanChange, planChangeView, requestPlanChange } from '@/services/plan-change.service';

/**
 * Configurações > Plano: o administrador da empresa troca de plano ou de
 * ciclo (mensal/anual). Subir vale na hora; descer, no vencimento da
 * fatura em aberto. Fatura atrasada ou cobrança manual: não troca por aqui.
 */
export async function GET() {
  const auth = await requireAdminProfile();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  if (auth.isPlatform) return NextResponse.json({ data: null });
  return NextResponse.json({ data: await planChangeView(auth.tenantId) });
}

export async function POST(request: Request) {
  const auth = await requireAdminProfile();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  if (auth.isPlatform) return NextResponse.json({ error: 'A empresa da plataforma não tem plano.' }, { status: 400 });
  const body = await request.json().catch(() => ({}));
  const actor = { id: auth.profile.id, name: auth.profile.name };
  const result = await requestPlanChange(auth.tenantId, { planId: body.planId, cycle: body.cycle }, actor);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  const when = result.mode === 'next_invoice' && result.effectiveOn ? `a partir de ${result.effectiveOn.split('-').reverse().join('/')}` : 'na hora';
  logAudit(actor, 'SETTINGS_UPDATE', `Trocou o plano para ${result.planName} (${result.cycle === 'YEARLY' ? 'anual' : 'mensal'}), ${when}.`, 'billing', auth.tenantId, supabaseAdmin, auth.tenantId).catch(() => {});
  return NextResponse.json({ data: { result, view: await planChangeView(auth.tenantId) } });
}

/** Desiste da troca agendada (continua no plano atual). */
export async function DELETE() {
  const auth = await requireAdminProfile();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  const actor = { id: auth.profile.id, name: auth.profile.name };
  const result = await cancelPendingPlanChange(auth.tenantId, actor);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  logAudit(actor, 'SETTINGS_UPDATE', `Cancelou a troca de plano agendada (segue no ${result.planName}).`, 'billing', auth.tenantId, supabaseAdmin, auth.tenantId).catch(() => {});
  return NextResponse.json({ data: { result, view: await planChangeView(auth.tenantId) } });
}
