/** Erros de conexão com o servidor de e-mail, em português (os mais comuns). Arquivo puro. */
export function emailErrorMessage(error: unknown, side: 'imap' | 'smtp'): string {
  const err = (error || {}) as { code?: string; responseCode?: number; message?: string; authenticationFailed?: boolean; responseText?: string };
  const where = side === 'imap' ? 'de entrada (IMAP)' : 'de saída (SMTP)';
  if (err.authenticationFailed || err.code === 'EAUTH' || err.responseCode === 535) {
    return `O servidor ${where} recusou usuário ou senha. Confira a senha da caixa (no Gmail, use uma senha de app).`;
  }
  if (err.code === 'ENOTFOUND' || err.code === 'EDNS' || err.code === 'EAI_AGAIN') return `Servidor ${where} não encontrado. Confira o endereço.`;
  if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT' || err.code === 'ECONNECTION' || err.code === 'ESOCKET' || err.code === 'ECONNRESET' || err.code === 'NoConnection') {
    return `Não foi possível conectar ao servidor ${where}. Confira o endereço e a porta.`;
  }
  if (/certificate|self[- ]signed|SSL|TLS|wrong version number/i.test(err.message || '')) return `Problema de segurança (SSL/TLS) no servidor ${where}. Confira a porta (993 e 465 = SSL; 143 e 587 = STARTTLS).`;
  if (err.code === 'EENVELOPE' || err.responseCode === 550 || err.responseCode === 553 || err.responseCode === 554) {
    return `O servidor ${where} recusou o envio: ${(err.responseText || err.message || '').slice(0, 200)}`;
  }
  return `Erro no servidor ${where}: ${(err.responseText || err.message || 'erro desconhecido').slice(0, 200)}`;
}
