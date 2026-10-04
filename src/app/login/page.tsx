"use client";

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  User,
  Lock,
  ArrowRight,
  Eye,
  EyeOff,
  Sparkles,
  Check,
  X,
  Rocket,
  Moon,
  Sun,
  MessageCircle,
  Mail,
  Globe
} from 'lucide-react';
import Image from 'next/image';
import styles from './login.module.css';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/components/ThemeProvider';

// Site comercial: usado quando a Vórtice ainda não cadastrou WhatsApp/e-mail
// em Configurações > Dados da empresa.
const SALES_URL = 'https://vorticetecnologia.com.br';

interface PublicPlan {
  id: string;
  name: string;
  description: string;
  price: number;
  featured: boolean;
  modules: { key: string; label: string; description: string }[];
}

interface SalesContact {
  whatsapp: string | null;
  email: string | null;
  website: string | null;
}

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: value % 1 ? 2 : 0 });

/** Link de contratação: WhatsApp da Vórtice com a mensagem pronta, senão e-mail, senão o site. */
function contactLink(contact: SalesContact | null, planName?: string) {
  const text = planName
    ? `Olá! Tenho interesse no plano ${planName} do vtec os.`
    : 'Olá! Quero conhecer os planos do vtec os.';
  if (contact?.whatsapp) return `https://wa.me/${contact.whatsapp}?text=${encodeURIComponent(text)}`;
  if (contact?.email) return `mailto:${contact.email}?subject=${encodeURIComponent(planName ? `Plano ${planName}` : 'Planos do vtec os')}&body=${encodeURIComponent(text)}`;
  return contact?.website || SALES_URL;
}

export default function LoginPage() {
  const { login } = useAuth();
  const { theme, toggleTheme, config } = useTheme();
  const [plans, setPlans] = useState<PublicPlan[] | null>(null);
  const [contact, setContact] = useState<SalesContact | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [resetMode, setResetMode] = useState(false);
  const [resetMsg, setResetMsg] = useState('');
  const [showPlans, setShowPlans] = useState(false);

  const currentYear = new Date().getFullYear();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const resp = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const json = await resp.json();

      if (!resp.ok) {
        setError(json.error || 'Falha na autenticação.');
        setIsLoading(false);
        return;
      }

      login(json.data);
    } catch (err) {
      console.error('Login error:', err);
      setError('Falha na requisição. Tente novamente.');
      setIsLoading(false);
    }
  };

  // FIX #13: Recuperação de senha via Solicitação ao Admin
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError('Digite seu e-mail para recuperar a senha.');
      return;
    }
    setIsLoading(true);
    setError('');
    setResetMsg('');
    try {
      const resp = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });

      const json = await resp.json();

      if (!resp.ok) {
        throw new Error(json.error || 'Erro ao processar solicitação.');
      }

      setResetMsg(json.message || 'Pedido enviado aos administradores da sua empresa.');
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      setError(message || 'Não foi possível processar a solicitação. Verifique o e-mail informado.');
    } finally {
      setIsLoading(false);
    }
  };

  const openPlans = async () => {
    setShowPlans(true);
    if (plans) return;
    try {
      const response = await fetch('/api/public/plans');
      const json = await response.json();
      setPlans(json.data?.plans || []);
      setContact(json.data?.contact || null);
    } catch {
      setPlans([]);
    }
  };

  useEffect(() => {
    if (!showPlans) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setShowPlans(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showPlans]);

  const switchMode = (toReset: boolean) => {
    setResetMode(toReset);
    setError('');
    setResetMsg('');
  };

  return (
    <div className={styles.loginPage}>
      <button
        type="button"
        className={styles.themeToggle}
        onClick={toggleTheme}
        aria-label={theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'}
        title={theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'}
      >
        {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        <span>{theme === 'dark' ? 'Tema claro' : 'Tema escuro'}</span>
      </button>

      <motion.div
        className={styles.loginCard}
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      >
        <div className={styles.logoSection}>
          {config.logo_url ? (
            // Logo da Identidade Visual (Painel Master), salvo como imagem embutida.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={config.logo_url} alt={config.app_name || 'Logo'} className={styles.companyLogo} style={{ maxHeight: 80 }} />
          ) : (
            <Image
              src={theme === 'dark' ? '/logo-dark.png' : '/logo.png'}
              alt="Vórtice Tecnologia"
              width={300}
              height={80}
              className={styles.companyLogo}
              priority
            />
          )}
          {resetMode ? (
            <>
              <h2 className={styles.cardTitle}>Recuperar senha</h2>
              <p className={styles.cardSubtitle}>
                Informe o e-mail de acesso. Os administradores da sua empresa recebem um aviso para definir uma nova senha para você.
              </p>
            </>
          ) : (
            <p className={styles.cardSubtitle}>
              Entre com o e-mail e a senha cadastrados pela sua empresa.
            </p>
          )}
        </div>

        {resetMode ? (
          <form className={styles.loginForm} onSubmit={handleForgotPassword}>
            {error && <div className={styles.errorMessage}>{error}</div>}
            {resetMsg && <div className={styles.successMessage}>{resetMsg}</div>}

            <div className={styles.inputGroup}>
              <label htmlFor="reset-email">E-mail</label>
              <div className={styles.inputWrapper}>
                <User size={18} className={styles.fieldIcon} />
                <input
                  id="reset-email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </div>
            </div>

            <button type="submit" className={styles.loginBtn} disabled={isLoading}>
              {isLoading ? <div className={styles.loader}></div> : <>Solicitar redefinição <ArrowRight size={18} /></>}
            </button>
            <button
              type="button"
              onClick={() => switchMode(false)}
              className={styles.backBtn}
            >
              ← Voltar ao login
            </button>
          </form>
        ) : (
          <form className={styles.loginForm} onSubmit={handleLogin}>
            {error && <div className={styles.errorMessage}>{error}</div>}

            <div className={styles.inputGroup}>
              <label htmlFor="login-email">E-mail</label>
              <div className={styles.inputWrapper}>
                <User size={18} className={styles.fieldIcon} />
                <input
                  id="login-email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </div>
            </div>

            <div className={styles.inputGroup}>
              <label htmlFor="login-password">Senha</label>
              <div className={styles.inputWrapper}>
                <Lock size={18} className={styles.fieldIcon} />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className={styles.togglePassword}
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <button
                type="button"
                className={styles.forgotPassword}
                onClick={() => switchMode(true)}
              >
                Esqueceu a senha?
              </button>
            </div>

            <button
              type="submit"
              className={styles.loginBtn}
              disabled={isLoading}
            >
              {isLoading ? (
                <div className={styles.loader}></div>
              ) : (
                <>
                  Entrar <ArrowRight size={18} />
                </>
              )}
            </button>

            <div className={styles.divider}>
              <span>Ainda não é cliente?</span>
            </div>

            <button
              type="button"
              className={styles.plansBtn}
              onClick={openPlans}
            >
              <Sparkles size={16} /> Conheça nossos planos
            </button>
          </form>
        )}
      </motion.div>

      <div className={styles.loginBranding}>
        <p>
          © {currentYear} Vórtice Tecnologia |{' '}
          <a href="/politica-de-privacidade">
            Política de Privacidade
          </a>
        </p>
      </div>

      <AnimatePresence>
        {showPlans && (
          <motion.div
            className={styles.plansOverlay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowPlans(false)}
          >
            <motion.div
              className={styles.plansModal}
              initial={{ opacity: 0, y: 40, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 40, scale: 0.97 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label="Planos do Vórtice CRM"
            >
              <button
                type="button"
                className={styles.plansClose}
                onClick={() => setShowPlans(false)}
                aria-label="Fechar"
              >
                <X size={20} />
              </button>

              <div className={styles.plansHeader}>
                <h2>Escolha o plano ideal para a sua empresa</h2>
                <p>Cada empresa tem o próprio ambiente, a própria equipe e os módulos do plano contratado.</p>
              </div>

              {plans === null ? (
                <div className={styles.plansLoading}>Carregando planos...</div>
              ) : plans.length === 0 ? (
                <div className={styles.plansEmpty}>
                  <p>Os planos são montados conforme a necessidade da sua empresa.</p>
                  <a href={contactLink(contact)} target="_blank" rel="noopener noreferrer" className={`${styles.planCta} ${styles.planCtaHighlight}`}>
                    <MessageCircle size={16} /> Falar com a Vórtice
                  </a>
                </div>
              ) : (
                <div className={styles.plansGrid}>
                  {plans.map((plan) => (
                    <div key={plan.id} className={`${styles.planCard} ${plan.featured ? styles.planHighlight : ''}`}>
                      {plan.featured && <span className={styles.planBadge}>Mais popular</span>}
                      <h3>{plan.name}</h3>
                      <div className={styles.planPrice}>
                        <strong>{plan.price > 0 ? money(plan.price) : 'Sob consulta'}</strong>
                        {plan.price > 0 && <span>/mês</span>}
                      </div>
                      {plan.description && <p className={styles.planDesc}>{plan.description}</p>}
                      <ul className={styles.planModules}>
                        {plan.modules.map((module) => (
                          <li key={module.key}>
                            <Check size={15} />
                            <div>
                              {module.label}
                              <small>{module.description}</small>
                            </div>
                          </li>
                        ))}
                      </ul>
                      <a
                        href={contactLink(contact, plan.name)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`${styles.planCta} ${plan.featured ? styles.planCtaHighlight : ''}`}
                      >
                        <Rocket size={16} /> Quero este plano
                      </a>
                    </div>
                  ))}
                </div>
              )}

              <div className={styles.plansFooter}>
                Dúvidas sobre qual plano escolher? Fale com a gente:
                <div className={styles.contactRow}>
                  {contact?.whatsapp && (
                    <a href={contactLink(contact)} target="_blank" rel="noopener noreferrer"><MessageCircle size={14} /> WhatsApp</a>
                  )}
                  {contact?.email && (
                    <a href={`mailto:${contact.email}`}><Mail size={14} /> {contact.email}</a>
                  )}
                  <a href={contact?.website || SALES_URL} target="_blank" rel="noopener noreferrer"><Globe size={14} /> Site</a>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
