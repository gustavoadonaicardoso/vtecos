/**
 * URLs que o servidor chama a pedido do cliente (webhooks, Google Sheets).
 * Bloqueia endereços internos (localhost, rede privada, metadados da
 * nuvem) para ninguém usar o vtec os para acessar a rede do servidor.
 */
import { lookup } from 'dns/promises';
import { isIP } from 'net';

function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 6) {
    const lower = ip.toLowerCase();
    if (lower === '::1' || lower === '::') return true;
    if (lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80')) return true;
    const mapped = lower.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return mapped ? isPrivateIp(mapped[1]) : false;
  }
  const [a, b] = ip.split('.').map(Number);
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

/** Lança erro com mensagem amigável se a URL não for HTTPS pública. */
export async function assertPublicHttpsUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('URL inválida.');
  }
  if (url.protocol !== 'https:') throw new Error('Use um endereço https://.');
  if (url.username || url.password) throw new Error('A URL não pode ter usuário e senha.');

  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map((item) => item.address);
  if (addresses.length === 0) throw new Error('Não encontramos esse endereço. Confira a URL.');
  if (addresses.some(isPrivateIp)) throw new Error('Esse endereço aponta para uma rede interna e não é permitido.');
  return url;
}
