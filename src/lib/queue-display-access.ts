import { requireActiveProfile } from '@/lib/session';

/** A mídia do painel aparece para o público: só admin e gerente configuram. */
export async function requireQueueDisplayManager() {
  const auth = await requireActiveProfile({ module: 'senhas' });
  if ('error' in auth) return auth;
  if (auth.profile.role !== 'ADMIN' && auth.profile.role !== 'MANAGER') {
    return { error: { message: 'Só administradores e gerentes configuram a mídia do painel.', status: 403 } };
  }
  return auth;
}
