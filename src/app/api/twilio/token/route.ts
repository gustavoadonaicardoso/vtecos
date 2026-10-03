import { NextResponse } from 'next/server';
import { twilioIdentity, twilioService } from '@/services/twilio.service';
import { requireActiveProfile } from '@/lib/session';

/**
 * Antes: qualquer requisição não autenticada podia pedir um token de
 * chamada Twilio pra qualquer "identity" que quisesse -- ligações
 * feitas com esse token são cobradas na conta Twilio do cliente
 * (fraude de ligação). Agora exige sessão e usa sempre a identidade
 * real do usuário logado, nunca uma vinda da query string.
 *
 * Usa o nome do perfil (não o id) porque o discador identifica/transfere
 * chamadas entre agentes pelo nome (ver src/app/discador/page.tsx) --
 * mudar o formato quebraria a transferência entre agentes.
 */
export async function GET() {
  try {
    const auth = await requireActiveProfile({ module: 'crm' });
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
    }

    const identity = twilioIdentity(auth.profile.id);
    const token = twilioService.generateToken(identity);

    return NextResponse.json({ token, identity });
  } catch (error: unknown) {
    console.error('Twilio Token Error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erro interno.' }, { status: 500 });
  }
}
