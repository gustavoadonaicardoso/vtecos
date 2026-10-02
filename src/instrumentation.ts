/**
 * Executado uma vez quando o servidor Next.js sobe.
 *
 * O agendador de posts das Redes Sociais só liga em produção E com a
 * flag explícita -- assim ele roda na VPS (que recebe o .env.local pelo
 * deploy.sh), mas nunca no `npm run dev` local nem nos previews da
 * Vercel, que publicariam posts de verdade.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.NODE_ENV !== 'production') return;
  if (process.env.CONTENT_SCHEDULER_ENABLED !== 'true') return;

  const { startSocialScheduler } = await import('./lib/social/scheduler');
  startSocialScheduler();
}
