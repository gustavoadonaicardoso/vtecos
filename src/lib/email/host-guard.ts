/**
 * Servidores de e-mail que uma empresa cadastra precisam ser da internet:
 * nada de 127.0.0.1, rede interna ou da própria VPS (senão a caixa vira um
 * jeito de sondar serviços internos). Server-only.
 * EMAIL_ALLOW_PRIVATE_HOSTS=true libera (só para testes locais).
 */

import { lookup } from 'dns/promises';
import { isIP } from 'net';

const HOST_RE = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i;

function privateIp(ip: string) {
  if (ip.includes(':')) {
    const v6 = ip.toLowerCase();
    if (v6.startsWith('::ffff:')) return privateIp(v6.slice(7));
    return v6 === '::1' || v6 === '::' || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe80');
  }
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

export async function checkMailHost(host: string): Promise<string | null> {
  const value = host.trim().toLowerCase();
  if (!value || (!HOST_RE.test(value) && !isIP(value))) return `Endereço de servidor inválido: ${host}`;
  if (process.env.EMAIL_ALLOW_PRIVATE_HOSTS === 'true') return null;
  let addresses: { address: string }[] = [];
  try {
    addresses = isIP(value) ? [{ address: value }] : await lookup(value, { all: true });
  } catch {
    return `Servidor não encontrado: ${host}. Confira o endereço.`;
  }
  if (!addresses.length || addresses.some((item) => privateIp(item.address))) return `O servidor ${host} não é um endereço da internet.`;
  return null;
}
