import { NextResponse } from 'next/server';
import { logAudit } from '@/lib/audit';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireActiveProfile } from '@/lib/session';

// Até 5 chamados por pessoa por hora (memória do processo).
const recent = new Map<string, number[]>();

/**
 * POST { subject, message }: abre um chamado de suporte. Os
 * administradores da Vórtice recebem o aviso no sino com quem pediu,
 * de qual empresa e o texto.
 */
export async function POST(request: Request) {
  const auth = await requireActiveProfile();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });

  const body = await request.json().catch(() => ({}));
  const subject = typeof body.subject === 'string' ? body.subject.trim().slice(0, 120) : '';
  const message = typeof body.message === 'string' ? body.message.trim().slice(0, 2000) : '';
  if (!subject || message.length < 10) {
    return NextResponse.json({ error: 'Informe o assunto e descreva o problema (pelo menos 10 caracteres).' }, { status: 400 });
  }

  const now = Date.now();
  const hits = (recent.get(auth.profile.id) || []).filter((at) => now - at < 60 * 60 * 1000);
  if (hits.length >= 5) return NextResponse.json({ error: 'Você já abriu vários chamados na última hora. Aguarde o retorno da equipe.' }, { status: 429 });
  recent.set(auth.profile.id, [...hits, now]);

  // tenant-scope: ok (o chamado vai para a equipe da empresa da plataforma)
  const { data: platform } = await supabaseAdmin.from('tenants').select('id').eq('is_platform', true).maybeSingle();
  const { data: admins } = platform
    ? await supabaseAdmin.from('profiles').select('id').eq('tenant_id', platform.id).eq('role', 'ADMIN').eq('status', 'ACTIVE')
    : { data: [] as { id: string }[] };

  if (!admins || admins.length === 0) {
    return NextResponse.json({ error: 'Não há ninguém da Vórtice para receber o chamado agora. Use o WhatsApp ou o e-mail de suporte.' }, { status: 503 });
  }

  const company = auth.tenantName ? ` (${auth.tenantName})` : '';
  const { error } = await supabaseAdmin.from('system_notifications').insert(admins.map((admin) => ({
    user_id: admin.id,
    type: 'task',
    title: `Chamado de suporte: ${subject}`,
    content: `${auth.profile.name} <${auth.profile.email}>${company}: ${message}`,
    is_read: false,
    link: '/notificacoes',
  })));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit(
    { id: auth.profile.id, name: auth.profile.name },
    'SETTINGS_UPDATE',
    `Abriu um chamado de suporte: ${subject}`,
    'support',
    auth.profile.id,
    supabaseAdmin,
    auth.tenantId
  );

  return NextResponse.json({ success: true });
}
