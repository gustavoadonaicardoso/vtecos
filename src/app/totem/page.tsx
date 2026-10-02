'use client';

import { useEffect, useState, FormEvent } from 'react';
import { CheckCircle2, IdCard, Phone, ShieldCheck, Ticket, User } from 'lucide-react';
import styles from './totem.module.css';
import { logAudit } from '@/lib/audit';
import { sendWhatsApp } from '@/lib/messaging';
import {
  formatBrazilDocument,
  formatBrazilPhone,
  normalizeBrazilPhone,
  parseBrazilDocumentInput,
  parseBrazilPhoneInput,
  validateBrazilDocument,
  validateBrazilPhone,
} from '@/lib/brazilian-fields';

/** Depois de mostrar a senha, o totem volta sozinho para o próximo cliente. */
const AUTO_RESET_SECONDS = 15;

export default function TotemPage() {
  const [name, setName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [document, setDocument] = useState('');
  const [issuedTicket, setIssuedTicket] = useState<number | null>(null);
  const [sentToWhatsapp, setSentToWhatsapp] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState(AUTO_RESET_SECONDS);

  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(timer);
  }, []);

  const handleReset = () => {
    setIssuedTicket(null);
    setSentToWhatsapp(false);
    setName('');
    setWhatsapp('');
    setDocument('');
    setError('');
  };

  // Contagem regressiva da tela de sucesso.
  useEffect(() => {
    if (issuedTicket === null) return;
    setCountdown(AUTO_RESET_SECONDS);
    const timer = setInterval(() => {
      setCountdown((value) => {
        if (value <= 1) {
          clearInterval(timer);
          handleReset();
          return AUTO_RESET_SECONDS;
        }
        return value - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [issuedTicket]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    setError('');

    if (!name.trim()) {
      setError('Informe seu nome completo.');
      return;
    }

    const validationError = validateBrazilPhone(whatsapp) || validateBrazilDocument(document);
    if (validationError) {
      setError(validationError);
      return;
    }

    const normalizedWhatsapp = normalizeBrazilPhone(whatsapp);
    const normalizedDocument = parseBrazilDocumentInput(document);

    setIsLoading(true);
    try {
      // A senha e o lead (nome, WhatsApp e documento) são gravados juntos no servidor.
      const response = await fetch('/api/queue/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, whatsapp: normalizedWhatsapp, document: normalizedDocument, origin: 'totem' }),
      });
      const result: { number?: number; error?: string } = await response.json();

      if (!response.ok || typeof result.number !== 'number') {
        throw new Error(result.error || 'Não foi possível gerar a senha.');
      }

      const nextNumber = result.number;
      setIssuedTicket(nextNumber);

      if (normalizedWhatsapp) {
        setSentToWhatsapp(true);
        sendWhatsApp(
          normalizedWhatsapp,
          `🌟 *Vórtice Tecnologia* 🌟\n\nSua senha foi retirada com sucesso!\n\nSenha: *#${nextNumber.toString().padStart(2, '0')}*\nCliente: *${name.trim()}*\n\nAcompanhe o painel. Você será chamado em breve!`
        );
      }

      logAudit(null, 'TICKET_CREATE', `Nova senha #${nextNumber} gerada via Totem para ${name.trim()}.`, 'ticket', nextNumber.toString());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro de conexão. Tente de novo.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <header className={styles.topBar}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/vortice-logo.png" alt="Vórtice Tecnologia" className={styles.logo} />
        <div className={styles.clock}>
          {now && (
            <>
              <strong>{now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</strong>
              <span>{now.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}</span>
            </>
          )}
        </div>
      </header>

      <main className={styles.card}>
        {issuedTicket === null ? (
          <>
            <span className={styles.eyebrow}><Ticket size={16} /> Atendimento presencial</span>
            <h1 className={styles.title}>Retire sua senha</h1>
            <p className={styles.subtitle}>Preencha seus dados e acompanhe o painel para ser chamado.</p>

            <form onSubmit={handleSubmit} className={styles.form} noValidate>
              <label className={styles.field} htmlFor="totem-name">
                <span className={styles.label}>Nome completo</span>
                <span className={styles.inputWrap}>
                  <User size={22} />
                  <input
                    id="totem-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Digite seu nome"
                    autoComplete="name"
                    autoFocus
                  />
                </span>
              </label>

              <div className={styles.gridFields}>
                <label className={styles.field} htmlFor="totem-whatsapp">
                  <span className={styles.label}>WhatsApp <small>(opcional)</small></span>
                  <span className={styles.inputWrap}>
                    <Phone size={22} />
                    <input
                      id="totem-whatsapp"
                      type="tel"
                      value={formatBrazilPhone(whatsapp)}
                      onChange={(e) => setWhatsapp(parseBrazilPhoneInput(e.target.value))}
                      placeholder="(00) 90000-0000"
                      inputMode="numeric"
                      autoComplete="tel-national"
                      maxLength={19}
                    />
                  </span>
                  <small className={styles.hint}>Enviamos sua senha por WhatsApp.</small>
                </label>

                <label className={styles.field} htmlFor="totem-document">
                  <span className={styles.label}>CPF ou RG <small>(opcional)</small></span>
                  <span className={styles.inputWrap}>
                    <IdCard size={22} />
                    <input
                      id="totem-document"
                      type="text"
                      value={formatBrazilDocument(document)}
                      onChange={(e) => setDocument(parseBrazilDocumentInput(e.target.value))}
                      placeholder="Somente números"
                      inputMode="numeric"
                      autoComplete="off"
                      maxLength={14}
                    />
                  </span>
                  <small className={styles.hint}>CPF com 11 dígitos ou RG.</small>
                </label>
              </div>

              {error && <div className={styles.error} role="alert">{error}</div>}

              <button type="submit" className={styles.submitBtn} disabled={isLoading}>
                {isLoading ? 'Gerando sua senha…' : 'Retirar minha senha'}
              </button>

              <p className={styles.privacy}>
                <ShieldCheck size={15} /> Seus dados são usados apenas para o seu atendimento.
              </p>
            </form>
          </>
        ) : (
          <div className={styles.success}>
            <CheckCircle2 size={64} className={styles.successIcon} />
            <h1 className={styles.title}>Senha gerada!</h1>
            <div className={styles.ticketBox}>
              <span>Sua senha</span>
              <strong>{issuedTicket.toString().padStart(2, '0')}</strong>
            </div>
            <p className={styles.subtitle}>
              Aguarde ser chamado no painel.
              {sentToWhatsapp && <><br />Também enviamos a senha para o seu WhatsApp.</>}
            </p>
            <button type="button" className={styles.submitBtn} onClick={handleReset}>Concluir</button>
            <div className={styles.countdown}>
              <div className={styles.countdownBar} style={{ width: `${(countdown / AUTO_RESET_SECONDS) * 100}%` }} />
            </div>
            <small className={styles.hint}>Voltando ao início em {countdown}s</small>
          </div>
        )}
      </main>

      <footer className={styles.footer}>Vórtice Tecnologia · Atendimento</footer>
    </div>
  );
}
