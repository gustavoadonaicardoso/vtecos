import { supabase } from './supabase';
// Tipo centralizado em @/types
import type { AuditAction } from '@/types';

export type { AuditAction };

let isTableMissing = false;

export async function logAudit(
  user: { id: string; name: string } | null,
  action: AuditAction,
  details: string,
  entityType?: string,
  entityId?: string
) {
  if (!supabase || isTableMissing) return;

  try {
    const { error } = await supabase.from('audit_logs').insert([{
      user_id: user?.id || 'system',
      user_name: user?.name || 'Sistema/Visitante',
      action,
      details,
      entity_type: entityType,
      entity_id: entityId
    }]);

    if (error) {
       // Silenciar se a tabela não existir para não poluir o console do usuário
       if (error.message.includes('audit_logs') || (error as any).code === '42P01') {
         if (!isTableMissing) {
           console.warn('ℹ️ Auditoria desativada: A tabela "audit_logs" ainda não foi criada no seu Supabase.');
           isTableMissing = true;
         }
       } else {
         console.error('Audit Error:', error.message);
       }
    }
  } catch (err) {
    // Falha silenciosa em caso de erro de rede ou conexão
  }
}
