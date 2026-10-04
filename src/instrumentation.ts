/**
 * Executado uma vez quando o servidor Next.js sobe.
 *
 * Os agendadores (posts das Redes Sociais e esperas das Automações) só ligam em produção E com a
 * flag explícita -- assim ele roda na VPS (que recebe o .env.local pelo
 * deploy.sh), mas nunca no `npm run dev` local nem nos previews da
 * Vercel, que publicariam posts de verdade.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.NODE_ENV !== 'production') return;

  // WhatsApp Web: religa as sessões já pareadas de cada empresa.
  if (process.env.WHATSAPP_WEB_AUTOSTART !== 'false') {
    const { resumeSavedWhatsAppSessions } = await import('./lib/whatsapp-web');
    resumeSavedWhatsAppSessions().catch((error) => console.error('[whatsapp-web] Falha ao religar sessões:', error));
  }

  if (process.env.CONTENT_SCHEDULER_ENABLED !== 'true') return;

  const { startSocialScheduler } = await import('./lib/social/scheduler');
  startSocialScheduler();

  // Automações: retoma as esperas (bloco Aguardar e perguntas sem resposta).
  const { startAutomationScheduler } = await import('./lib/automations/engine');
  startAutomationScheduler();
}
