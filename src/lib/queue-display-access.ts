import { requireActiveProfile } from '@/lib/session';

/** Configurações da fila (aparecem para o público): só admin e gerente mexem. */
export async function requireQueueManager(message = 'Só administradores e gerentes alteram as configurações da fila.') {
  const auth = await requireActiveProfile({ module: 'senhas', permission: 'integrations.view' });
  if ('error' in auth) return auth;
  if (auth.profile.role !== 'ADMIN' && auth.profile.role !== 'MANAGER') {
    return { error: { message, status: 403 } };
  }
  return auth;
}

/** A mídia do painel aparece para o público: só admin e gerente configuram. */
export const requireQueueDisplayManager = () => requireQueueManager('Só administradores e gerentes configuram a mídia do painel.');
