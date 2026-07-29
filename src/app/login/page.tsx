"use client";

import React, { useState } from 'react';
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
  Rocket
} from 'lucide-react';
import Image from 'next/image';
import styles from './login.module.css';
import { useAuth } from '@/context/AuthContext';

// Link de contratação — ajuste para o canal comercial oficial (site, WhatsApp, checkout)
const SALES_URL = 'https://vorticetecnologia.com.br';

const PLANS = [
  {
    id: 'essencial',
    name: 'Essencial',
    price: 'R$ 149',
    period: '/mês',
    description: 'Para equipes que estão começando a organizar as vendas.',
    features: [
      'Pipeline visual com drag & drop',
      'Gestão completa de leads',
      'Relatórios e funil de conversão',
      'Até 3 usuários',
    ],
    highlight: false,
  },
  {
    id: 'profissional',
    name: 'Profissional',
    price: 'R$ 299',
    period: '/mês',
    description: 'Para times que vendem todos os dias pelo WhatsApp.',
    features: [
      'Tudo do plano Essencial',
      'Chat e disparos via WhatsApp',
      'Automações do pipeline',
      'Templates e caixa unificada',
      'Até 10 usuários',
    ],
    highlight: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 'Sob consulta',
    period: '',
    description: 'Para operações que exigem escala e personalização.',
    features: [
      'Tudo do plano Profissional',
      'Fiscal com IA e integrações Meta',
      'Multi-tenant e permissões avançadas',
      'Usuários ilimitados',
      'Suporte dedicado',
    ],
    highlight: false,
  },
];

export default function LoginPage() {
  const { login } = useAuth();
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

      // Log remoto
      await fetch('/api/audit', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({
            user: { id: json.data.id, name: json.data.name },
            action: 'LOGIN',
            details: `Usuário ${json.data.name} (${json.data.role}) fez login no sistema.`
         })
      }).catch(() => {});

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

      setResetMsg('Solicitação enviada com sucesso! O administrador foi notificado para redefinir sua senha.');
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      setError(message || 'Não foi possível processar a solicitação. Verifique o e-mail informado.');
    } finally {
      setIsLoading(false);
    }
  };

  const switchMode = (toReset: boolean) => {
    setResetMode(toReset);
    setError('');
    setResetMsg('');
  };

  return (
    <div className={styles.loginPage}>
      <motion.div
        className={styles.loginCard}
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      >
        <div className={styles.logoSection}>
          <Image
            src="/logo-dark.png"
            alt="Vórtice Tecnologia"
            width={300}
            height={80}
            className={styles.companyLogo}
            priority
          />
          {resetMode ? (
            <>
              <h2 className={styles.cardTitle}>Recuperar senha</h2>
              <p className={styles.cardSubtitle}>
                Informe seu e-mail e o administrador será notificado para redefinir sua senha.
              </p>
            </>
          ) : (
            <p className={styles.cardSubtitle}>
              Acesse sua conta para gerenciar leads, pipeline e atendimentos.
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
                  placeholder="seunome@vorticetecnologia.com"
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
                  placeholder="seunome@vorticetecnologia.com"
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
                  Acessar CRM <ArrowRight size={18} />
                </>
              )}
            </button>

            <div className={styles.divider}>
              <span>Ainda não é cliente?</span>
            </div>

            <button
              type="button"
              className={styles.plansBtn}
              onClick={() => setShowPlans(true)}
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
                <h2>Escolha o plano ideal para o seu time</h2>
                <p>Plataforma completa de vendas: pipeline, WhatsApp, campanhas e IA — tudo em um só lugar.</p>
              </div>

              <div className={styles.plansGrid}>
                {PLANS.map((plan) => (
                  <div
                    key={plan.id}
                    className={`${styles.planCard} ${plan.highlight ? styles.planHighlight : ''}`}
                  >
                    {plan.highlight && (
                      <span className={styles.planBadge}>Mais popular</span>
                    )}
                    <h3>{plan.name}</h3>
                    <div className={styles.planPrice}>
                      <strong>{plan.price}</strong>
                      {plan.period && <span>{plan.period}</span>}
                    </div>
                    <p className={styles.planDesc}>{plan.description}</p>
                    <ul className={styles.planFeatures}>
                      {plan.features.map((feature) => (
                        <li key={feature}>
                          <Check size={15} /> {feature}
                        </li>
                      ))}
                    </ul>
                    <a
                      href={`${SALES_URL}/?plano=${plan.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`${styles.planCta} ${plan.highlight ? styles.planCtaHighlight : ''}`}
                    >
                      <Rocket size={16} /> Contratar agora
                    </a>
                  </div>
                ))}
              </div>

              <p className={styles.plansFooter}>
                Dúvidas sobre qual plano escolher?{' '}
                <a href={SALES_URL} target="_blank" rel="noopener noreferrer">
                  Fale com nosso time
                </a>
                .
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
