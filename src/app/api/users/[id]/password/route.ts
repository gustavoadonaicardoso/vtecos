import { NextResponse } from 'next/server';
import { logAudit } from '@/lib/audit';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { adminResetPassword } from '@/services/users.service';
import { requireAdminProfile } from '@/lib/session';

/**
 * Define uma nova senha para um membro da equipe SEM exigir a senha
 * atual -- para casos de esquecimento. Só administradores ativos podem
 * chamar essa rota, e ela roda inteiramente no servidor com
 * supabaseAdmin.auth.admin.updateUserById (nunca exposto ao navegador).
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdminProfile();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
    }

    const { id } = await params;
    const body = await request.json();
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';

    if (newPassword.length < 8) {
      return NextResponse.json({ error: 'A nova senha deve ter pelo menos 8 caracteres.' }, { status: 400 });
    }

    const result = await adminResetPassword(auth.tenantId, id, newPassword);
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    await logAudit(
      { id: auth.profile.id, name: auth.profile.name },
      'SETTINGS_UPDATE',
      `Redefiniu a senha do membro ${id} sem exigir a senha atual.`,
      'profile',
      id,
      supabaseAdmin,
      auth.tenantId
    );

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: unknown) {
    console.error('Admin reset password error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro interno ao redefinir a senha.' },
      { status: 500 }
    );
  }
}
