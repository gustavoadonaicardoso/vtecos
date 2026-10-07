/**
 * Grava uma mensagem na conversa do lead (chat_messages) com a origem
 * (quem mandou). Se o banco ainda não tem a coluna `origin` (migration
 * 202610210001_reports.sql pendente), grava sem ela -- a conversa nunca
 * deixa de registrar por causa dos relatórios. Server-only.
 */

import { supabaseAdmin } from '@/lib/supabase-admin';

/** Quem mandou: equipe pelo sistema, celular conectado, IA, automação, disparo ou mensagem agendada. */
export type MessageOrigin = 'team' | 'phone' | 'ai' | 'automation' | 'campaign' | 'scheduled';

type ChatRow = { tenant_id: string; lead_id: string; origin?: MessageOrigin } & Record<string, unknown>;

export async function insertChatMessage(row: ChatRow, select?: string): Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }> {
  const run = async (values: Record<string, unknown>) => {
    // tenant-scope: ok (a linha sempre traz tenant_id, exigido pelo tipo ChatRow)
    const query = supabaseAdmin.from('chat_messages').insert(values);
    if (!select) {
      const { error } = await query;
      return { data: null, error };
    }
    const { data, error } = await query.select(select).single();
    return { data: (data as unknown as Record<string, unknown>) ?? null, error };
  };
  const result = await run(row);
  if (result.error && row.origin && /origin/i.test(result.error.message)) {
    const { origin: _origin, ...rest } = row;
    void _origin;
    return run(rest);
  }
  return result;
}
