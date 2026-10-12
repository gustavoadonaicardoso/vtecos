/**
 * ============================================================
 * VTEC OS — Cofre de segredos (server-only)
 * ============================================================
 * Cifra senhas que o sistema precisa usar de novo (ex.: senha das caixas
 * de e-mail) antes de gravar no banco. AES-256-GCM com chave derivada de
 * SECRET_BOX_KEY (ou, se não houver, da SUPABASE_SERVICE_ROLE_KEY).
 * Assim um backup ou uma consulta no SQL Editor não mostra a senha.
 * Trocar a chave invalida as senhas guardadas: é só conectar de novo.
 * Formato: v1.<iv>.<tag>.<dados> (base64url).
 * ============================================================
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

function key(): Buffer {
  const base = process.env.SECRET_BOX_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!base) throw new Error('Sem chave para cifrar segredos (SECRET_BOX_KEY ou SUPABASE_SERVICE_ROLE_KEY).');
  return createHash('sha256').update(`vtec-secret-box:${base}`).digest();
}

export function sealSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.');
}

/** Devolve null se o valor não abrir (chave trocada ou dado corrompido). */
export function openSecret(sealed: string): string | null {
  const [version, iv, tag, data] = String(sealed || '').split('.');
  if (version !== 'v1' || !iv || !tag || data === undefined) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
