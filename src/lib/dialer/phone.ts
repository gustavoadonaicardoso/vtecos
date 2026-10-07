/**
 * Telefone no formato que a Twilio exige (E.164: +5511999998888).
 * Número brasileiro sem código do país ganha o +55; com + ou 00 na
 * frente vale como internacional. Vazio = inválido.
 */
export function toE164(raw: unknown): string {
  const text = String(raw ?? '').trim();
  let digits = text.replace(/\D/g, '');
  if (!digits) return '';
  const international = text.startsWith('+') || digits.startsWith('00');
  if (digits.startsWith('00')) digits = digits.slice(2);
  else if (!international) {
    digits = digits.replace(/^0+/, '');
    if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  }
  if (digits.startsWith('55')) {
    const national = digits.slice(2);
    if ((national.length !== 10 && national.length !== 11) || national.startsWith('0')) return '';
  }
  return digits.length >= 10 && digits.length <= 15 ? `+${digits}` : '';
}

/** +5511999998888 → +55 (11) 99999-8888 (outros países ficam como estão). */
export function formatPhone(e164: string | null | undefined): string {
  const value = String(e164 || '');
  const match = value.match(/^\+55(\d{2})(\d{4,5})(\d{4})$/);
  return match ? `+55 (${match[1]}) ${match[2]}-${match[3]}` : value;
}
