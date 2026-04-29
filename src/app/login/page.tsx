"use client";

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  User, 
  Lock, 
  ArrowRight, 
  ShieldCheck, 
  Zap,
  Globe
} from 'lucide-react';
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
        <div className={styles.gridOverlay}></div>
        <div className={styles.backgroundBlobs}>
          <div className={styles.blob1}></div>
          <div className={styles.blob2}></div>
          <div className={styles.blob3}></div>
        </div>
        <motion.div
          className={styles.loginCard}
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        >
          <div className={styles.logoSection}>
            <h1>Recuperar Senha</h1>
            <p>Digite seu e-mail e enviaremos um link de redefinição.</p>
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
              style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', marginTop: '8px', fontSize: '14px' }}
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
      <div className={styles.gridOverlay}></div>
      <div className={styles.backgroundBlobs}>
        <div className={styles.blob1}></div>
        <div className={styles.blob2}></div>
        <div className={styles.blob3}></div>
      </div>

      <motion.div 
        className={styles.loginCard}
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
      >
        <div className={styles.logoSection}>
          <div className={styles.vortexLogo}>
            <div className={styles.vortexInner}></div>
            <Zap size={24} className={styles.vortexIcon} />
          </div>
          <h1>VÓRTICE</h1>
          <p>Sua central de comando comercial</p>
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

        <div className={styles.footerInfo}>
          <div className={styles.infoItem}>
            <ShieldCheck size={14} />
            <span>Acesso Seguro SSL</span>
          </div>
          <div className={styles.infoItem}>
            <Globe size={14} />
            <span>Multi-Plataforma</span>
          </div>
        </div>
      </motion.div>

      <div className={styles.loginBranding}>
        <p>
          © 2026 Vórtice Tecnologia. Todos os direitos reservados. |{' '}
          <a href="/politica-de-privacidade" style={{ color: 'inherit', textDecoration: 'underline' }}>
            Política de Privacidade
          </a>
        </p>
      </div>
    </div>
  );
}
