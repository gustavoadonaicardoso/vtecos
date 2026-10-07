/**
 * Contador de tentativas em memória (um servidor só: VPS com PM2).
 * Usado onde não dá para depender do limite de outro serviço, como o
 * login: o Supabase vê todas as tentativas vindo do IP da VPS.
 */

type Bucket = { hits: number[] };

export function createLimiter(options: { windowMs: number; max: number }) {
  const buckets = new Map<string, Bucket>();

  const prune = (bucket: Bucket, now: number) => {
    bucket.hits = bucket.hits.filter((at) => now - at < options.windowMs);
  };

  return {
    /** Já passou do limite? (não conta uma tentativa nova) */
    blocked(key: string): { blocked: boolean; retryInMs: number } {
      const bucket = buckets.get(key);
      if (!bucket) return { blocked: false, retryInMs: 0 };
      const now = Date.now();
      prune(bucket, now);
      if (bucket.hits.length < options.max) return { blocked: false, retryInMs: 0 };
      return { blocked: true, retryInMs: Math.max(0, options.windowMs - (now - bucket.hits[0])) };
    },
    /** Conta uma tentativa. */
    hit(key: string) {
      const now = Date.now();
      const bucket = buckets.get(key) || { hits: [] };
      prune(bucket, now);
      bucket.hits.push(now);
      buckets.set(key, bucket);
      // Limpeza ocasional para o mapa não crescer para sempre.
      if (buckets.size > 5000) {
        for (const [entry, value] of buckets) {
          prune(value, now);
          if (value.hits.length === 0) buckets.delete(entry);
        }
      }
    },
    reset(key: string) {
      buckets.delete(key);
    },
  };
}

/**
 * IP de quem chamou. Atrás do Nginx, ele precisa SOBRESCREVER esses
 * cabeçalhos com $remote_addr (ver README, "Configurar Nginx"); senão quem
 * chama pode inventar o próprio IP.
 */
export function clientIp(request: Request) {
  return request.headers.get('x-real-ip')?.trim() || request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'local';
}
