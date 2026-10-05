'use client';

import { useEffect, useState, FormEvent, type CSSProperties } from 'react';
import { Accessibility, ArrowLeft, CheckCircle2, IdCard, Phone, ShieldCheck, Ticket, User, Users } from 'lucide-react';
import styles from './totem.module.css';
import {
  formatBrazilDocument,
  formatBrazilPhone,
  normalizeBrazilPhone,
  parseBrazilDocumentInput,
  parseBrazilPhoneInput,
  validateBrazilDocument,
  validateBrazilPhone,
} from '@/lib/brazilian-fields';
import { ticketCode } from '@/lib/queue';

/** Depois de mostrar a senha, o totem volta sozinho para o próximo cliente. */
const AUTO_RESET_SECONDS = 15;

export default function TotemPage() {
  const [name, setName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [document, setDocument] = useState('');
  const [issuedTicket, setIssuedTicket] = useState<{ number: number; priority: boolean; ahead: number } | null>(null);
  // Normal ou preferencial (a tela de escolha só aparece se a empresa usa preferencial).
  const [kind, setKind] = useState<'normal' | 'priority' | null>(null);
  const [priorityEnabled, setPriorityEnabled] = useState(false);
  const [logoUrl, setLogoUrl] = useState('');
  const [brandColor, setBrandColor] = useState('');
  const [sentToWhatsapp, setSentToWhatsapp] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState(AUTO_RESET_SECONDS);
  // Chave da empresa na URL (/totem?k=...): a senha entra na fila dela.
  const [totemKey, setTotemKey] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [missingKey, setMissingKey] = useState(false);

  useEffect(() => {
    const key = new URLSearchParams(window.location.search).get('k');
    queueMicrotask(() => {
      if (!key) {
        setMissingKey(true);
        return;
      }
      setTotemKey(key);
      fetch(`/api/queue/display/tickets?key=${encodeURIComponent(key)}`, { cache: 'no-store' })
        .then(async (response) => {
          if (!response.ok) {
            setMissingKey(true);
            return;
          }
          const data = await response.json();
          setCompanyName(data?.settings?.appName || data?.tenant?.name || '');
          setPriorityEnabled(data?.settings?.priorityEnabled === true);
          setLogoUrl(data?.settings?.logoUrl || '');
          setBrandColor(/^#[0-9a-f]{6}$/i.test(data?.settings?.primaryColor || '') ? data.settings.primaryColor : '');
        })
        .catch(() => {});
    });
  }, []);

  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(timer);
  }, []);

  const handleReset = () => {
    setIssuedTicket(null);
    setKind(null);
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
        body: JSON.stringify({ key: totemKey, name, whatsapp: normalizedWhatsapp, document: normalizedDocument, origin: 'totem', priority: kind === 'priority' }),
      });
      const result: { number?: number; priority?: boolean; ahead?: number; error?: string } = await response.json();

      if (!response.ok || typeof result.number !== 'number') {
        throw new Error(result.error || 'Não foi possível gerar a senha.');
      }

      setIssuedTicket({ number: result.number, priority: result.priority === true, ahead: result.ahead ?? 0 });

      // A confirmação no WhatsApp sai do servidor, junto com a senha.
      if (normalizedWhatsapp) setSentToWhatsapp(true);

    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro de conexão. Tente de novo.');
    } finally {
      setIsLoading(false);
    }
  };

  if (missingKey) {
    return (
      <div className={styles.container}>
        <main className={styles.card}>
          <h1 className={styles.title}>Totem sem empresa</h1>
          <p className={styles.subtitle}>Abra o link do totem pela tela de Senhas do sistema.</p>
        </main>
      </div>
    );
  }

  return (
    <div className={styles.container} style={brandColor ? ({ '--brand': brandColor, '--brand-2': brandColor } as CSSProperties) : undefined}>
      <header className={styles.topBar}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoUrl || '/brand/vortice-logo.png'} alt={companyName || 'Vórtice Tecnologia'} className={styles.logo} />
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
        {issuedTicket === null && priorityEnabled && kind === null ? (
          <>
            <span className={styles.eyebrow}><Ticket size={16} /> Atendimento presencial</span>
            <h1 className={styles.title}>Retire sua senha</h1>
            <p className={styles.subtitle}>Escolha o tipo de atendimento.</p>
            <div className={styles.typeGrid}>
              <button type="button" className={styles.typeBtn} onClick={() => setKind('normal')}>
                <Users size={40} />
                <strong>Atendimento normal</strong>
              </button>
              <button type="button" className={`${styles.typeBtn} ${styles.typeBtnPref}`} onClick={() => setKind('priority')}>
                <Accessibility size={40} />
                <strong>Preferencial</strong>
                <small>Idosos (60+), gestantes, pessoas com deficiência ou com criança de colo</small>
              </button>
            </div>
          </>
        ) : issuedTicket === null ? (
          <>
            {priorityEnabled && (
              <button type="button" className={styles.backBtn} onClick={() => setKind(null)}><ArrowLeft size={18} /> {kind === 'priority' ? 'Preferencial' : 'Atendimento normal'}</button>
            )}
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
              <span>{issuedTicket.priority ? 'Sua senha preferencial' : 'Sua senha'}</span>
              <strong>{ticketCode(issuedTicket.number, issuedTicket.priority)}</strong>
            </div>
            <p className={styles.ahead}>
              {issuedTicket.ahead === 0 ? 'Você é o próximo!' : issuedTicket.ahead === 1 ? '1 pessoa na sua frente' : `${issuedTicket.ahead} pessoas na sua frente`}
            </p>
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

      <footer className={styles.footer}>{companyName ? `${companyName} · ` : ''}Atendimento</footer>
    </div>
  );
}
