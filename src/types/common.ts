// ─── Utilitários ──────────────────────────────────────────────

/** Resultado padrão para operações assíncronas */
export interface ServiceResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}
