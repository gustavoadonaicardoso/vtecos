import { NextResponse } from 'next/server';
import { logAudit } from '@/lib/audit';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { updateTeamMember, deleteTeamMember } from '@/services/users.service';
import { requireAdminProfile } from '@/lib/session';

const ALLOWED_ROLES = new Set(['ADMIN', 'MANAGER', 'SELLER']);
const ALLOWED_STATUSES = new Set(['ACTIVE', 'INACTIVE']);

/**
 * Atualiza um membro da equipe (nome, e-mail, cargo, status, permissões,
 * templates liberados). Roda com supabaseAdmin -- o navegador nunca tem
 * sessão real do Supabase Auth, então RLS bloquearia esse update se
 * fosse feito direto do cliente com a anon key.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdminProfile();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
    }

    const { id } = await params;
    const body = await request.json();

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const role = typeof body.role === 'string' ? body.role : '';
    const status = typeof body.status === 'string' ? body.status : '';

    if (!name || !email) {
      return NextResponse.json({ error: 'Nome e e-mail são obrigatórios.' }, { status: 400 });
    }
    if (!ALLOWED_ROLES.has(role)) {
      return NextResponse.json({ error: 'Cargo inválido.' }, { status: 400 });
    }
    if (!ALLOWED_STATUSES.has(status)) {
      return NextResponse.json({ error: 'Status inválido.' }, { status: 400 });
    }
    // Ninguém pode alterar o próprio cargo -- evita auto-promoção e evita
    // que um admin se rebaixe por engano e perca acesso ao próprio painel.
    if (id === auth.profile.id && role !== auth.profile.role) {
      return NextResponse.json({ error: 'Você não pode alterar seu próprio cargo.' }, { status: 400 });
    }

    const permissions = body.permissions && typeof body.permissions === 'object' ? body.permissions : {};
    const allowed_templates = Array.isArray(body.allowed_templates) ? body.allowed_templates : [];

    const result = await updateTeamMember(id, { name, email, role, status, permissions, allowed_templates });
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    await logAudit(
      { id: auth.profile.id, name: auth.profile.name },
      'SETTINGS_UPDATE',
      `Atualizou os dados do membro ${name} (${email}).`,
      'profile',
      id,
      supabaseAdmin
    );

    return NextResponse.json({ data: result.data }, { status: 200 });
  } catch (error: unknown) {
    console.error('Update team member error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro interno ao atualizar o membro.' },
      { status: 500 }
    );
  }
}

/**
 * Remove um membro da equipe (perfil + credencial de Auth).
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdminProfile();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
    }

    const { id } = await params;

    if (id === auth.profile.id) {
      return NextResponse.json({ error: 'Você não pode remover sua própria conta.' }, { status: 400 });
    }

    const result = await deleteTeamMember(id);
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    await logAudit(
      { id: auth.profile.id, name: auth.profile.name },
      'SETTINGS_UPDATE',
      `Removeu o membro ${id} da equipe.`,
      'profile',
      id,
      supabaseAdmin
    );

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: unknown) {
    console.error('Delete team member error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro interno ao remover o membro.' },
      { status: 500 }
    );
  }
}
