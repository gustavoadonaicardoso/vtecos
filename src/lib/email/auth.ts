import { requireActiveProfile } from '@/lib/session';

/** Rotas do módulo E-mail: plano com o módulo e a permissão "E-mail" na Equipe. */
export const requireEmailUser = () => requireActiveProfile({ module: 'email', permission: 'email.view' });
