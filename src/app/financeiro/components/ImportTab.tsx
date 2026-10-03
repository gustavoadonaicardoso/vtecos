'use client';

import React, { useMemo, useRef, useState } from 'react';
import { CheckCircle2, Download, FileSpreadsheet, Upload } from 'lucide-react';
import styles from '../financeiro.module.css';
import { finRequest, toNum } from '../api';
import type { TabProps } from './shared';
import type { FinUnit } from '@/lib/finance/types';

type Kind = 'ingredients' | 'fixed_costs' | 'sales';

interface FieldDef {
  key: string;
  label: string;
  required?: boolean;
  synonyms: string[];
}

const KINDS: Record<Kind, { title: string; hint: string; fields: FieldDef[]; example: string[][] }> = {
  ingredients: {
    title: 'Insumos',
    hint: 'Nome, quantidade comprada, unidade e preço. Nomes repetidos atualizam o preço.',
    fields: [
      { key: 'name', label: 'Nome do insumo', required: true, synonyms: ['nome', 'insumo', 'ingrediente', 'produto', 'item', 'materia prima', 'descricao'] },
      { key: 'purchase_qty', label: 'Quantidade comprada', synonyms: ['quantidade', 'qtd', 'qtde', 'peso', 'volume', 'embalagem com'] },
      { key: 'purchase_unit', label: 'Unidade', synonyms: ['unidade', 'un', 'medida', 'unid'] },
      { key: 'purchase_price', label: 'Preço pago', required: true, synonyms: ['preco', 'valor', 'custo', 'preco pago', 'valor pago', 'total'] },
      { key: 'category', label: 'Tipo (ingrediente/embalagem)', synonyms: ['tipo', 'categoria', 'grupo'] },
      { key: 'supplier', label: 'Fornecedor', synonyms: ['fornecedor', 'marca', 'loja'] },
    ],
    example: [['Nome', 'Quantidade', 'Unidade', 'Preço', 'Tipo', 'Fornecedor'], ['Farinha de trigo', '5', 'kg', '25,00', 'ingrediente', 'Atacadão'], ['Caixa para bolo', '50', 'un', '60,00', 'embalagem', '']],
  },
  fixed_costs: {
    title: 'Despesas fixas',
    hint: 'Uma linha por despesa mensal: aluguel, luz, salários, pró-labore…',
    fields: [
      { key: 'name', label: 'Descrição', required: true, synonyms: ['descricao', 'despesa', 'nome', 'conta', 'item'] },
      { key: 'amount', label: 'Valor mensal', required: true, synonyms: ['valor', 'valor mensal', 'custo', 'total', 'preco'] },
      { key: 'category', label: 'Categoria', synonyms: ['categoria', 'tipo', 'grupo'] },
    ],
    example: [['Despesa', 'Valor', 'Categoria'], ['Aluguel', '1.800,00', 'Aluguel'], ['Energia', '450,00', 'Energia']],
  },
  sales: {
    title: 'Vendas',
    hint: 'Data, produto, quantidade e valor. Produtos e canais com o mesmo nome das fichas usam o custo da ficha.',
    fields: [
      { key: 'sold_at', label: 'Data', required: true, synonyms: ['data', 'dia', 'data da venda', 'emissao'] },
      { key: 'product_name', label: 'Produto', required: true, synonyms: ['produto', 'item', 'descricao', 'nome'] },
      { key: 'quantity', label: 'Quantidade', synonyms: ['quantidade', 'qtd', 'qtde', 'unidades'] },
      { key: 'unit_price', label: 'Preço unitário', synonyms: ['preco', 'preco unitario', 'valor unitario', 'valor'] },
      { key: 'channel_name', label: 'Canal', synonyms: ['canal', 'origem', 'plataforma', 'forma de venda'] },
      { key: 'discount', label: 'Desconto', synonyms: ['desconto'] },
    ],
    example: [['Data', 'Produto', 'Quantidade', 'Preço unitário', 'Canal'], ['01/10/2026', 'Bolo de chocolate', '2', '90,00', 'Balcão / Loja']],
  },
};

const plain = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

function normalizeUnit(value: unknown): FinUnit {
  const text = plain(String(value || ''));
  if (['g', 'gr', 'grama', 'gramas'].includes(text)) return 'g';
  if (['l', 'lt', 'litro', 'litros'].includes(text)) return 'l';
  if (['ml', 'mililitro', 'mililitros'].includes(text)) return 'ml';
  if (['un', 'und', 'unid', 'unidade', 'unidades', 'pc', 'pct', 'pacote', 'cx', 'caixa'].includes(text)) return 'un';
  if (['dz', 'duzia', 'duzias'].includes(text)) return 'dz';
  return 'kg';
}

/** dd/mm/aaaa, aaaa-mm-dd, data do Excel (número) ou Date. */
function normalizeDate(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
  if (typeof value === 'number' && value > 20000 && value < 80000) {
    return normalizeDate(new Date(Math.round((value - 25569) * 86400 * 1000) + 12 * 3600 * 1000));
  }
  const text = String(value || '').trim();
  const br = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (br) {
    const year = br[3].length === 2 ? `20${br[3]}` : br[3];
    return `${year}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`;
  }
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : '';
}

function parseCsv(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const delimiter = (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === delimiter) { row.push(cell); cell = ''; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += char;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

async function readSheet(file: File): Promise<unknown[][]> {
  if (/\.csv$|\.txt$/i.test(file.name)) {
    const buffer = await file.arrayBuffer();
    let text = new TextDecoder('utf-8').decode(buffer);
    if (text.includes('�')) text = new TextDecoder('windows-1252').decode(buffer);
    return parseCsv(text.replace(/^﻿/, ''));
  }
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: '' });
}

function guessMapping(headers: string[], fields: FieldDef[]) {
  const mapping: Record<string, number> = {};
  const used = new Set<number>();
  for (const field of fields) {
    const normalized = headers.map(plain);
    let index = normalized.findIndex((header, i) => !used.has(i) && field.synonyms.includes(header));
    if (index < 0) index = normalized.findIndex((header, i) => !used.has(i) && field.synonyms.some((synonym) => header.startsWith(synonym)));
    if (index >= 0) {
      mapping[field.key] = index;
      used.add(index);
    }
  }
  return mapping;
}

interface Props extends TabProps {
  onSalesImported: () => Promise<void>;
}

export default function ImportTab({ tenantId, reload, onSalesImported }: Props) {
  const [kind, setKind] = useState<Kind>('ingredients');
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<unknown[][]>([]);
  const [headerIndex, setHeaderIndex] = useState(0);
  const [mapping, setMapping] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ inserted: number; updated?: number; errors: { row: number; message: string }[] } | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const def = KINDS[kind];

  const headers = useMemo(() => (rows[headerIndex] || []).map((cell) => String(cell ?? '').trim()), [rows, headerIndex]);
  const body = useMemo(
    () => rows.slice(headerIndex + 1).filter((row) => row.some((cell) => String(cell ?? '').trim() !== '')),
    [rows, headerIndex]
  );

  const records = useMemo(() => body.map((row) => {
    const get = (key: string) => (mapping[key] === undefined ? '' : row[mapping[key]]);
    const text = (key: string) => String(get(key) ?? '').trim();
    if (kind === 'ingredients') {
      return {
        name: text('name'),
        purchase_qty: toNum(text('purchase_qty'), 1) || 1,
        purchase_unit: normalizeUnit(get('purchase_unit')),
        purchase_price: typeof get('purchase_price') === 'number' ? get('purchase_price') : toNum(text('purchase_price')),
        category: /embal/.test(plain(text('category'))) ? 'embalagem' : /outro/.test(plain(text('category'))) ? 'outro' : 'ingrediente',
        supplier: text('supplier'),
      };
    }
    if (kind === 'fixed_costs') {
      return {
        name: text('name'),
        amount: typeof get('amount') === 'number' ? get('amount') : toNum(text('amount')),
        category: text('category') || 'Outros',
        recurrence: 'monthly',
      };
    }
    return {
      sold_at: normalizeDate(get('sold_at')),
      product_name: text('product_name'),
      quantity: typeof get('quantity') === 'number' ? get('quantity') : toNum(text('quantity'), 1) || 1,
      unit_price: mapping.unit_price === undefined ? null : typeof get('unit_price') === 'number' ? get('unit_price') : toNum(text('unit_price')),
      channel_name: text('channel_name'),
      discount: typeof get('discount') === 'number' ? get('discount') : toNum(text('discount')),
    };
  }), [body, mapping, kind]);

  const missing = def.fields.filter((field) => field.required && mapping[field.key] === undefined);

  const loadFile = async (file: File) => {
    setError('');
    setResult(null);
    try {
      const data = await readSheet(file);
      // Cabeçalho = primeira linha com pelo menos 2 colunas preenchidas.
      const header = Math.max(0, data.findIndex((row) => row.filter((cell) => String(cell ?? '').trim() !== '').length >= 2));
      setRows(data);
      setHeaderIndex(header);
      setMapping(guessMapping((data[header] || []).map((cell) => String(cell ?? '')), def.fields));
      setFileName(file.name);
    } catch {
      setError('Não consegui ler o arquivo. Use .xlsx, .xls ou .csv.');
    }
  };

  const changeKind = (next: Kind) => {
    setKind(next);
    setResult(null);
    if (rows.length > 0) setMapping(guessMapping(headers, KINDS[next].fields));
  };

  const downloadTemplate = () => {
    const csv = def.example.map((row) => row.map((cell) => (cell.includes(';') ? `"${cell}"` : cell)).join(';')).join('\n');
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `modelo-${kind}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const runImport = async () => {
    if (records.length === 0 || missing.length > 0) return;
    setBusy(true);
    setError('');
    try {
      if (kind === 'sales') {
        const response = await finRequest<{ data: unknown[]; errors: { row: number; message: string }[] }>('/sales', tenantId, {
          method: 'POST',
          body: { sales: records, source: 'import' },
        });
        setResult({ inserted: Array.isArray(response.data) ? response.data.length : 0, errors: response.errors || [] });
        await onSalesImported();
      } else {
        const response = await finRequest<{ inserted: number; updated: number; errors: { row: number; message: string }[] }>('/import', tenantId, {
          method: 'POST',
          body: { kind, rows: records },
        });
        setResult(response);
        await reload();
      }
      setRows([]);
      setFileName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha na importação.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <h2><FileSpreadsheet size={18} /> Importar da sua planilha</h2>
        <button className={styles.secondaryButton} onClick={downloadTemplate}><Download size={15} /> Modelo de {def.title.toLowerCase()}</button>
      </div>
      <p className={styles.panelHint}>
        Traga a planilha que você já usa (Excel ou CSV). O sistema reconhece as colunas pelo nome; confira o mapeamento antes de importar.
      </p>

      <div className={styles.choiceRow} style={{ marginBottom: 16 }}>
        {(Object.keys(KINDS) as Kind[]).map((item) => (
          <button key={item} className={`${styles.choice} ${kind === item ? styles.choiceActive : ''}`} onClick={() => changeKind(item)}>
            <strong>{KINDS[item].title}</strong>
            <small>{KINDS[item].hint}</small>
          </button>
        ))}
      </div>

      {error && <div className={styles.errorBanner} style={{ marginBottom: 12 }}>{error}</div>}

      {result && (
        <div className={styles.infoBanner} style={{ marginBottom: 12, flexDirection: 'column', alignItems: 'flex-start' }}>
          <strong><CheckCircle2 size={16} style={{ verticalAlign: '-3px' }} /> {result.inserted} importado(s){result.updated ? `, ${result.updated} atualizado(s)` : ''}.</strong>
          {result.errors.length > 0 && (
            <span className={styles.warn}>
              {result.errors.length} linha(s) ignorada(s): {result.errors.slice(0, 5).map((item) => `linha ${item.row} — ${item.message}`).join('; ')}
              {result.errors.length > 5 ? '…' : ''}
            </span>
          )}
        </div>
      )}

      <div
        className={`${styles.dropZone} ${dragging ? styles.dropActive : ''}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const file = event.dataTransfer.files?.[0];
          if (file) loadFile(file);
        }}
      >
        <Upload size={28} />
        <strong>{fileName || 'Arraste o arquivo aqui ou clique para escolher'}</strong>
        <small>.xlsx, .xls ou .csv — primeira aba da planilha</small>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv,.txt"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) loadFile(file);
            event.target.value = '';
          }}
        />
      </div>

      {rows.length > 0 && (
        <>
          <h3 style={{ margin: '22px 0 10px', fontSize: '0.95rem' }}>Quais colunas são o quê?</h3>
          <div className={styles.mapGrid}>
            {def.fields.map((field) => (
              <label key={field.key} className={styles.field}>
                {field.label}{field.required ? ' *' : ''}
                <select
                  className={styles.input}
                  value={mapping[field.key] ?? ''}
                  onChange={(event) => setMapping((state) => {
                    const next = { ...state };
                    if (event.target.value === '') delete next[field.key];
                    else next[field.key] = Number(event.target.value);
                    return next;
                  })}
                >
                  <option value="">— não usar —</option>
                  {headers.map((header, index) => <option key={index} value={index}>{header || `Coluna ${index + 1}`}</option>)}
                </select>
              </label>
            ))}
          </div>

          <h3 style={{ margin: '22px 0 10px', fontSize: '0.95rem' }}>Prévia ({records.length} linhas)</h3>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>{def.fields.map((field) => <th key={field.key}>{field.label}</th>)}</tr>
              </thead>
              <tbody>
                {records.slice(0, 8).map((record, index) => (
                  <tr key={index}>
                    {def.fields.map((field) => {
                      const value = (record as Record<string, unknown>)[field.key];
                      return <td key={field.key}>{value === null || value === undefined || value === '' ? <span className={styles.muted}>—</span> : String(value)}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={styles.toolbar} style={{ marginTop: 16, justifyContent: 'flex-end' }}>
            {missing.length > 0 && <span className={styles.warn}>Escolha a coluna de: {missing.map((field) => field.label).join(', ')}</span>}
            <button className={styles.secondaryButton} onClick={() => { setRows([]); setFileName(''); }}>Cancelar</button>
            <button className={styles.primaryButton} disabled={busy || missing.length > 0 || records.length === 0} onClick={runImport}>
              {busy ? 'Importando…' : `Importar ${records.length} ${def.title.toLowerCase()}`}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
