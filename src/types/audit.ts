// ─── Auditoria ────────────────────────────────────────────────

export type AuditAction =
  | 'LOGIN'
  | 'LOGOUT'
  | 'LEAD_CREATE'
  | 'LEAD_UPDATE'
  | 'LEAD_DELETE'
  | 'TICKET_CREATE'
  | 'TICKET_CALL'
  | 'TICKET_COMPLETE'
  | 'SETTINGS_UPDATE';

export interface AuditLog {
  user_id: string;
  user_name: string;
  action: AuditAction;
  details: string;
  entity_type?: string;
  entity_id?: string;
}
