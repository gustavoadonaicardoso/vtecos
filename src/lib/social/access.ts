import { requireActiveProfile } from '@/lib/session';
import { getPost } from '@/services/social.service';
import type { SocialPost, UserProfile } from '@/types';

export function canManageAllPosts(profile: UserProfile) {
  return profile.role === 'ADMIN' || profile.role === 'MANAGER';
}

/** Sessão ativa + post existe + (é o autor ou é admin/gerente). */
export async function requirePostAccess(
  postId: string
): Promise<{ profile: UserProfile; post: SocialPost } | { error: { message: string; status: number } }> {
  const auth = await requireActiveProfile();
  if ('error' in auth) return auth;

  const post = await getPost(postId);
  if (!post) return { error: { message: 'Post não encontrado.', status: 404 } };

  if (!canManageAllPosts(auth.profile) && post.created_by !== auth.profile.id) {
    return { error: { message: 'Você só pode alterar posts que você criou.', status: 403 } };
  }
  return { profile: auth.profile, post };
}
