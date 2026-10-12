/**
 * ============================================================
 * VTEC OS — Campos extras do lead
 * ============================================================
 * Além de nome, telefone, e-mail e CPF/CNPJ, o lead tem:
 *  - Acesso: e-mail de acesso (pode ser diferente do e-mail do lead),
 *    usuário, senha (guardada à parte, só o servidor lê) e link;
 *  - Dados pessoais: nascimento, empresa do cliente, cargo, Instagram, site;
 *  - Endereço: CEP, rua, número, complemento, bairro, cidade, UF;
 *  - Campos personalizados que cada empresa cria (Leads > Campos).
 * Tudo vira variável nas automações, agendamentos, disparos e respostas
 * rápidas ({{email_acesso}}, {{senha_acesso}}, {{campo.matricula}}...).
 * Arquivo puro: usado no navegador e no servidor.
 * ============================================================
 */

export type ExtraFieldKey =
  | 'accessEmail'
  | 'accessLogin'
  | 'accessUrl'
  | 'birthDate'
  | 'companyName'
  | 'jobTitle'
  | 'instagram'
  | 'website'
  | 'cep'
  | 'street'
  | 'number'
  | 'complement'
  | 'district'
  | 'city'
  | 'state';

export type ExtraGroup = 'access' | 'personal' | 'address';

export interface ExtraFieldInfo {
  key: ExtraFieldKey;
  /** Coluna em leads. */
  column: string;
  label: string;
  group: ExtraGroup;
  max: number;
  placeholder?: string;
  input?: 'email' | 'url' | 'date' | 'tel' | 'text';
}

export const EXTRA_FIELDS: ExtraFieldInfo[] = [
  { key: 'accessEmail', column: 'access_email', label: 'E-mail de acesso', group: 'access', max: 160, input: 'email', placeholder: 'Se vazio, usa o e-mail do lead' },
  { key: 'accessLogin', column: 'access_login', label: 'Usuário / login', group: 'access', max: 120, placeholder: 'Ex.: ana.souza' },
  { key: 'accessUrl', column: 'access_url', label: 'Link de acesso', group: 'access', max: 300, input: 'url', placeholder: 'https://...' },
  { key: 'birthDate', column: 'birth_date', label: 'Data de nascimento', group: 'personal', max: 10, input: 'date' },
  { key: 'companyName', column: 'company_name', label: 'Empresa do cliente', group: 'personal', max: 120 },
  { key: 'jobTitle', column: 'job_title', label: 'Cargo', group: 'personal', max: 80 },
  { key: 'instagram', column: 'instagram', label: 'Instagram', group: 'personal', max: 60, placeholder: '@usuario' },
  { key: 'website', column: 'website', label: 'Site', group: 'personal', max: 200, input: 'url' },
  { key: 'cep', column: 'address_cep', label: 'CEP', group: 'address', max: 9, input: 'tel', placeholder: '00000-000' },
  { key: 'street', column: 'address_street', label: 'Rua', group: 'address', max: 160 },
  { key: 'number', column: 'address_number', label: 'Número', group: 'address', max: 20 },
  { key: 'complement', column: 'address_complement', label: 'Complemento', group: 'address', max: 80 },
  { key: 'district', column: 'address_district', label: 'Bairro', group: 'address', max: 80 },
  { key: 'city', column: 'address_city', label: 'Cidade', group: 'address', max: 80 },
  { key: 'state', column: 'address_state', label: 'UF', group: 'address', max: 2, placeholder: 'SP' },
];

export const EXTRA_GROUP_LABEL: Record<ExtraGroup, string> = {
  access: 'Acesso',
  personal: 'Dados pessoais',
  address: 'Endereço',
};

export type LeadExtra = Partial<Record<ExtraFieldKey, string>>;

export const ACCESS_PASSWORD_MAX = 120;

/** Linha do banco → { accessEmail, city... }, só as preenchidas. */
export function extraOf(row: Record<string, unknown>): LeadExtra {
  const extra: LeadExtra = {};
  for (const field of EXTRA_FIELDS) {
    const value = row[field.column];
    if (value !== null && value !== undefined && String(value) !== '') extra[field.key] = String(value).slice(0, field.max);
  }
  return extra;
}

// ── Campos personalizados ───────────────────────────────────────

export type CustomFieldType = 'text' | 'number' | 'date' | 'url';

export interface CustomFieldDef {
  key: string;
  label: string;
  type: CustomFieldType;
  position: number;
}

export const CUSTOM_FIELD_TYPES: { value: CustomFieldType; label: string }[] = [
  { value: 'text', label: 'Texto' },
  { value: 'number', label: 'Número' },
  { value: 'date', label: 'Data' },
  { value: 'url', label: 'Link' },
];

export const MAX_CUSTOM_FIELDS = 30;
export const CUSTOM_VALUE_MAX = 500;

/** "Nº da matrícula" → "n_da_matricula" (nome da variável {{campo.n_da_matricula}}). */
export function customFieldKey(label: string) {
  return label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

// ── Formatos ────────────────────────────────────────────────────

const digits = (value: string) => value.replace(/\D/g, '');

/** dd/mm/aaaa ou aaaa-mm-dd → aaaa-mm-dd (vazio se inválida). */
export function parseDate(value: string): string | null {
  const text = value.trim();
  if (!text) return '';
  let match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  let iso = match ? `${match[1]}-${match[2]}-${match[3]}` : '';
  if (!iso) {
    match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (match) iso = `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
  }
  if (!iso) return null;
  const date = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso ? null : iso;
}

export const brDate = (iso: string) => (/^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso);

/** Valida e limpa um campo extra. Erro = texto para a pessoa. */
export function cleanExtra(key: ExtraFieldKey, raw: unknown): { value: string | null } | { error: string } {
  const info = EXTRA_FIELDS.find((field) => field.key === key)!;
  let value = String(raw ?? '').trim();
  if (!value) return { value: null };
  switch (key) {
    case 'accessEmail':
      value = value.toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return { error: 'E-mail de acesso inválido.' };
      break;
    case 'birthDate': {
      const iso = parseDate(value);
      if (!iso) return { error: 'Data de nascimento inválida (use dd/mm/aaaa).' };
      if (iso > new Date().toISOString().slice(0, 10) || iso < '1900-01-01') return { error: 'Data de nascimento fora do intervalo.' };
      value = iso;
      break;
    }
    case 'cep': {
      const d = digits(value);
      if (d.length !== 8) return { error: 'CEP precisa ter 8 números.' };
      value = `${d.slice(0, 5)}-${d.slice(5)}`;
      break;
    }
    case 'state':
      value = value.toUpperCase();
      if (!/^[A-Z]{2}$/.test(value)) return { error: 'UF precisa ter 2 letras (ex.: SP).' };
      break;
    case 'instagram':
      value = value.replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/[/?#].*$/, '').replace(/^@+/, '');
      if (!/^[\w.]{1,30}$/.test(value)) return { error: 'Instagram inválido.' };
      value = `@${value}`;
      break;
    case 'accessUrl':
    case 'website':
      if (/\s/.test(value)) return { error: `${info.label}: o link não pode ter espaços.` };
      if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
      break;
  }
  return { value: value.slice(0, info.max) };
}

export function cleanCustomValue(def: CustomFieldDef, raw: unknown): { value: string | null } | { error: string } {
  const value = String(raw ?? '').trim().slice(0, CUSTOM_VALUE_MAX);
  if (!value) return { value: null };
  if (def.type === 'number') {
    const parsed = Number(value.replace(/\./g, '').replace(',', '.'));
    if (!Number.isFinite(parsed)) return { error: `${def.label}: informe um número.` };
    return { value: String(parsed) };
  }
  if (def.type === 'date') {
    const iso = parseDate(value);
    if (!iso) return { error: `${def.label}: data inválida (use dd/mm/aaaa).` };
    return { value: iso };
  }
  if (def.type === 'url') return { value: /^https?:\/\//i.test(value) ? value : `https://${value}` };
  return { value };
}

/** Rua, número - complemento, bairro, cidade/UF, CEP (só o que estiver preenchido). */
export function formatAddress(extra: LeadExtra) {
  const line1 = [extra.street, extra.number].filter(Boolean).join(', ') + (extra.complement ? ` - ${extra.complement}` : '');
  const place = [extra.city, extra.state].filter(Boolean).join('/');
  return [line1, extra.district, place, extra.cep].filter((part) => part && part.trim()).join(', ');
}

export function ageOn(birthIso: string | undefined, now: Date) {
  if (!birthIso || !/^\d{4}-\d{2}-\d{2}$/.test(birthIso)) return '';
  const [y, m, d] = birthIso.split('-').map(Number);
  const today = now.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }).split('-').map(Number);
  let age = today[0] - y;
  if (today[1] < m || (today[1] === m && today[2] < d)) age--;
  return age >= 0 ? String(age) : '';
}

/** Senha fácil de ditar: sem letras parecidas (0/O, 1/l/I). */
const secureRandom = (max: number) => {
  const buffer = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buffer);
  return buffer[0] % max;
};

export function generatePassword(length = 10, random: (max: number) => number = secureRandom) {
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const upper = 'ABCDEFGHJKMNPQRSTUVWXYZ';
  const nums = '23456789';
  const all = lower + upper + nums;
  const chars = [upper[random(upper.length)], lower[random(lower.length)], nums[random(nums.length)]];
  while (chars.length < length) chars.push(all[random(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = random(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}
