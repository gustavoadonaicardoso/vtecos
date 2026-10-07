import { NextResponse } from 'next/server';
import { logAudit } from '@/lib/audit';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { findProfileByEmail, notifyAdminsOfPasswordResetRequest } from '@/services/users.service';
import { clientIp } from '@/lib/rate-limit';

// Mesma resposta exista ou não o e-mail: a tela pública de "Esqueci a
// senha" não pode servir para descobrir quem tem conta no sistema.
const GENERIC_MESSAGE = 'Se o e-mail estiver cadastrado, os administradores da empresa foram avisados para definir uma nova senha.';

// Um pedido por e-mail a cada 10 minutos (e no máximo 10 por IP), para
// ninguém lotar o sino dos administradores. Memória do processo: basta
// para um servidor só (VPS com PM2).
const WINDOW_MS = 10 * 60 * 1000;
const recentByEmail = new Map<string, number>();
const recentByIp = new Map<string, number[]>();

function throttled(email: string, ip: string) {
  const now = Date.now();
  for (const [key, at] of recentByEmail) if (now - at > WINDOW_MS) recentByEmail.delete(key);

  const ipHits = (recentByIp.get(ip) || []).filter((at) => now - at < WINDOW_MS);
  if (ipHits.length >= 10) return true;
  recentByIp.set(ip, [...ipHits, now]);

  if (recentByEmail.has(email)) return true;
  recentByEmail.set(email, now);
  return false;
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Informe um e-mail válido.' }, { status: 400 });
    }

    const ip = clientIp(request);
    if (throttled(email, ip)) {
      return NextResponse.json({ success: true, message: GENERIC_MESSAGE });
    }

    const userProfile = await findProfileByEmail(email);
    if (userProfile) {
      await notifyAdminsOfPasswordResetRequest(userProfile);
      await logAudit(
        { id: userProfile.id, name: userProfile.name },
        'SETTINGS_UPDATE',
        'Pediu uma nova senha aos administradores (tela de login).',
        'profile',
        userProfile.id,
        supabaseAdmin,
        userProfile.tenant_id
      );
    }

    return NextResponse.json({ success: true, message: GENERIC_MESSAGE });
  } catch (error: unknown) {
    console.error('Reset password error:', error);
    return NextResponse.json({ error: 'Não foi possível enviar o pedido agora. Tente de novo em instantes.' }, { status: 500 });
  }
}
