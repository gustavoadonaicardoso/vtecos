'use client';

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, ArrowRight, Building2, Eye, EyeOff, FileText, Lock, Mail, MailCheck, Phone, RotateCw, ShieldCheck, User } from 'lucide-react';
import login from '../login/login.module.css';
import styles from './cadastro.module.css';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/components/ThemeProvider';

interface PublicPlan {
  id: string;
  name: string;
  description: string;
  price: number;
  featured: boolean;
}

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: value % 1 ? 2 : 0 });
const digits = (value: string) => value.replace(/\D/g, '');

function maskPhone(value: string) {
  const d = digits(value).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function maskDocument(value: string) {
  const d = digits(value).slice(0, 14);
  if (d.length <= 11) return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');
}

function addDaysLabel(days: number) {
  const date = new Date(Date.now() + days * 86_400_000);
  return date.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function SignupForm() {
  const params = useSearchParams();
  const { login: enter } = useAuth();
  const router = useRouter();
  const { theme, config } = useTheme();
  const [plans, setPlans] = useState<PublicPlan[] | null>(null);
  const [trial, setTrial] = useState<{ available: boolean; days: number; emailCode?: boolean }>({ available: false, days: 7 });
  const [contactLink, setContactLink] = useState<string | null>(null);
  const [planId, setPlanId] = useState(params.get('plano') || '');
  const [cycle, setCycle] = useState<'MONTHLY' | 'YEARLY'>(params.get('ciclo') === 'anual' ? 'YEARLY' : 'MONTHLY');
  const [form, setForm] = useState({ name: '', company: '', email: '', phone: '', cpfCnpj: '', password: '', website: '' });
  const [accepted, setAccepted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Confirmação do e-mail: o código de 6 dígitos chega antes de criar a conta.
  const [step, setStep] = useState<'form' | 'code'>('form');
  const [code, setCode] = useState('');
  const [resendIn, setResendIn] = useState(0);
  const [notice, setNotice] = useState('');
  const [sentTo, setSentTo] = useState('');

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  useEffect(() => {
    fetch('/api/public/plans')
      .then((response) => response.json())
      .then((json) => {
        const list: PublicPlan[] = (json.data?.plans || []).filter((plan: PublicPlan) => plan.price > 0);
        setPlans(list);
        if (json.data?.trial) setTrial(json.data.trial);
        const whatsapp = json.data?.contact?.whatsapp;
        setContactLink(whatsapp ? `https://wa.me/${whatsapp}?text=${encodeURIComponent('Olá! Quero conhecer o vtec os.')}` : json.data?.contact?.website || null);
        setPlanId((current) => (list.some((plan) => plan.id === current) ? current : (list.find((plan) => plan.featured) || list[0])?.id || ''));
      })
      .catch(() => setPlans([]));
  }, []);

  const plan = useMemo(() => plans?.find((item) => item.id === planId) || null, [plans, planId]);
  const value = plan ? (cycle === 'YEARLY' ? plan.price * 10 : plan.price) : 0;
  const set = (key: keyof typeof form, next: string) => setForm((current) => ({ ...current, [key]: next }));

  const createAccount = async (withCode?: string) => {
    const response = await fetch('/api/public/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, planId, cycle, accepted, ...(withCode ? { code: withCode } : {}) }),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(json.error || 'Não foi possível criar a conta agora.');
      setBusy(false);
      return;
    }
    if (json.data) enter(json.data);
    else router.push('/login');
  };

  /** Pede o código; devolve true quando ele foi mandado e a tela deve pedir os 6 dígitos. */
  const sendCode = async (): Promise<boolean | null> => {
    const response = await fetch('/api/public/signup/code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, planId, cycle, accepted }),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(json.error || 'Não foi possível mandar o código agora.');
      if (json.retryInSeconds) setResendIn(Number(json.retryInSeconds));
      return null;
    }
    if (!json.data?.required) return false;
    setResendIn(60);
    setSentTo(form.email.trim().toLowerCase());
    return true;
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!accepted) {
      setError('Para criar a conta, aceite a política de privacidade.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (trial.emailCode) {
        // Voltou sem trocar o e-mail e o código ainda é recente: usa o mesmo.
        if (sentTo === form.email.trim().toLowerCase() && resendIn > 0) {
          setStep('code');
          setBusy(false);
          return;
        }
        const sent = await sendCode();
        if (sent === null) {
          setBusy(false);
          return;
        }
        if (sent) {
          setCode('');
          setStep('code');
          setBusy(false);
          return;
        }
      }
      await createAccount();
    } catch {
      setError('Sem conexão. Tente de novo.');
      setBusy(false);
    }
  };

  const confirmCode = async (event: React.FormEvent) => {
    event.preventDefault();
    if (code.length !== 6) {
      setError('Digite os 6 números do código.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await createAccount(code);
    } catch {
      setError('Sem conexão. Tente de novo.');
      setBusy(false);
    }
  };

  const resend = async () => {
    if (resendIn > 0 || busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const sent = await sendCode();
      if (sent) {
        setCode('');
        setNotice('Mandamos um código novo. Use o mais recente.');
      }
    } catch {
      setError('Sem conexão. Tente de novo.');
    }
    setBusy(false);
  };

  const backToForm = () => {
    setStep('form');
    setError('');
    setNotice('');
    setCode('');
  };

  return (
    <div className={login.loginPage}>
      <div className={`${login.loginCard} ${styles.card}`}>
        <div className={login.logoSection}>
          {config.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={config.logo_url} alt={config.app_name || 'Logo'} className={login.companyLogo} style={{ maxHeight: 64 }} />
          ) : (
            <Image src={theme === 'dark' ? '/logo-dark.png' : '/logo.png'} alt="Vórtice Tecnologia" width={220} height={60} className={login.companyLogo} priority />
          )}
          <h2 className={login.cardTitle}>Teste grátis por {trial.days} dias</h2>
          <p className={login.cardSubtitle}>Crie a conta da sua empresa e comece agora. Sem cartão de crédito.</p>
        </div>

        {plans === null ? (
          <div className={login.loader} style={{ margin: '24px auto' }} />
        ) : !trial.available || plans.length === 0 ? (
          <div className={styles.unavailable}>
            <p>O teste grátis pelo site não está disponível agora. Fale com a Vórtice que liberamos o seu acesso.</p>
            {contactLink && <a className={login.loginBtn} href={contactLink} target="_blank" rel="noopener noreferrer">Falar com a Vórtice</a>}
            <Link href="/login" className={styles.back}><ArrowLeft size={15} /> Voltar ao login</Link>
          </div>
        ) : step === 'code' ? (
          <form className={`${login.loginForm} ${styles.form}`} onSubmit={confirmCode}>
            <div className={styles.codeIntro}>
              <MailCheck size={30} />
              <p>Mandamos um código de 6 números para <strong>{form.email}</strong>. Digite abaixo para confirmar o e-mail e criar a conta.</p>
              <small>Não chegou? Olhe a caixa de spam ou promoções. O código vale 15 minutos.</small>
            </div>
            {error && <div className={login.errorMessage}>{error}</div>}
            {notice && <div className={styles.notice}>{notice}</div>}
            <div className={login.inputGroup}>
              <label htmlFor="s-code">Código de confirmação</label>
              <input
                id="s-code"
                className={styles.codeInput}
                value={code}
                onChange={(e) => setCode(digits(e.target.value).slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                maxLength={6}
                autoFocus
                required
              />
            </div>
            <button type="submit" className={login.loginBtn} disabled={busy || code.length !== 6}>
              {busy ? <div className={login.loader} /> : <>Confirmar e criar a conta <ArrowRight size={18} /></>}
            </button>
            <div className={styles.codeActions}>
              <button type="button" onClick={resend} disabled={busy || resendIn > 0}>
                <RotateCw size={14} /> {resendIn > 0 ? `Reenviar código em ${resendIn}s` : 'Reenviar código'}
              </button>
              <button type="button" onClick={backToForm} disabled={busy}>
                <ArrowLeft size={14} /> Trocar e-mail ou dados
              </button>
            </div>
          </form>
        ) : (
          <form className={`${login.loginForm} ${styles.form}`} onSubmit={submit}>
            {error && <div className={login.errorMessage}>{error}</div>}

            <div className={styles.planBox}>
              <label className={styles.planSelect}>
                <span>Plano</span>
                <select value={planId} onChange={(e) => setPlanId(e.target.value)} aria-label="Plano">
                  {plans.map((item) => <option key={item.id} value={item.id}>{item.name} — {money(item.price)}/mês</option>)}
                </select>
              </label>
              <div className={styles.cycle} role="radiogroup" aria-label="Forma de pagamento">
                <button type="button" role="radio" aria-checked={cycle === 'MONTHLY'} className={cycle === 'MONTHLY' ? styles.cycleOn : ''} onClick={() => setCycle('MONTHLY')}>Mensal</button>
                <button type="button" role="radio" aria-checked={cycle === 'YEARLY'} className={cycle === 'YEARLY' ? styles.cycleOn : ''} onClick={() => setCycle('YEARLY')}>Anual <small>2 meses grátis</small></button>
              </div>
              {plan && (
                <p className={styles.planNote}>
                  {plan.description && <>{plan.description} </>}
                  Depois do teste: <strong>{money(value)}{cycle === 'YEARLY' ? '/ano' : '/mês'}</strong>. A primeira fatura vence em <strong>{addDaysLabel(trial.days)}</strong> — Pix, boleto ou cartão.
                </p>
              )}
            </div>

            <div className={styles.grid}>
              <Field icon={User} id="s-name" label="Seu nome e sobrenome" value={form.name} onChange={(v) => set('name', v)} autoComplete="name" placeholder="Ana Souza" />
              <Field icon={Building2} id="s-company" label="Nome da empresa" value={form.company} onChange={(v) => set('company', v)} autoComplete="organization" placeholder="Doces da Ana" />
              <Field icon={Mail} id="s-email" type="email" label="E-mail (será o seu login)" value={form.email} onChange={(v) => set('email', v)} autoComplete="email" placeholder="voce@empresa.com" />
              <Field icon={Phone} id="s-phone" type="tel" label="WhatsApp" value={form.phone} onChange={(v) => set('phone', maskPhone(v))} autoComplete="tel" placeholder="(11) 99999-0000" />
              <Field icon={FileText} id="s-doc" label="CPF ou CNPJ (para a fatura)" value={form.cpfCnpj} onChange={(v) => set('cpfCnpj', maskDocument(v))} inputMode="numeric" placeholder="000.000.000-00" />
              <div className={login.inputGroup}>
                <label htmlFor="s-password">Crie uma senha</label>
                <div className={login.inputWrapper}>
                  <Lock size={18} className={login.fieldIcon} />
                  <input id="s-password" type={showPassword ? 'text' : 'password'} value={form.password} onChange={(e) => set('password', e.target.value)} autoComplete="new-password" placeholder="Mínimo de 8 caracteres" minLength={8} required />
                  <button type="button" className={login.togglePassword} onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}>
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
            </div>

            {/* Campo escondido contra robôs. */}
            <input className={styles.honeypot} tabIndex={-1} autoComplete="off" aria-hidden="true" value={form.website} onChange={(e) => set('website', e.target.value)} name="website" />

            <label className={styles.accept}>
              <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
              <span>Li e aceito a <a href="/politica-de-privacidade" target="_blank" rel="noopener noreferrer">política de privacidade</a>.</span>
            </label>

            <button type="submit" className={login.loginBtn} disabled={busy}>
              {busy ? <div className={login.loader} /> : <>{trial.emailCode ? 'Continuar' : 'Começar o teste grátis'} <ArrowRight size={18} /></>}
            </button>
            <p className={styles.fine}>
              <ShieldCheck size={14} /> Sem fidelidade no teste: se não pagar a primeira fatura, o acesso é suspenso 3 dias depois do vencimento e nada mais é cobrado.
            </p>
            <Link href="/login" className={styles.back}>Já tenho conta: entrar</Link>
          </form>
        )}
      </div>
    </div>
  );
}

function Field(props: { icon: typeof User; id: string; label: string; value: string; onChange: (value: string) => void; type?: string; autoComplete?: string; placeholder?: string; inputMode?: 'numeric' }) {
  const Icon = props.icon;
  return (
    <div className={login.inputGroup}>
      <label htmlFor={props.id}>{props.label}</label>
      <div className={login.inputWrapper}>
        <Icon size={18} className={login.fieldIcon} />
        <input id={props.id} type={props.type || 'text'} value={props.value} onChange={(e) => props.onChange(e.target.value)} autoComplete={props.autoComplete} placeholder={props.placeholder} inputMode={props.inputMode} required />
      </div>
    </div>
  );
}

export default function CadastroPage() {
  return (
    <Suspense fallback={null}>
      <SignupForm />
    </Suspense>
  );
}
