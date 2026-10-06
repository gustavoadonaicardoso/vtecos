import { requireActiveProfile } from '@/lib/session';
import { getPost } from '@/services/social.service';
import type { SocialPost, SocialSettings, UserProfile } from '@/types';

export function canManageAllPosts(profile: UserProfile) {
  return profile.role === 'ADMIN' || profile.role === 'MANAGER';
}

/** Admins e gerentes nunca precisam de aprovação; os demais, se a configuração exigir. */
export function needsApproval(profile: UserProfile, settings: SocialSettings) {
  return settings.requireApproval && !canManageAllPosts(profile);
}

/** Sessão ativa + post existe + (é o autor ou é admin/gerente). */
export async function requirePostAccess(
  postId: string
): Promise<{ profile: UserProfile; post: SocialPost; tenantId: string } | { error: { message: string; status: number } }> {
  const auth = await requireActiveProfile({ module: 'social', permission: 'social.view' });
  if ('error' in auth) return auth;

  // Só posts da empresa da sessão.
  const post = await getPost(auth.tenantId, postId);
  if (!post) return { error: { message: 'Post não encontrado.', status: 404 } };

  if (!canManageAllPosts(auth.profile) && post.created_by !== auth.profile.id) {
    return { error: { message: 'Você só pode alterar posts que você criou.', status: 403 } };
  }
  return { profile: auth.profile, post, tenantId: auth.tenantId };
}
