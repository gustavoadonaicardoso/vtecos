import { requireActiveProfile } from '@/lib/session';

/** Sessão de quem pode usar os Disparos (administrador ou permissão "Chat interno e Disparos"). */
export async function requireCampaignUser() {
  return requireActiveProfile({ module: 'crm', permission: 'messages.send' });
}
