/**
 * ============================================================
 * VÓRTICE CRM — Agendador de posts das Redes Sociais
 * ============================================================
 * Roda dentro do próprio processo do Next.js (iniciado pelo
 * src/instrumentation.ts quando o servidor sobe). Mesmo padrão de
 * singleton do whatsapp-web.ts: o estado mora em globalThis, então
 * nunca existem dois loops no mesmo processo.
 *
 * A Graph API não agenda posts do Instagram -- só publica na hora --,
 * então é este loop que segura cada post até o horário marcado.
 * ============================================================
 */

import { claimAndPublishPost, consolidatePostStatus } from '@/lib/social/publisher';
import { getPost, getPostTenant, listDuePostIds, listStuckPublishingPostIds, updateTarget } from '@/services/social.service';

const TICK_INTERVAL_MS = 60_000;
const MAX_POSTS_PER_TICK = 10;
/** Post em "publishing" por mais que isso = o processo caiu no meio. */
const STUCK_AFTER_MINUTES = 15;

type SchedulerRuntime = {
  timer: ReturnType<typeof setInterval> | null;
  running: boolean;
};

const globalRuntime = globalThis as typeof globalThis & {
  __vtecSocialScheduler?: SchedulerRuntime;
};

const runtime = globalRuntime.__vtecSocialScheduler ?? { timer: null, running: false };
globalRuntime.__vtecSocialScheduler = runtime;

export function startSocialScheduler() {
  if (runtime.timer) return;
  runtime.timer = setInterval(() => void tick(), TICK_INTERVAL_MS);
  console.log('[social-scheduler] iniciado (verifica posts agendados a cada 60s)');
  void tick();
}

async function tick() {
  // Um tick lento (Instagram processando imagem) não pode sobrepor o próximo.
  if (runtime.running) return;
  runtime.running = true;
  try {
    await recoverStuckPosts();
    const dueIds = await listDuePostIds(MAX_POSTS_PER_TICK);
    for (const postId of dueIds) {
      await claimAndPublishPost(postId, ['scheduled'], { detectLate: true });
    }
  } catch (err) {
    console.error('[social-scheduler] erro no ciclo:', err);
  } finally {
    runtime.running = false;
  }
}

/**
 * Se o servidor caiu no meio de uma publicação, o post fica preso em
 * "publishing". Não republicamos sozinhos (a rede pode ter recebido o
 * post antes da queda -- republicar duplicaria): marcamos os destinos
 * pendentes como falha e o usuário decide se tenta de novo.
 */
async function recoverStuckPosts() {
  const stuckIds = await listStuckPublishingPostIds(STUCK_AFTER_MINUTES);
  for (const postId of stuckIds) {
    const tenantId = await getPostTenant(postId);
    if (!tenantId) continue;
    const post = await getPost(tenantId, postId);
    if (!post) continue;
    for (const target of post.targets.filter((t) => t.status === 'pending')) {
      await updateTarget(tenantId, target.id, {
        status: 'failed',
        error: 'Publicação interrompida (o servidor reiniciou). Confira na rede antes de tentar de novo.',
      });
    }
    await consolidatePostStatus(tenantId, postId);
  }
}
