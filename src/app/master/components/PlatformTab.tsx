import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Copy, KeyRound, Link2, Loader2, PlugZap, Save, Sparkles, AlertTriangle } from 'lucide-react';
import { motion } from 'framer-motion';
import styles from '../master.module.css';

type Source = 'painel' | 'env' | 'padrão' | 'vazio';
interface FieldView { key: string; env: string; secret: boolean; source: Source; value: string; hasValue: boolean }
type Result = { ok: boolean; message: string } | null;

const SOURCE_LABEL: Record<Source, string> = { painel: 'salvo aqui', env: 'vindo do .env', 'padrão': 'padrão', vazio: 'vazio' };

const origin = () => (typeof window !== 'undefined' ? window.location.origin : '');

function CopyLine({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      <div className={styles.copyRow}>
        <input className={styles.input} value={value} readOnly onFocus={(e) => e.currentTarget.select()} />
        <button type="button" className={styles.resetBtn} onClick={() => navigator.clipboard?.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => undefined)}>
          {copied ? <CheckCircle2 size={15} /> : <Copy size={15} />} {copied ? 'Copiado' : 'Copiar'}
        </button>
      </div>
    </div>
  );
}

/**
 * Painel Master > Plataforma: o que é da Vórtice e vale para todas as
 * empresas (app da Meta, webhook do WhatsApp, IA padrão). Substitui o
 * .env: campo vazio aqui usa o valor do .env, se existir.
 */
export default function PlatformTab() {
  const [fields, setFields] = useState<FieldView[] | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [initial, setInitial] = useState<Record<string, string>>({});
  const [clear, setClear] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Result>(null);
  const [tests, setTests] = useState<Record<string, Result>>({});

  const apply = useCallback((data: { fields: FieldView[] }) => {
    setFields(data.fields);
    const loaded = Object.fromEntries(data.fields.map((field) => [field.key, field.secret ? '' : field.value]));
    setValues(loaded);
    setInitial(loaded);
    setClear([]);
  }, []);

  useEffect(() => {
    fetch('/api/master/platform', { cache: 'no-store' })
      .then((response) => response.json().then((json) => ({ ok: response.ok, json })))
      .then(({ ok, json }) => (ok ? apply(json.data) : setFeedback({ ok: false, message: json.error || 'Não foi possível carregar.' })))
      .catch(() => setFeedback({ ok: false, message: 'Não foi possível carregar.' }));
  }, [apply]);

  const field = (key: string) => fields?.find((item) => item.key === key);
  const set = (key: string, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
    setClear((current) => current.filter((item) => item !== key));
  };

  const save = async () => {
    setBusy('save');
    setFeedback(null);
    // Só o que mudou: valor que veio do .env ou padrão não é copiado para o painel.
    const changed = Object.fromEntries(Object.entries(values).filter(([key, value]) => value !== initial[key]));
    const response = await fetch('/api/master/platform', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ values: changed, clear }) }).catch(() => null);
    const json = response ? await response.json().catch(() => ({})) : {};
    setBusy(null);
    if (!response?.ok) {
      setFeedback({ ok: false, message: json.error || 'Não foi possível salvar.' });
      return;
    }
    apply(json.data);
    setFeedback({ ok: true, message: 'Configurações salvas. Valem para todas as empresas em até 30 segundos, sem deploy.' });
  };

  const test = async (target: string) => {
    setBusy(target);
    const response = await fetch('/api/master/platform', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target }) }).catch(() => null);
    const json = response ? await response.json().catch(() => ({})) : {};
    setBusy(null);
    setTests((current) => ({ ...current, [target]: json.data || { ok: false, message: json.error || 'Falha no teste.' } }));
  };

  const badge = (name: string) => {
    const item = field(name);
    if (!item) return null;
    const source = clear.includes(name) ? 'vazio' : item.source;
    return <span className={styles.sourceBadge} data-source={source}>{SOURCE_LABEL[source]}</span>;
  };

  const input = (name: string, label: string, placeholder?: string, hint?: React.ReactNode) => {
    const item = field(name);
    const secretSaved = item?.secret && item.hasValue && !clear.includes(name);
    return (
      <div className={styles.field}>
        <span className={styles.fieldLabel}>{label} {badge(name)}</span>
        <input
          className={styles.input}
          type={item?.secret ? 'password' : 'text'}
          autoComplete={item?.secret ? 'new-password' : 'off'}
          value={values[name] ?? ''}
          placeholder={secretSaved ? '•••••••• salvo — deixe em branco para manter' : placeholder}
          onChange={(event) => set(name, event.target.value)}
        />
        {hint && <small className={styles.fieldHint}>{hint}</small>}
        {item?.secret && item.source === 'painel' && !clear.includes(name) && (
          <button type="button" className={styles.linkButton} onClick={() => { setClear((current) => [...current, name]); setValues((current) => ({ ...current, [name]: '' })); }}>
            Apagar daqui (volta a usar o .env, se houver)
          </button>
        )}
      </div>
    );
  };

  const testResult = (name: string) => {
    const result = tests[name];
    if (!result) return null;
    return <p className={result.ok ? styles.testOk : styles.testFail}>{result.ok ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />} {result.message}</p>;
  };

  if (!fields) {
    return <div className={styles.card}>{feedback ? feedback.message : <><Loader2 size={16} className={styles.spin} /> Carregando…</>}</div>;
  }

  const provider = (values.aiProvider || 'gemini') === 'ollama' ? 'ollama' : 'gemini';

  return (
    <motion.div key="platform" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} className={styles.grid}>
      <div className={`${styles.card} ${styles.cardWide}`}>
        <p className={styles.hint} style={{ margin: 0 }}>
          Aqui fica o que é <strong>da Vórtice</strong> e vale para todas as empresas. Os clientes nunca veem esta tela: eles conectam as contas deles em <strong>Integrações</strong>.
          Campo vazio aqui usa o valor do <code>.env</code>, se existir.
        </p>
      </div>

      <div className={styles.card}>
        <div className={styles.cardHeader}><KeyRound size={20} /><h2>App da Meta</h2></div>
        <p className={styles.hint}>Usado no &quot;Conectar com Facebook&quot; das Redes Sociais e do WhatsApp oficial de todas as empresas. Fica em developers.facebook.com &gt; seu app &gt; Configurações do app &gt; Básico.</p>
        {input("metaAppId", "ID do app", "Ex.: 1234567890123456")}
        {input("metaAppSecret", "Chave secreta do app", "Cole a chave secreta")}
        {input("metaLoginConfigId", "ID da configuração de login (Redes Sociais, opcional)", "Login do Facebook para Empresas > Configurações")}
        {input("metaWaConfigId", "ID da configuração de cadastro do WhatsApp", "Configuração do tipo WhatsApp Embedded Signup", "Sem ele, o botão Conectar com Facebook do WhatsApp fica escondido e as empresas usam o formulário manual.")}
        <div className={styles.inlineActions}>
          <button type="button" className={styles.resetBtn} disabled={busy !== null} onClick={() => test('meta')}>
            {busy === 'meta' ? <Loader2 size={15} className={styles.spin} /> : <PlugZap size={15} />} Testar app
          </button>
        </div>
        {testResult("meta")}
      </div>

      <div className={styles.card}>
        <div className={styles.cardHeader}><Link2 size={20} /><h2>Endereços para cadastrar no app da Meta</h2></div>
        <p className={styles.hint}>Cole estes valores no painel do app da Meta uma vez.</p>
        <CopyLine label="URI de redirecionamento do login (Login do Facebook > Configurações)" value={`${origin()}/api/social/oauth/callback`} />
        <CopyLine label="URL do webhook do WhatsApp (WhatsApp > Configuração > Webhook)" value={`${origin()}/api/webhooks/meta`} />
        <CopyLine label="URL do webhook do Instagram e do Messenger (Webhooks > Instagram e Página) — a mesma" value={`${origin()}/api/webhooks/meta`} />
        {input("whatsappVerifyToken", "Token de verificação do webhook", undefined, "O mesmo texto no campo Verificar token da Meta (vale para WhatsApp, Instagram e Página). Depois de verificar, assine o campo messages; na Página, também message_echoes.")}
        <CopyLine label="Política de privacidade" value={`${origin()}/politica-de-privacidade`} />
      </div>

      <div className={`${styles.card} ${styles.cardWide}`}>
        <div className={styles.cardHeader}><Sparkles size={20} /><h2>IA padrão da Vórtice</h2></div>
        <p className={styles.hint}>Usada pelas empresas que não cadastraram a própria chave do Gemini (Atendente com IA, legendas e notas fiscais).</p>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Qual IA {badge("aiProvider")}</span>
          <select className={styles.input} value={provider} onChange={(event) => set('aiProvider', event.target.value)}>
            <option value="gemini">Google Gemini (nuvem)</option>
            <option value="ollama">IA local na VPS (Ollama), com o Gemini de reserva</option>
          </select>
        </div>
        {input("geminiKey", provider === 'ollama' ? 'Chave do Gemini (reserva e notas fiscais)' : 'Chave do Gemini', "AIza…", "Crie em aistudio.google.com/app/apikey.")}
        {provider === 'ollama' && (
          <div className={styles.twoCols}>
            {input("ollamaUrl", "Endereço da IA local", "http://127.0.0.1:11434")}
            {input("ollamaModel", "Modelo", "gemma3:4b")}
          </div>
        )}
        <div className={styles.inlineActions}>
          <button type="button" className={styles.resetBtn} disabled={busy !== null} onClick={() => test('gemini')}>
            {busy === 'gemini' ? <Loader2 size={15} className={styles.spin} /> : <PlugZap size={15} />} Testar Gemini
          </button>
          {provider === 'ollama' && (
            <button type="button" className={styles.resetBtn} disabled={busy !== null} onClick={() => test('ollama')}>
              {busy === 'ollama' ? <Loader2 size={15} className={styles.spin} /> : <PlugZap size={15} />} Testar IA local
            </button>
          )}
        </div>
        {testResult("gemini")}
        {testResult("ollama")}
      </div>

      <div className={`${styles.card} ${styles.cardWide} ${styles.saveRow}`}>
        {feedback && <p className={feedback.ok ? styles.testOk : styles.testFail}>{feedback.ok ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />} {feedback.message}</p>}
        <button type="button" className={styles.saveBtn} onClick={save} disabled={busy !== null}>
          {busy === 'save' ? <Loader2 size={16} className={styles.spin} /> : <Save size={16} />} Salvar configurações
        </button>
      </div>
    </motion.div>
  );
}
