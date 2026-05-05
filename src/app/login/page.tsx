"use client";

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  User, 
  Lock, 
  ArrowRight
} from 'lucide-react';
import Image from 'next/image';
import styles from './login.module.css';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase'; // Mantido só pro recuperar senha

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  // FIX #13: estado para recuperação de senha
  const [resetMode, setResetMode] = useState(false);
  const [resetMsg, setResetMsg] = useState('');

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

  // FIX #13: Recuperação de senha via Supabase Auth
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError('Digite seu e-mail para recuperar a senha.');
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/login`,
      });
      if (resetError) throw resetError;
      setResetMsg('E-mail de recuperação enviado! Verifique sua caixa de entrada.');
    } catch (err: any) {
      setError('Não foi possível enviar o e-mail. Verifique o endereço informado.');
    } finally {
      setIsLoading(false);
    }
  };

  if (resetMode) {
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
              width={380} 
              height={125} 
              className={styles.companyLogo}
              style={{ objectFit: 'contain' }}
              priority
            />
            <h2>Recuperar Senha</h2>
            <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginTop: '8px' }}>
              Digite seu e-mail e enviaremos um link de redefinição.
            </p>
          </div>
          <form className={styles.loginForm} onSubmit={handleForgotPassword}>
            {error && <div className={styles.errorMessage}>{error}</div>}
            {resetMsg && <div className={styles.successMessage}>{resetMsg}</div>}
            <div className={styles.inputGroup}>
              <label>E-mail</label>
              <div className={styles.inputWrapper}>
                <User size={18} className={styles.fieldIcon} />
                <input
                  type="email"
                  placeholder="nome@vortice.tech"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>
            <button type="submit" className={styles.loginBtn} disabled={isLoading}>
              {isLoading ? <div className={styles.loader}></div> : <>Enviar link <ArrowRight size={18} /></>}
            </button>
            <button
              type="button"
              onClick={() => { setResetMode(false); setError(''); setResetMsg(''); }}
              className={styles.backBtn}
            >
              ← Voltar ao login
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <div className={styles.loginPage}>
      <motion.div 
        className={styles.loginCard}
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
      >
        <div className={styles.logoSection}>
          <Image 
            src="/logo-dark.png" 
            alt="Vórtice Tecnologia" 
            width={380} 
            height={125} 
            className={styles.companyLogo}
            style={{ objectFit: 'contain' }}
            priority
          />
        </div>

        <form className={styles.loginForm} onSubmit={handleLogin}>
          {error && <div className={styles.errorMessage}>{error}</div>}
          
          <div className={styles.inputGroup}>
            <label>E-mail</label>
            <div className={styles.inputWrapper}>
              <User size={18} className={styles.fieldIcon} />
              <input 
                type="email" 
                placeholder="nome@vortice.tech" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required 
              />
            </div>
          </div>

          <div className={styles.inputGroup}>
            <label>Senha</label>
            <div className={styles.inputWrapper}>
              <Lock size={18} className={styles.fieldIcon} />
              <input 
                type="password" 
                placeholder="••••••••" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required 
              />
            </div>
            <a
              href="#"
              className={styles.forgotPassword}
              onClick={(e) => { e.preventDefault(); setResetMode(true); setError(''); }}
            >
              Esqueceu a senha?
            </a>
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
        </form>
      </motion.div>

      <div className={styles.loginBranding}>
        <p>
          © 2026 Vórtice Tecnologia |{' '}
          <a href="/politica-de-privacidade">
            Política de Privacidade
          </a>
        </p>
      </div>
    </div>
  );
}
