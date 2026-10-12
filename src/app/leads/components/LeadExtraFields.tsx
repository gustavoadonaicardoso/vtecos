'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Copy, Eye, EyeOff, KeyRound, Loader2, Wand2 } from 'lucide-react';
import styles from '../leads.module.css';
import { EXTRA_FIELDS, EXTRA_GROUP_LABEL, ACCESS_PASSWORD_MAX, generatePassword, type CustomFieldDef, type ExtraFieldKey, type ExtraGroup, type LeadExtra } from '@/lib/lead-fields';

interface Props {
  leadId: string;
  leadEmail: string;
  extra: LeadExtra;
  onExtra: (key: ExtraFieldKey, value: string) => void;
  /** Vários campos de uma vez (endereço pelo CEP). */
  onExtras: (values: LeadExtra) => void;
  customDefs: CustomFieldDef[];
  custom: Record<string, string>;
  onCustom: (key: string, value: string) => void;
  /** undefined = senha não mexida. */
  password: string | undefined;
  onPassword: (value: string) => void;
  canManageFields: boolean;
}

const GROUPS: ExtraGroup[] = ['access', 'personal', 'address'];

/** Acesso, dados pessoais, endereço e campos personalizados do lead (painel do lead). */
export default function LeadExtraFields({ leadId, leadEmail, extra, onExtra, onExtras, customDefs, custom, onCustom, password, onPassword, canManageFields }: Props) {
  const [stored, setStored] = useState<string | null | undefined>(undefined);
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [cepBusy, setCepBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  const loadPassword = async () => {
    setLoading(true);
    setPasswordError('');
    try {
      const response = await fetch(`/api/leads/${leadId}/access`, { cache: 'no-store' });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) setPasswordError(json.error || 'Não foi possível ler a senha.');
      else setStored(json.data?.password ?? null);
      return response.ok ? (json.data?.password as string | null) ?? null : null;
    } finally {
      setLoading(false);
    }
  };

  const toggleShow = async () => {
    if (!show && password === undefined && stored === undefined) await loadPassword();
    setShow((value) => !value);
  };

  const shownPassword = password ?? stored ?? '';
  const copy = async () => {
    const value = password ?? stored ?? (await loadPassword());
    if (!value) return;
    await navigator.clipboard?.writeText(value).catch(() => null);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  /** CEP completo: preenche rua, bairro, cidade e UF que estiverem vazios (ViaCEP). */
  const lookupCep = async (value: string) => {
    const digits = value.replace(/\D/g, '');
    if (digits.length !== 8) return;
    setCepBusy(true);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`, { signal: AbortSignal.timeout(6000) });
      const json = await response.json();
      if (json && !json.erro) {
        const next: LeadExtra = {};
        if (!extra.street && json.logradouro) next.street = json.logradouro;
        if (!extra.district && json.bairro) next.district = json.bairro;
        if (!extra.city && json.localidade) next.city = json.localidade;
        if (!extra.state && json.uf) next.state = json.uf;
        if (Object.keys(next).length) onExtras(next);
      }
    } catch {
      // Sem internet ou CEP fora do ar: a pessoa preenche à mão.
    } finally {
      setCepBusy(false);
    }
  };

  const filled = (group: ExtraGroup) => EXTRA_FIELDS.some((field) => field.group === group && extra[field.key]);

  return (
    <div className={styles.extraSections}>
      {GROUPS.map((group) => (
        <details key={group} className={styles.extraSection} open={filled(group) || (group === 'access' && password !== undefined)}>
          <summary>
            {group === 'access' && <KeyRound size={14} />} {EXTRA_GROUP_LABEL[group]}
            {filled(group) && <span className={styles.extraCount}>{EXTRA_FIELDS.filter((field) => field.group === group && extra[field.key]).length}</span>}
          </summary>
          <div className={styles.formGrid}>
            {EXTRA_FIELDS.filter((field) => field.group === group).map((field) => (
              <label key={field.key} className={`${styles.field} ${field.key === 'street' || field.key === 'accessUrl' ? styles.full : ''}`}>
                <span>{field.label}{field.key === 'cep' && cepBusy && <Loader2 size={11} className={styles.spin} />}</span>
                <input
                  className={styles.input}
                  type={field.input === 'date' ? 'date' : field.input === 'email' ? 'email' : field.input === 'url' ? 'url' : 'text'}
                  inputMode={field.input === 'tel' ? 'numeric' : undefined}
                  value={extra[field.key] || ''}
                  maxLength={field.max}
                  placeholder={field.key === 'accessEmail' && leadEmail ? `Vazio = ${leadEmail}` : field.placeholder}
                  onChange={(e) => onExtra(field.key, e.target.value)}
                  onBlur={field.key === 'cep' ? (e) => lookupCep(e.target.value) : undefined}
                  aria-label={field.label}
                />
              </label>
            ))}
            {group === 'access' && (
              <div className={`${styles.field} ${styles.full}`}>
                <span>Senha de acesso</span>
                <div className={styles.secretRow}>
                  <input
                    className={styles.input}
                    type={show ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={password ?? (show ? shownPassword : '')}
                    maxLength={ACCESS_PASSWORD_MAX}
                    placeholder={password === undefined && stored === undefined ? 'Clique no olho para ver' : stored === null && password === undefined ? 'Sem senha cadastrada' : '••••••••'}
                    onChange={(e) => onPassword(e.target.value)}
                    onFocus={() => { if (password === undefined && stored === undefined) void loadPassword(); }}
                    aria-label="Senha de acesso"
                  />
                  <button type="button" className={styles.iconBtn} onClick={toggleShow} aria-label={show ? 'Ocultar senha' : 'Mostrar senha'} title={show ? 'Ocultar' : 'Mostrar'}>
                    {loading ? <Loader2 size={15} className={styles.spin} /> : show ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                  <button type="button" className={styles.iconBtn} onClick={copy} aria-label="Copiar senha" title={copied ? 'Copiada!' : 'Copiar'}><Copy size={15} /></button>
                  <button type="button" className={styles.secondaryBtn} onClick={() => { onPassword(generatePassword()); setShow(true); }} title="Gerar uma senha aleatória">
                    <Wand2 size={14} /> Gerar
                  </button>
                </div>
                <small className={styles.hintText}>
                  {passwordError || (copied ? 'Senha copiada.' : 'Guardada à parte: só aparece aqui e nas mensagens com {{senha_acesso}}. Cada vez que alguém vê a senha fica registrado na auditoria.')}
                </small>
              </div>
            )}
          </div>
        </details>
      ))}

      <details className={styles.extraSection} open={customDefs.some((def) => custom[def.key])}>
        <summary>Campos personalizados{customDefs.length > 0 && <span className={styles.extraCount}>{customDefs.filter((def) => custom[def.key]).length}/{customDefs.length}</span>}</summary>
        {customDefs.length === 0 ? (
          <p className={styles.hintText}>
            Nenhum campo criado ainda.{canManageFields ? <> Crie em <Link href="/leads?campos=1">Leads &gt; Campos</Link> (ex.: matrícula, plano contratado, data da compra).</> : ' Peça a um administrador para criar em Leads > Campos.'}
          </p>
        ) : (
          <div className={styles.formGrid}>
            {customDefs.map((def) => (
              <label key={def.key} className={styles.field}>
                <span>{def.label}</span>
                <input
                  className={styles.input}
                  type={def.type === 'date' ? 'date' : def.type === 'url' ? 'url' : 'text'}
                  inputMode={def.type === 'number' ? 'decimal' : undefined}
                  value={custom[def.key] || ''}
                  maxLength={500}
                  onChange={(e) => onCustom(def.key, e.target.value)}
                  aria-label={def.label}
                />
                <small className={styles.varHint}>{`{{campo.${def.key}}}`}</small>
              </label>
            ))}
          </div>
        )}
      </details>
    </div>
  );
}
