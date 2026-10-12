/**
 * ============================================================
 * VTEC OS — Achar o lead pelo telefone (server-only)
 * ============================================================
 * Compara só os 8 últimos dígitos: "(11) 98888-7777", "11988887777",
 * "5511988887777" e "551188887777" (sem o nono dígito) são o mesmo
 * contato. Usa a coluna leads.phone_key (migration 202611060001); sem
 * ela, busca pelos 4 últimos dígitos e confere no código.
 * Mais de um lead com o mesmo número: o mais antigo (o original) vem
 * primeiro.
 * ============================================================
 */

type Db = { from: (table: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
type Row = Record<string, unknown>;

export const phoneKey = (phone: unknown) => String(phone ?? '').replace(/\D/g, '').slice(-8);

export async function findLeadsByPhone<T extends Row = Row>(db: Db, tenantId: string, phone: unknown, select = 'id, name, phone', limit = 5): Promise<T[]> {
  const key = phoneKey(phone);
  if (key.length < 8) return [];
  const fields = select.includes('created_at') || select === '*' ? select : `${select}, created_at`;
  const { data, error } = await db.from('leads').select(fields).eq('tenant_id', tenantId).eq('phone_key', key).order('created_at', { ascending: true }).limit(limit);
  if (!error) return (data || []) as T[];
  // Banco sem a coluna phone_key: busca larga pelos 4 últimos dígitos e confere os 8.
  const { data: wide } = await db.from('leads').select(fields).eq('tenant_id', tenantId).ilike('phone', `%${key.slice(-4)}%`).order('created_at', { ascending: true }).limit(500);
  return ((wide || []) as T[]).filter((row) => phoneKey(row.phone) === key).slice(0, limit);
}

export async function findLeadByPhone<T extends Row = Row>(db: Db, tenantId: string, phone: unknown, select = 'id, name, phone'): Promise<T | null> {
  return (await findLeadsByPhone<T>(db, tenantId, phone, select, 1))[0] ?? null;
}
