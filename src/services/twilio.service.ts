/**
 * Identidade do usuário no Twilio Client: o id do perfil (único no sistema
 * todo). Antes era o nome, que se repete entre empresas e não permitia
 * saber de quem/de qual empresa era a ligação.
 * As chamadas em si usam a conta Twilio de cada empresa: ver
 * src/lib/twilio-tenant.ts.
 */
export function twilioIdentity(profileId: string) {
  return `u_${profileId.replace(/-/g, '')}`;
}

export function profileIdFromTwilioIdentity(identity: string | null | undefined) {
  const match = (identity || '').replace(/^client:/, '').match(/^u_([0-9a-f]{32})$/i);
  if (!match) return null;
  const hex = match[1];
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
