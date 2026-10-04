import { NextResponse } from 'next/server';
import { requireActiveProfile } from '@/lib/session';
import { fetchHelpContent } from '@/services/help.service';
import { fetchSalesContact } from '@/services/plans.service';

// GET: conteúdo publicado da Central de Ajuda + contato da Vórtice.
export async function GET() {
  const auth = await requireActiveProfile();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });

  try {
    const [content, contact] = await Promise.all([fetchHelpContent(), fetchSalesContact()]);
    return NextResponse.json({ data: { ...content, contact } });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erro ao carregar a ajuda.' }, { status: 500 });
  }
}
