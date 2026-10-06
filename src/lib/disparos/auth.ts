import { requireActiveProfile } from '@/lib/session';
import { canUseCampaigns } from '@/services/disparos.service';

/** Sessão de quem pode usar os Disparos (admin, gerente ou permissão "Chat interno e Disparos"). */
export async function requireCampaignUser() {
  const auth = await requireActiveProfile({ module: 'crm' });
  if ('error' in auth) return auth;
  if (!canUseCampaigns(auth.profile)) return { error: { message: 'Você não tem permissão para usar os Disparos.', status: 403 } };
  return auth;
}
