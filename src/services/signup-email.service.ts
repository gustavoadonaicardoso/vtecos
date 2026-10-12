/**
 * ============================================================
 * VTEC OS — Código de confirmação do e-mail (cadastro do teste grátis)
 * ============================================================
 * 1. A pessoa preenche o cadastro e pede o código: 6 dígitos no e-mail.
 * 2. Digita o código; só então a conta e a cobrança são criadas.
 * O código vale 15 minutos e aceita 5 tentativas. Reenviar: depois de
 * 60 segundos, até 5 vezes por hora. Guardamos só o hash (tabela
 * signup_email_codes, só o servidor lê).
 * Sem e-mail (SMTP) configurado, o cadastro segue sem o código.
 * ============================================================
 */

import { createHash, randomInt, timingSafeEqual } from 'crypto';
import { supabaseAdmin as db } from '@/lib/supabase-admin';

const VALID_MINUTES = 15;
const MAX_ATTEMPTS = 5;
const RESEND_SECONDS = 60;
const MAX_SENDS_PER_HOUR = 5;
const HOUR_MS = 60 * 60 * 1000;

type Row = Record<string, unknown>;
type Result = { ok: true } | { ok: false; status: number; error: string; retryInSeconds?: number };

const normalize = (email: unknown) => String(email ?? '').trim().toLowerCase();
const hashOf = (email: string, code: string) => createHash('sha256').update(`${email}:${code}`).digest('hex');
const sameHash = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

function emailBody(name: string, code: string) {
  const first = name.trim().split(/\s+/)[0] || '';
  const text = `Olá${first ? `, ${first}` : ''}!\n\nSeu código para confirmar o e-mail no vtec os é: ${code}\n\nEle vale por ${VALID_MINUTES} minutos. Se não foi você que pediu, é só ignorar este e-mail.\n\nVórtice Tecnologia`;
  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;padding:24px;background:#f1f5f9;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a">
<div style="max-width:440px;margin:0 auto;padding:28px;border-radius:16px;background:#ffffff;box-shadow:0 8px 24px rgba(15,23,42,.08)">
<p style="margin:0 0 12px;font-size:16px">Olá${first ? `, ${first}` : ''}!</p>
<p style="margin:0 0 18px;font-size:15px;line-height:1.5">Seu código para confirmar o e-mail no <strong>vtec os</strong> é:</p>
<p style="margin:0 0 18px;font-size:34px;font-weight:700;letter-spacing:8px;text-align:center;color:#2563eb">${code}</p>
<p style="margin:0;font-size:13px;line-height:1.5;color:#64748b">Ele vale por ${VALID_MINUTES} minutos. Se não foi você que pediu, é só ignorar este e-mail.</p>
</div><p style="text-align:center;font-size:12px;color:#94a3b8;margin-top:16px">Vórtice Tecnologia</p></body></html>`;
  return { text, html };
}

/** Gera e manda o código. `send` é trocável nos testes. */
export async function requestSignupCode(
  rawEmail: unknown,
  name: string,
  now = new Date(),
  send: (to: string, subject: string, text: string, html: string) => Promise<void> = async (to, subject, text, html) => {
    const { sendMail } = await import('@/lib/mailer');
    await sendMail({ to, subject, text, html });
  },
): Promise<Result> {
  const email = normalize(rawEmail);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { ok: false, status: 400, error: 'Informe um e-mail válido: ele será o seu login.' };

  // tenant-scope: ok (cadastro público: o e-mail de login é único no sistema todo)
  const { data: existing } = await db.from('profiles').select('id').ilike('email', email).limit(1);
  if (existing && existing.length) return { ok: false, status: 409, error: 'Já existe uma conta com este e-mail. Entre pela tela de login (ou use "Esqueceu a senha?").' };

  // Faxina: cadastros abandonados há mais de um dia.
  await db.from('signup_email_codes').delete().lt('last_sent_at', new Date(now.getTime() - 24 * HOUR_MS).toISOString());

  const { data: row } = await db.from('signup_email_codes').select('*').eq('email', email).maybeSingle();
  let sends = 1;
  // Janela de uma hora contada do primeiro envio (created_at), não do último.
  let windowStart = now.toISOString();
  if (row) {
    const last = Date.parse(String((row as Row).last_sent_at));
    const elapsed = (now.getTime() - last) / 1000;
    if (elapsed < RESEND_SECONDS) {
      const wait = Math.ceil(RESEND_SECONDS - elapsed);
      return { ok: false, status: 429, error: `Espere ${wait} segundos para pedir outro código.`, retryInSeconds: wait };
    }
    const started = Date.parse(String((row as Row).created_at)) || last;
    const inWindow = now.getTime() - started < HOUR_MS;
    if (inWindow) {
      sends = Number((row as Row).sends || 1) + 1;
      windowStart = new Date(started).toISOString();
    }
    if (sends > MAX_SENDS_PER_HOUR) {
      const minutes = Math.max(1, Math.ceil((started + HOUR_MS - now.getTime()) / 60_000));
      return { ok: false, status: 429, error: `Muitos códigos pedidos para este e-mail. Tente de novo em ${minutes} minuto${minutes === 1 ? '' : 's'}.`, retryInSeconds: minutes * 60 };
    }
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const { error } = await db.from('signup_email_codes').upsert({
    email,
    code_hash: hashOf(email, code),
    expires_at: new Date(now.getTime() + VALID_MINUTES * 60_000).toISOString(),
    attempts: 0,
    sends,
    last_sent_at: now.toISOString(),
    created_at: windowStart,
  }, { onConflict: 'email' });
  if (error) {
    console.error('[cadastro] código não gravado:', error.message);
    return { ok: false, status: 500, error: /signup_email_codes|schema cache|does not exist/.test(error.message) ? 'Cadastro indisponível: falta rodar a migration 202611070001_signup_email_codes.sql.' : 'Não foi possível gerar o código agora.' };
  }

  const body = emailBody(name, code);
  try {
    await send(email, `Seu código do vtec os: ${code}`, body.text, body.html);
  } catch (sendError) {
    console.error('[cadastro] e-mail do código não saiu:', sendError instanceof Error ? sendError.message : sendError);
    await db.from('signup_email_codes').delete().eq('email', email);
    return { ok: false, status: 502, error: 'Não conseguimos mandar o e-mail agora. Confira o endereço ou tente de novo em instantes.' };
  }
  return { ok: true };
}

/** Confere o código (não apaga: só some quando a conta é criada). */
export async function verifySignupCode(rawEmail: unknown, rawCode: unknown, now = new Date()): Promise<Result> {
  const email = normalize(rawEmail);
  const code = String(rawCode ?? '').replace(/\D/g, '');
  if (code.length !== 6) return { ok: false, status: 400, error: 'Digite o código de 6 números que enviamos para o seu e-mail.' };
  const { data } = await db.from('signup_email_codes').select('*').eq('email', email).maybeSingle();
  const row = data as Row | null;
  if (!row) return { ok: false, status: 400, error: 'Peça um código novo: o anterior não vale mais.' };
  if (Date.parse(String(row.expires_at)) < now.getTime()) return { ok: false, status: 400, error: 'O código venceu. Peça um código novo.' };
  const attempts = Number(row.attempts) || 0;
  if (attempts >= MAX_ATTEMPTS) return { ok: false, status: 429, error: 'Muitas tentativas erradas. Peça um código novo.' };
  if (!sameHash(String(row.code_hash), hashOf(email, code))) {
    await db.from('signup_email_codes').update({ attempts: attempts + 1 }).eq('email', email);
    const left = MAX_ATTEMPTS - attempts - 1;
    return { ok: false, status: 400, error: left > 0 ? `Código errado. Você ainda tem ${left} tentativa${left === 1 ? '' : 's'}.` : 'Código errado. Peça um código novo.' };
  }
  return { ok: true };
}

/** Conta criada: o código não vale mais. */
export async function consumeSignupCode(rawEmail: unknown) {
  await db.from('signup_email_codes').delete().eq('email', normalize(rawEmail));
}
