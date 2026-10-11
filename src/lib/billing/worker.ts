/**
 * ============================================================
 * VTEC OS — Cobrança: conferência periódica no Asaas
 * ============================================================
 * O aviso do Asaas (webhook) atualiza a empresa na hora. Esta rotina é
 * a rede de segurança: confere as atrasadas e os testes a cada 30 min
 * e as em dia uma vez por dia, suspende quem passou da tolerância e
 * reativa quem pagou (mesmo que o aviso tenha se perdido). Também manda
 * os lembretes do teste grátis pelo WhatsApp da Vórtice.
 * Ligada pelo src/instrumentation.ts só na VPS (produção com
 * CONTENT_SCHEDULER_ENABLED=true).
 * ============================================================
 */

import { beat } from '@/lib/heartbeat';
import { asaasReady } from '@/lib/asaas';
import { runBillingCycle } from '@/services/billing.service';
import { runTrialMessages } from '@/services/trial-messages.service';

const log = (...args: unknown[]) => console.log('[cobranca]', ...args);

type WorkerState = { timer: ReturnType<typeof setInterval> | null; running: boolean };
const globalState = globalThis as typeof globalThis & { __vtecBillingWorker?: WorkerState };
const worker = globalState.__vtecBillingWorker ?? { timer: null, running: false };
globalState.__vtecBillingWorker = worker;

export function startBillingWorker() {
  if (worker.timer) return;
  const run = async () => {
    if (worker.running) return;
    worker.running = true;
    try {
      if (await asaasReady()) {
        const result = await runBillingCycle();
        if (result.checked) log(`conferidas ${result.checked} empresa(s)${result.failed ? `, ${result.failed} com erro` : ''}`);
        // Lembretes do teste grátis pelo WhatsApp da Vórtice (depois da conferência: status já atualizado).
        const messages = await runTrialMessages().catch((error) => {
          log('erro nos lembretes do teste grátis', error);
          return null;
        });
        if (messages?.sent.length) log(`lembretes do teste enviados: ${messages.sent.length}`);
      }
      beat('cobranca');
    } catch (error) {
      log('erro na rotina de cobrança', error);
      beat('cobranca', error);
    } finally {
      worker.running = false;
    }
  };
  worker.timer = setInterval(() => void run(), 5 * 60_000);
  log('conferência da cobrança ligada (a cada 5 min)');
  void run();
}
