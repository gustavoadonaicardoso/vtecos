import { NextResponse } from 'next/server';
import { clientIp, createLimiter } from '@/lib/rate-limit';
import { mailerReady } from '@/lib/mailer';
import { asaasReady } from '@/lib/asaas';
import { requestSignupCode } from '@/services/signup-email.service';
import { parseSignup, precheckSignup } from '@/services/signup.service';

// Público (tela de cadastro): confere o formulário inteiro (plano, CPF/CNPJ,
// e-mail livre) e manda o código de 6 dígitos para o e-mail -- assim a pessoa
// não descobre um erro do formulário só depois de digitar o código.
// Limite por IP contra abuso; o serviço ainda limita por e-mail.
const byIp = createLimiter({ windowMs: 60 * 60 * 1000, max: 10 });

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (typeof body.website === 'string' && body.website.trim()) return NextResponse.json({ error: 'Cadastro recusado.' }, { status: 400 });
  // Sem e-mail configurado na Vórtice: o cadastro segue sem o código.
  if (!(await mailerReady())) return NextResponse.json({ data: { required: false } });

  const ip = clientIp(request);
  const limit = byIp.blocked(ip);
  if (limit.blocked) return NextResponse.json({ error: `Muitos códigos pedidos. Tente de novo em ${Math.max(1, Math.ceil(limit.retryInMs / 60000))} minuto(s).` }, { status: 429 });
  if (!(await asaasReady())) {
    return NextResponse.json({ error: 'O teste grátis está indisponível agora. Fale com a Vórtice pelo WhatsApp.' }, { status: 503 });
  }
  const parsed = parseSignup(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const checked = await precheckSignup(parsed.value);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: checked.status });

  byIp.hit(ip);
  const result = await requestSignupCode(parsed.value.email, parsed.value.name.slice(0, 120));
  if (!result.ok) return NextResponse.json({ error: result.error, retryInSeconds: result.retryInSeconds }, { status: result.status });
  return NextResponse.json({ data: { required: true, sent: true } });
}
