'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, FileSpreadsheet, Loader2, Play, Upload, X } from 'lucide-react';
import styles from '../discador.module.css';
import { formatPhone, toE164 } from '@/lib/dialer/phone';
import { request } from './shared';

type Sheet = { fileName: string; headers: string[]; rows: Record<string, unknown>[] };

const NAME_HINTS = ['nome', 'name', 'cliente', 'contato', 'razao social', 'empresa'];
const PHONE_HINTS = ['telefone', 'celular', 'whatsapp', 'fone', 'phone', 'tel', 'numero', 'número', 'mobile'];
const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const guess = (headers: string[], hints: string[]) => headers.find((header) => hints.some((hint) => fold(header) === hint)) || headers.find((header) => hints.some((hint) => fold(header).includes(hint))) || '';

async function readSheet(file: File): Promise<Sheet> {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false });
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))].filter((header) => !header.startsWith('__EMPTY'));
  return { fileName: file.name, headers, rows };
}

interface Props {
  onClose: () => void;
  onCreated: (campaignId: string) => void;
}

/** Nova campanha: planilha → coluna do nome e do telefone → ajustes. */
export default function NewCampaignModal({ onClose, onCreated }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [nameColumn, setNameColumn] = useState('');
  const [phoneColumn, setPhoneColumn] = useState('');
  const [name, setName] = useState('');
  const [callsPerAgent, setCallsPerAgent] = useState(1);
  const [detectVoicemail, setDetectVoicemail] = useState(true);
  const [ringSeconds, setRingSeconds] = useState(25);
  const [busy, setBusy] = useState<'read' | 'save' | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy('read');
    setError('');
    try {
      const read = await readSheet(file);
      if (read.rows.length === 0) throw new Error('A planilha está vazia.');
      setSheet(read);
      setNameColumn(guess(read.headers, NAME_HINTS));
      setPhoneColumn(guess(read.headers, PHONE_HINTS));
      setName((current) => current || file.name.replace(/\.[^.]+$/, '').slice(0, 120));
    } catch (readError) {
      setError(readError instanceof Error ? readError.message : 'Não foi possível ler a planilha. Use .xlsx ou .csv.');
    } finally {
      setBusy(null);
    }
  };

  // Mesma regra do servidor: válidos, inválidos e repetidos.
  const analysis = useMemo(() => {
    if (!sheet || !phoneColumn) return null;
    const seen = new Set<string>();
    let invalid = 0;
    let duplicates = 0;
    const valid: { name: string; phone: string; data: Record<string, string> }[] = [];
    for (const row of sheet.rows) {
      const phone = toE164(row[phoneColumn]);
      if (!phone) { invalid += 1; continue; }
      if (seen.has(phone)) { duplicates += 1; continue; }
      seen.add(phone);
      const data: Record<string, string> = {};
      for (const header of sheet.headers) {
        if (header === phoneColumn || header === nameColumn) continue;
        const value = String(row[header] ?? '').trim();
        if (value) data[header] = value;
      }
      valid.push({ name: nameColumn ? String(row[nameColumn] ?? '').trim() : '', phone, data });
    }
    return { valid, invalid, duplicates };
  }, [sheet, phoneColumn, nameColumn]);

  const create = async (start: boolean) => {
    if (!analysis) return;
    setBusy('save');
    setError('');
    const created = await request<{ campaign: { id: string } }>('/api/dialer/campaigns', {
      method: 'POST',
      body: JSON.stringify({ name, callsPerAgent, detectVoicemail, ringSeconds, contacts: analysis.valid }),
    });
    if (created.error || !created.data) {
      setBusy(null);
      setError(created.error || 'Não foi possível criar a campanha.');
      return;
    }
    if (start) {
      const started = await request(`/api/dialer/campaigns/${created.data.campaign.id}`, { method: 'PATCH', body: JSON.stringify({ action: 'start' }) });
      if (started.error) setError(`Campanha criada, mas não começou: ${started.error}`);
    }
    setBusy(null);
    onCreated(created.data.campaign.id);
  };

  return (
    <div className={styles.overlay} onClick={() => !busy && onClose()}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-label="Nova campanha do Discador" onClick={(event) => event.stopPropagation()}>
        <div className={styles.modalHead}>
          <h2>Nova campanha</h2>
          <button type="button" className={styles.iconBtn} onClick={onClose} disabled={Boolean(busy)} aria-label="Fechar"><X size={18} /></button>
        </div>

        <button type="button" className={styles.drop} onClick={() => fileRef.current?.click()} disabled={busy === 'read'}>
          {busy === 'read' ? <Loader2 size={24} className={styles.spin} /> : sheet ? <FileSpreadsheet size={24} /> : <Upload size={24} />}
          <strong>{sheet ? sheet.fileName : 'Escolher planilha'}</strong>
          <span>{sheet ? `${sheet.rows.length} linha(s). Clique para trocar.` : 'Arquivo .xlsx ou .csv com uma coluna de telefone (o nome é opcional).'}</span>
        </button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(event) => { void pick(event.target.files?.[0]); event.target.value = ''; }} />

        {sheet && (
          <>
            <div className={styles.grid2}>
              <label className={styles.field}>
                <span>Coluna do telefone</span>
                <select className={styles.input} value={phoneColumn} onChange={(event) => setPhoneColumn(event.target.value)}>
                  <option value="">Escolha…</option>
                  {sheet.headers.map((header) => <option key={header} value={header}>{header}</option>)}
                </select>
              </label>
              <label className={styles.field}>
                <span>Coluna do nome</span>
                <select className={styles.input} value={nameColumn} onChange={(event) => setNameColumn(event.target.value)}>
                  <option value="">Sem nome</option>
                  {sheet.headers.map((header) => <option key={header} value={header}>{header}</option>)}
                </select>
              </label>
            </div>

            {analysis && (
              <>
                <div className={styles.summary}>
                  <div><strong>{analysis.valid.length}</strong><span>para ligar</span></div>
                  <div><strong>{analysis.invalid}</strong><span>telefone inválido</span></div>
                  <div><strong>{analysis.duplicates}</strong><span>repetido(s)</span></div>
                </div>
                {analysis.valid.length > 0 && (
                  <ul className={styles.preview}>
                    {analysis.valid.slice(0, 3).map((contact) => <li key={contact.phone}>{contact.name || 'Sem nome'} · {formatPhone(contact.phone)}</li>)}
                    {analysis.valid.length > 3 && <li>… e mais {analysis.valid.length - 3}</li>}
                  </ul>
                )}
                <small className={styles.hint}>As outras colunas (empresa, cidade, observação…) aparecem na tela do atendente durante a ligação. Número sem DDI ganha o +55.</small>
              </>
            )}

            <label className={styles.field}>
              <span>Nome da campanha</span>
              <input className={styles.input} value={name} maxLength={120} onChange={(event) => setName(event.target.value)} />
            </label>

            <div className={styles.field}>
              <span>Ligações por atendente livre</span>
              <div className={styles.chips}>
                {[1, 2, 3].map((value) => (
                  <button key={value} type="button" className={`${styles.chip} ${callsPerAgent === value ? styles.chipOn : ''}`} onClick={() => setCallsPerAgent(value)}>{value}</button>
                ))}
              </div>
              <small>1 é o mais seguro: ninguém atende e fica esperando. Com 2 ou 3 a fila anda mais rápido, mas se duas pessoas atenderem ao mesmo tempo, a segunda ouve um recado e desliga (&quot;sem atendente livre&quot;).</small>
            </div>

            <div className={styles.grid2}>
              <label className={styles.field}>
                <span>Tempo tocando</span>
                <select className={styles.input} value={ringSeconds} onChange={(event) => setRingSeconds(Number(event.target.value))}>
                  {[15, 20, 25, 30, 40].map((value) => <option key={value} value={value}>{value} segundos</option>)}
                </select>
              </label>
              <label className={styles.check} style={{ alignSelf: 'end' }}>
                <input type="checkbox" checked={detectVoicemail} onChange={(event) => setDetectVoicemail(event.target.checked)} />
                <span>Detectar caixa postal e desligar sozinho <small className={styles.hint}>(atrasa ~3 s ao atender; a Twilio cobra à parte)</small></span>
              </label>
            </div>
            <small className={styles.hint}>As conversas são gravadas. Avise o cliente no início da ligação, como pede a LGPD.</small>
          </>
        )}

        {error && <div className={styles.errorBox}><AlertTriangle size={16} /> <span>{error}</span></div>}

        <div className={styles.modalActions}>
          <button type="button" className={styles.ghostBtn} onClick={onClose} disabled={Boolean(busy)}>Cancelar</button>
          <button type="button" className={styles.secondaryBtn} disabled={!analysis?.valid.length || name.trim().length < 2 || Boolean(busy)} onClick={() => create(false)}>
            Criar sem começar
          </button>
          <button type="button" className={styles.callBtn} disabled={!analysis?.valid.length || name.trim().length < 2 || Boolean(busy)} onClick={() => create(true)}>
            {busy === 'save' ? <Loader2 size={16} className={styles.spin} /> : <Play size={16} />} Criar e começar
          </button>
        </div>
      </div>
    </div>
  );
}
