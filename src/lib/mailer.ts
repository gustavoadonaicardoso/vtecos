/**
 * ============================================================
 * VTEC OS — E-mail da Vórtice (SMTP, server-only)
 * ============================================================
 * Usado no código de confirmação do cadastro (teste grátis). Servidor,
 * usuário, senha e remetente ficam em Painel Master > Plataforma (ou
 * SMTP_* no .env). Porta 465 = conexão segura direta; 587 = STARTTLS.
 * ============================================================
 */

import nodemailer, { type Transporter } from 'nodemailer';
import { platformSettings, type PlatformSettings } from '@/lib/platform-settings';

let cached: { key: string; transporter: Transporter } | null = null;

export function smtpConfigured(settings: Pick<PlatformSettings, 'smtpHost' | 'smtpUser' | 'smtpPassword' | 'smtpFrom'>) {
  return Boolean(settings.smtpHost && settings.smtpUser && settings.smtpPassword && settings.smtpFrom);
}

/** O e-mail da Vórtice está configurado? */
export async function mailerReady() {
  return smtpConfigured(await platformSettings());
}

async function transporter() {
  const settings = await platformSettings();
  if (!smtpConfigured(settings)) throw new Error('O e-mail (SMTP) não está configurado em Painel Master > Plataforma.');
  const port = Number(settings.smtpPort) || 587;
  const key = [settings.smtpHost, port, settings.smtpUser, settings.smtpPassword].join('|');
  if (!cached || cached.key !== key) {
    cached = {
      key,
      transporter: nodemailer.createTransport({
        host: settings.smtpHost,
        port,
        secure: port === 465,
        auth: { user: settings.smtpUser, pass: settings.smtpPassword },
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
      }),
    };
  }
  return { transport: cached.transporter, from: settings.smtpFrom };
}

export async function sendMail(input: { to: string; subject: string; text: string; html?: string }) {
  const { transport, from } = await transporter();
  await transport.sendMail({ from, to: input.to, subject: input.subject, text: input.text, html: input.html });
}

/** Erro do servidor de e-mail em português (os mais comuns). */
export function mailerErrorMessage(error: unknown): string {
  const err = (error || {}) as { code?: string; responseCode?: number; message?: string };
  if (err.code === 'EAUTH' || err.responseCode === 535) return 'Usuário ou senha recusados pelo servidor de e-mail. No Gmail, use uma "senha de app" (não a senha normal da conta).';
  if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT' || err.code === 'ECONNECTION' || err.code === 'ESOCKET') return 'Não foi possível conectar ao servidor de e-mail. Confira o endereço e a porta (587 ou 465).';
  if (err.code === 'EDNS' || err.code === 'ENOTFOUND') return 'Servidor de e-mail não encontrado. Confira o endereço (ex.: smtp.gmail.com).';
  if (err.code === 'EENVELOPE' || err.responseCode === 550 || err.responseCode === 553) return 'O servidor recusou o remetente ou o destinatário. O remetente precisa ser um e-mail da própria conta.';
  return err.message || 'erro desconhecido';
}

/** Testa a conexão e o login no servidor; com "to", manda um e-mail de teste. */
export async function verifyMailer(to?: string): Promise<{ ok: boolean; message: string }> {
  try {
    const { transport } = await transporter();
    await transport.verify();
    if (!to) return { ok: true, message: 'Conectou e entrou no servidor de e-mail.' };
    await sendMail({
      to,
      subject: 'Teste do e-mail do vtec os',
      text: 'Se você recebeu esta mensagem, o e-mail da Vórtice está funcionando: o código de confirmação do cadastro vai sair por aqui.',
    });
    return { ok: true, message: `Funcionou: mandamos um e-mail de teste para ${to}.` };
  } catch (error) {
    return { ok: false, message: mailerErrorMessage(error) };
  }
}
