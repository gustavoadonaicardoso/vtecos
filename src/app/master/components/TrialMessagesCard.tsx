'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, MessageCircle, RotateCcw, Save, Send } from 'lucide-react';
import styles from '../master.module.css';
import local from './TrialMessagesCard.module.css';
import {
  TRIAL_MESSAGE_DEFAULTS,
  TRIAL_MESSAGE_INFO,
  TRIAL_MESSAGE_MAX,
  TRIAL_MESSAGE_ORDER,
  TRIAL_MESSAGE_VARIABLES,
  renderTrialMessage,
  sampleVars,
  type TrialMessageKey,
} from '@/lib/trial-messages';

interface Data {
  enabled: boolean;
  texts: Record<TrialMessageKey, string>;
  custom: TrialMessageKey[];
  whatsapp: { web: boolean; api: boolean };
}

/** WhatsApp em negrito/itálico simples na prévia. */
function preview(text: string) {
  return text.split('\n').map((line, index) => (
    <React.Fragment key={index}>
      {line.split(/(\*[^*\n]+\*)/g).map((part, i) => (part.startsWith('*') && part.endsWith('*') && part.length > 2 ? <strong key={i}>{part.slice(1, -1)}</strong> : part))}
      <br />
    </React.Fragment>
  ));
}

/** Painel Master > Plataforma: mensagens de WhatsApp para quem está no teste grátis. */
export default function TrialMessagesCard() {
  const [data, setData] = useState<Data | null>(null);
  const [texts, setTexts] = useState<Record<TrialMessageKey, string>>(TRIAL_MESSAGE_DEFAULTS);
  const [enabled, setEnabled] = useState(true);
  const [active, setActive] = useState<TrialMessageKey>('welcome');
  const [busy, setBusy] = useState<'save' | 'test' | null>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [testPhone, setTestPhone] = useState('');
  const area = useRef<HTMLTextAreaElement>(null);

  const apply = (next: Data) => {
    setData(next);
    setTexts(next.texts);
    setEnabled(next.enabled);
  };

  const load = useCallback(async () => {
    const response = await fetch('/api/master/trial-messages', { cache: 'no-store' });
    const json = await response.json().catch(() => ({}));
    if (response.ok) apply(json.data);
    else setFeedback({ ok: false, message: json.error || 'Não foi possível carregar as mensagens.' });
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(load, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const dirty = Boolean(data) && (enabled !== data!.enabled || TRIAL_MESSAGE_ORDER.some((key) => texts[key] !== data!.texts[key]));

  const save = async () => {
    setBusy('save');
    setFeedback(null);
    const response = await fetch('/api/master/trial-messages', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled, texts }) });
    const json = await response.json().catch(() => ({}));
    setBusy(null);
    if (!response.ok) return setFeedback({ ok: false, message: json.error || 'Não foi possível salvar.' });
    apply(json.data);
    setFeedback({ ok: true, message: 'Mensagens salvas.' });
  };

  const sendTest = async () => {
    setBusy('test');
    setFeedback(null);
    const response = await fetch('/api/master/trial-messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: active, phone: testPhone, text: texts[active] }) });
    const json = await response.json().catch(() => ({}));
    setBusy(null);
    setFeedback(response.ok ? { ok: true, message: `Mensagem de teste enviada para ${testPhone}.` } : { ok: false, message: json.error || 'Não foi possível enviar.' });
  };

  const insertVariable = (key: string) => {
    const element = area.current;
    const token = `{${key}}`;
    const current = texts[active];
    const start = element?.selectionStart ?? current.length;
    const end = element?.selectionEnd ?? current.length;
    setTexts({ ...texts, [active]: current.slice(0, start) + token + current.slice(end) });
    window.setTimeout(() => {
      element?.focus();
      element?.setSelectionRange(start + token.length, start + token.length);
    }, 0);
  };

  const channel = data?.whatsapp.web ? 'WhatsApp Web' : data?.whatsapp.api ? 'API oficial' : null;

  return (
    <div className={`${styles.card} ${styles.cardWide}`}>
      <div className={styles.cardHeader}><MessageCircle size={20} /><h2>Mensagens do teste grátis (WhatsApp)</h2></div>
      <p className={styles.hint}>
        Quem se cadastra pelo teste grátis vira lead no seu CRM (etiqueta <strong>Teste grátis</strong>) e recebe estas mensagens pelo WhatsApp da Vórtice, das 8h às 20h. Elas aparecem na conversa do lead em Mensagens: a resposta do cliente chega ali.
      </p>

      {!data ? (
        <p className={styles.hint}><Loader2 size={15} className={styles.spin} /> Carregando…</p>
      ) : (
        <>
          <div className={local.topRow}>
            <label className={local.toggle}>
              <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
              <span>Mandar as mensagens automaticamente</span>
            </label>
            <span className={channel ? local.ok : local.warn}>
              {channel ? <><CheckCircle2 size={14} /> WhatsApp da Vórtice conectado ({channel})</> : <><AlertTriangle size={14} /> WhatsApp da Vórtice desconectado: conecte em Integrações</>}
            </span>
          </div>
          {data.whatsapp.api && !data.whatsapp.web && (
            <p className={styles.fieldHint}>Pela API oficial, a Meta só entrega texto livre para quem falou com a Vórtice nas últimas 24h. Para os lembretes, prefira o WhatsApp Web conectado.</p>
          )}

          <div className={local.tabs} role="tablist" aria-label="Mensagens">
            {TRIAL_MESSAGE_ORDER.map((key) => (
              <button key={key} type="button" role="tab" aria-selected={active === key} className={active === key ? local.tabOn : ''} onClick={() => setActive(key)}>
                {TRIAL_MESSAGE_INFO[key].label}
                {texts[key] !== TRIAL_MESSAGE_DEFAULTS[key] && <i className={local.dot} title="Texto personalizado" />}
              </button>
            ))}
          </div>

          <div className={local.editor}>
            <div className={local.column}>
              <span className={styles.fieldLabel}>Sai {TRIAL_MESSAGE_INFO[active].when}</span>
              <textarea
                ref={area}
                className={`${styles.input} ${local.textarea}`}
                value={texts[active]}
                maxLength={TRIAL_MESSAGE_MAX}
                onChange={(event) => setTexts({ ...texts, [active]: event.target.value })}
                aria-label={`Texto: ${TRIAL_MESSAGE_INFO[active].label}`}
              />
              <div className={local.vars}>
                {TRIAL_MESSAGE_VARIABLES.map((variable) => (
                  <button key={variable.key} type="button" onClick={() => insertVariable(variable.key)} title={variable.label}>{`{${variable.key}}`}</button>
                ))}
              </div>
              <small className={styles.fieldHint}>
                Clique numa variável para inserir. <code>{'{proximo_passo}'}</code> é o primeiro passo que a empresa ainda não fez (conectar o WhatsApp, cadastrar a equipe…). Use *asteriscos* para negrito.
              </small>
              {texts[active] !== TRIAL_MESSAGE_DEFAULTS[active] && (
                <button type="button" className={`${styles.resetBtn} ${local.restore}`} onClick={() => setTexts({ ...texts, [active]: TRIAL_MESSAGE_DEFAULTS[active] })}>
                  <RotateCcw size={14} /> Voltar ao texto padrão
                </button>
              )}
            </div>
            <div className={local.column}>
              <span className={styles.fieldLabel}>Prévia (com dados de exemplo)</span>
              <div className={local.bubble} aria-label="Prévia da mensagem">{preview(renderTrialMessage(texts[active], sampleVars()))}</div>
              <div className={local.testRow}>
                <input className={styles.input} type="tel" inputMode="tel" placeholder="Seu WhatsApp com DDD" value={testPhone} onChange={(event) => setTestPhone(event.target.value)} aria-label="WhatsApp para o teste" />
                <button type="button" className={styles.resetBtn} disabled={busy !== null || testPhone.replace(/\D/g, '').length < 10 || !channel} onClick={sendTest}>
                  {busy === 'test' ? <Loader2 size={15} className={styles.spin} /> : <Send size={15} />} Enviar teste
                </button>
              </div>
            </div>
          </div>

          <div className={local.saveRow}>
            {feedback && <p className={feedback.ok ? styles.testOk : styles.testFail}>{feedback.ok ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />} {feedback.message}</p>}
            <button type="button" className={styles.saveBtn} onClick={save} disabled={busy !== null || !dirty}>
              {busy === 'save' ? <Loader2 size={16} className={styles.spin} /> : <Save size={16} />} Salvar mensagens
            </button>
          </div>
        </>
      )}
    </div>
  );
}
