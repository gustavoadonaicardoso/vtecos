import { supabase } from './supabase';
// Tipo centralizado em @/types
import type { AuditAction } from '@/types';

export type { AuditAction };

let isTableMissing = false;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function logAudit(
  user: { id: string; name: string } | null,
  action: AuditAction,
  details: string,
  entityType?: string,
  entityId?: string
) {
  if (!supabase || isTableMissing) return;

  try {
    // System/visitor events have no user UUID. audit_logs.user_id is nullable,
    // so null is the correct representation instead of a textual sentinel.
    const userId = user?.id && UUID_PATTERN.test(user.id) ? user.id : null;

    const { error } = await supabase.from('audit_logs').insert([{
      user_id: userId,
      user_name: user?.name || 'Sistema/Visitante',
      action,
      details,
      entity_type: entityType,
      entity_id: entityId
    }]);

    if (error) {
       // Silenciar se a tabela não existir para não poluir o console do usuário
       if (error.message.includes('audit_logs') || error.code === '42P01') {
         if (!isTableMissing) {
           console.warn('ℹ️ Auditoria desativada: A tabela "audit_logs" ainda não foi criada no seu Supabase.');
           isTableMissing = true;
         }
       } else {
         console.error('Audit Error:', error.message);
       }
    }
  } catch {
    // Falha silenciosa em caso de erro de rede ou conexão
  }
}
