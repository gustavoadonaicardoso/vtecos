/**
 * Provedores de e-mail com os endereços já preenchidos (tela "Conectar
 * caixa"). "Outro" deixa a pessoa digitar. Arquivo puro.
 */

export interface EmailPreset {
  key: string;
  label: string;
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  /** Dica que aparece na tela (ex.: senha de app). */
  hint: string;
}

export const EMAIL_PRESETS: EmailPreset[] = [
  { key: 'hostinger', label: 'Hostinger', imapHost: 'imap.hostinger.com', imapPort: 993, smtpHost: 'smtp.hostinger.com', smtpPort: 465, hint: 'Use o e-mail completo e a senha da caixa (hPanel > E-mails).' },
  { key: 'titan', label: 'Titan (HostGator e outros)', imapHost: 'imap.titan.email', imapPort: 993, smtpHost: 'smtp.titan.email', smtpPort: 465, hint: 'Use o e-mail completo e a senha da caixa.' },
  { key: 'gmail', label: 'Gmail / Google Workspace', imapHost: 'imap.gmail.com', imapPort: 993, smtpHost: 'smtp.gmail.com', smtpPort: 465, hint: 'Use uma senha de app (Conta Google > Segurança > Senhas de app), não a senha normal.' },
  { key: 'zoho', label: 'Zoho Mail', imapHost: 'imap.zoho.com', imapPort: 993, smtpHost: 'smtp.zoho.com', smtpPort: 465, hint: 'Ative o acesso IMAP nas configurações do Zoho. O plano grátis não permite IMAP/SMTP.' },
  { key: 'locaweb', label: 'Locaweb', imapHost: 'email-ssl.com.br', imapPort: 993, smtpHost: 'email-ssl.com.br', smtpPort: 465, hint: 'Use o e-mail completo e a senha da caixa.' },
  { key: 'custom', label: 'Outro provedor', imapHost: '', imapPort: 993, smtpHost: '', smtpPort: 465, hint: 'Os endereços IMAP e SMTP ficam na central de ajuda do seu provedor de e-mail.' },
];

/** Porta 993/465 = conexão segura direta; 143/587 = STARTTLS. */
export const secureForPort = (port: number) => port === 993 || port === 465;
