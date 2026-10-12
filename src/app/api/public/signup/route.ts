import { NextResponse } from 'next/server';
import { logAudit } from '@/lib/audit';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { asaasReady } from '@/lib/asaas';
import { clientIp, createLimiter } from '@/lib/rate-limit';
import { setSessionCookies } from '@/lib/session';
import { signIn } from '@/services/auth.service';
import { fetchProfileByEmail, fetchProfileById } from '@/services/profile-lookup.server';
import { withWorkspace } from '@/services/workspace.service';
import { parseSignup, startTrial } from '@/services/signup.service';
import { mailerReady } from '@/lib/mailer';
import { consumeSignupCode, verifySignupCode } from '@/services/signup-email.service';

// Público (tela de cadastro): cria empresa + teste grátis + administrador
// e já entra no sistema. Limites contra abuso: 5 cadastros por IP e 3
// tentativas por e-mail a cada hora. Com o e-mail (SMTP) configurado,
// exige o código de 6 dígitos mandado para o e-mail (/api/public/signup/code).
const HOUR = 60 * 60 * 1000;
const byIp = createLimiter({ windowMs: HOUR, max: 5 });
const byEmail = createLimiter({ windowMs: HOUR, max: 3 });

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  // Campo escondido: só robô preenche.
  if (typeof body.website === 'string' && body.website.trim()) return NextResponse.json({ error: 'Cadastro recusado.' }, { status: 400 });

  const ip = clientIp(request);
  const emailKey = String(body.email || '').trim().toLowerCase();
  const limit = [byIp.blocked(ip), emailKey ? byEmail.blocked(emailKey) : { blocked: false, retryInMs: 0 }].find((item) => item.blocked);
  if (limit) return NextResponse.json({ error: `Muitas tentativas. Tente de novo em ${Math.max(1, Math.ceil(limit.retryInMs / 60000))} minuto(s).` }, { status: 429 });

  if (!(await asaasReady())) {
    return NextResponse.json({ error: 'O teste grátis está indisponível agora. Fale com a Vórtice pelo WhatsApp.' }, { status: 503 });
  }

  const parsed = parseSignup(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  // E-mail confirmado com o código de 6 dígitos (quando o e-mail da Vórtice está configurado).
  const needsCode = await mailerReady();
  if (needsCode) {
    const checked = await verifySignupCode(parsed.value.email, body.code);
    if (!checked.ok) return NextResponse.json({ error: checked.error, codeError: true }, { status: checked.status });
  }

  byIp.hit(ip);
  byEmail.hit(parsed.value.email);
  const result = await startTrial(parsed.value);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  if (needsCode) await consumeSignupCode(parsed.value.email).catch(() => null);

  // Entra direto no sistema.
  const signed = await signIn(parsed.value.email, parsed.value.password, { byId: fetchProfileById, byEmail: fetchProfileByEmail });
  if (!signed.success || !signed.data) return NextResponse.json({ data: null, created: true }, { status: 201 });
  await setSessionCookies(signed.data.session.access_token, signed.data.session.refresh_token, signed.data.session.expires_in);
  const user = await withWorkspace(signed.data.profile);
  await logAudit({ id: signed.data.profile.id, name: signed.data.profile.name }, 'LOGIN', `Conta criada pelo teste grátis (${parsed.value.company}).`, 'profile', signed.data.profile.id, supabaseAdmin, result.tenantId).catch(() => {});
  return NextResponse.json({ data: user, created: true, trialEndsAt: result.trialEndsAt }, { status: 201 });
}
