"use client";

import React, { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText,
  Building2,
  Sparkles,
  Plus,
  Minus,
  Download,
  Printer,
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
  AlertCircle,
  Info,
  Copy,
  RefreshCw,
  Hash,
  FileSpreadsheet,
  Table2,
  UploadCloud,
  CheckCircle2,
  Trash2,
} from 'lucide-react';
import styles from './fiscal.module.css';

// Tipos centralizados em @/types/fiscal
import type { EmitentInfo, NotaFiscalGerada as NotaGerada } from '@/types/fiscal';

// Utilitários centralizados em @/lib/fiscal
import {
  formatCNPJ,
  formatCEP,
  gerarChaveAcesso,
  gerarProtocolo,
  downloadModeloCSV,
  exportNotasCSV,
  buildPrintHTML,
  REGIMES_TRIBUTARIOS as REGIMES,
  ESTADOS_BR as ESTADOS,
} from '@/lib/fiscal';

// ─────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────
export default function FiscalPage() {
  const [emitente, setEmitente] = useState<EmitentInfo>({
    razaoSocial: '',
    cnpj: '',
    inscricaoEstadual: '',
    endereco: '',
    cidade: '',
    estado: 'SP',
    cep: '',
    email: '',
    telefone: '',
    regimeTributario: 'Simples Nacional',
  });

  const [quantidade, setQuantidade] = useState(1);
  const [contexto, setContexto] = useState('');
  const [notas, setNotas] = useState<NotaGerada[]>([]);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [expandedNota, setExpandedNota] = useState<string | null>(null);
  const [step, setStep] = useState<'config' | 'generating' | 'done'>('config');
  const [logLines, setLogLines] = useState<string[]>([]);
  const logRef = useRef<HTMLDivElement>(null);

  // ── CSV Upload state ──
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvContent, setCsvContent] = useState<string>('');
  const [csvRowCount, setCsvRowCount] = useState(0);
  const [csvDragging, setCsvDragging] = useState(false);
  const csvInputRef = useRef<HTMLInputElement>(null);

  const addLog = (line: string) => {
    setLogLines(prev => {
      const updated = [...prev, `[${new Date().toLocaleTimeString('pt-BR')}] ${line}`];
      setTimeout(() => {
        if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
      }, 50);
      return updated;
    });
  };

  const handleEmit = async () => {
    if (!emitente.razaoSocial || !emitente.cnpj) {
      setErro('Preencha pelo menos Razão Social e CNPJ do emitente.');
      return;
    }
    if (quantidade < 1 || quantidade > 400) {
      setErro('A quantidade deve ser entre 1 e 400 notas.');
      return;
    }

    setErro(null);
    setNotas([]);
    setLogLines([]);
    setGerando(true);
    setStep('generating');

    addLog(`Iniciando emissão de ${quantidade} nota(s) fiscal(is)...`);
    addLog(`Emitente: ${emitente.razaoSocial} — CNPJ: ${emitente.cnpj}`);
    addLog(`Regime Tributário: ${emitente.regimeTributario}`);
    addLog('Conectando ao motor de IA (Gemini)...');

    try {
      const response = await fetch('/api/fiscal/gerar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emitente,
          quantidade,
          contexto,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Erro HTTP ${response.status}`);
      }

      const { notas: notasGeradas } = await response.json();

      for (let i = 0; i < notasGeradas.length; i++) {
        const nota = notasGeradas[i];
        addLog(`✓ NF-e Nº ${nota.numero} gerada — Destinatário: ${nota.destinatario.nome}`);
        setNotas(prev => [...prev, {
          ...nota,
          id: `nf-${i}-${Date.now()}`,
          chaveAcesso: gerarChaveAcesso(),
          protocolo: gerarProtocolo(),
          status: 'gerada',
        }]);
        // Small artificial delay per note for UX feel
        await new Promise(r => setTimeout(r, 120));
      }

      addLog(`✅ Emissão concluída! ${notasGeradas.length} nota(s) gerada(s) com sucesso.`);
      setStep('done');
    } catch (err: any) {
      addLog(`❌ Erro: ${err.message}`);
      setErro(err.message || 'Ocorreu um erro ao gerar as notas fiscais.');
      setStep('config');
    } finally {
      setGerando(false);
    }
  };

  const handleReset = () => {
    setNotas([]);
    setLogLines([]);
    setErro(null);
    setStep('config');
    setExpandedNota(null);
  };

  const copyChave = (chave: string) => {
    navigator.clipboard.writeText(chave);
  };

  // ── CSV Upload handlers ──
  const handleCsvFile = useCallback((file: File) => {
    if (!file.name.endsWith('.csv')) {
      setErro('Por favor, selecione um arquivo .CSV válido.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setCsvContent(text);
      setCsvFile(file);
      // Count data rows (total lines minus header)
      const lines = text.split('\n').filter(l => l.trim().length > 0);
      setCsvRowCount(Math.max(0, lines.length - 1));
      setErro(null);
    };
    reader.readAsText(file, 'utf-8');
  }, []);

  const handleCsvDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setCsvDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleCsvFile(file);
  }, [handleCsvFile]);

  const handleCsvInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleCsvFile(file);
  };

  const clearCsv = () => {
    setCsvFile(null);
    setCsvContent('');
    setCsvRowCount(0);
    if (csvInputRef.current) csvInputRef.current.value = '';
  };

  // ── Emit via CSV ──
  const handleEmitCSV = async () => {
    if (!emitente.razaoSocial || !emitente.cnpj) {
      setErro('Preencha pelo menos Razão Social e CNPJ do emitente.');
      return;
    }
    if (!csvContent || csvRowCount === 0) {
      setErro('Faça upload de um arquivo CSV com dados válidos.');
      return;
    }

    setErro(null);
    setNotas([]);
    setLogLines([]);
    setGerando(true);
    setStep('generating');

    addLog(`Iniciando emissão via CSV — ${csvRowCount} linha(s) detectada(s)...`);
    addLog(`Emitente: ${emitente.razaoSocial} — CNPJ: ${emitente.cnpj}`);
    addLog('Enviando dados do CSV para análise da IA (Gemini)...');

    try {
      const response = await fetch('/api/fiscal/csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emitente,
          csvContent,
          contexto,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Erro HTTP ${response.status}`);
      }

      const { notas: notasGeradas } = await response.json();

      for (let i = 0; i < notasGeradas.length; i++) {
        const nota = notasGeradas[i];
        addLog(`✓ NF-e Nº ${nota.numero} gerada — Destinatário: ${nota.destinatario.nome}`);
        setNotas(prev => [...prev, {
          ...nota,
          id: `nf-csv-${i}-${Date.now()}`,
          chaveAcesso: gerarChaveAcesso(),
          protocolo: gerarProtocolo(),
          status: 'gerada',
        }]);
        await new Promise(r => setTimeout(r, 100));
      }

      addLog(`✅ Emissão concluída! ${notasGeradas.length} nota(s) gerada(s) com sucesso.`);
      setStep('done');
    } catch (err: any) {
      addLog(`❌ Erro: ${err.message}`);
      setErro(err.message || 'Ocorreu um erro ao processar o CSV.');
      setStep('config');
    } finally {
      setGerando(false);
    }
  };

  const handlePrint = (nota: NotaGerada) => {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(buildPrintHTML(nota, emitente));
    w.document.close();
    w.print();
  };


  return (
    <div className={styles.container}>
      {/* ── HEADER ── */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.headerIcon}>
            <FileText size={28} />
          </div>
          <div>
            <h1 className={styles.title}>Emissão de Notas Fiscais</h1>
            <p className={styles.subtitle}>Motor de IA para geração automatizada de NF-e em escala</p>
          </div>
        </div>
        {step === 'done' && (
          <button className={styles.resetBtn} onClick={handleReset}>
            <RefreshCw size={16} /> Nova Emissão
          </button>
        )}
      </header>

      <div className={styles.layout}>
        {/* ── LEFT PANEL — EMITENTE CONFIG ── */}
        <div className={styles.leftPanel}>
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <Building2 size={20} />
              <span>Dados do Emitente</span>
            </div>

            <div className={styles.formGrid}>
              <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                <label>Razão Social / Nome Fantasia *</label>
                <input
                  className={styles.input}
                  placeholder="Ex: Vórtice Tecnologia Ltda."
                  value={emitente.razaoSocial}
                  onChange={e => setEmitente({ ...emitente, razaoSocial: e.target.value })}
                  disabled={gerando}
                />
              </div>

              <div className={styles.formGroup}>
                <label>CNPJ *</label>
                <input
                  className={styles.input}
                  placeholder="00.000.000/0001-00"
                  value={emitente.cnpj}
                  onChange={e => setEmitente({ ...emitente, cnpj: formatCNPJ(e.target.value) })}
                  disabled={gerando}
                />
              </div>

              <div className={styles.formGroup}>
                <label>Inscrição Estadual</label>
                <input
                  className={styles.input}
                  placeholder="000.000.000.000"
                  value={emitente.inscricaoEstadual}
                  onChange={e => setEmitente({ ...emitente, inscricaoEstadual: e.target.value })}
                  disabled={gerando}
                />
              </div>

              <div className={styles.formGroup}>
                <label>Regime Tributário</label>
                <select
                  className={styles.input}
                  value={emitente.regimeTributario}
                  onChange={e => setEmitente({ ...emitente, regimeTributario: e.target.value })}
                  disabled={gerando}
                >
                  {REGIMES.map(r => <option key={r}>{r}</option>)}
                </select>
              </div>

              <div className={styles.formGroup}>
                <label>E-mail</label>
                <input
                  className={styles.input}
                  type="email"
                  placeholder="contato@empresa.com.br"
                  value={emitente.email}
                  onChange={e => setEmitente({ ...emitente, email: e.target.value })}
                  disabled={gerando}
                />
              </div>

              <div className={styles.formGroup}>
                <label>Telefone</label>
                <input
                  className={styles.input}
                  placeholder="(00) 00000-0000"
                  value={emitente.telefone}
                  onChange={e => setEmitente({ ...emitente, telefone: e.target.value })}
                  disabled={gerando}
                />
              </div>

              <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                <label>Endereço Completo</label>
                <input
                  className={styles.input}
                  placeholder="Rua, Número, Bairro"
                  value={emitente.endereco}
                  onChange={e => setEmitente({ ...emitente, endereco: e.target.value })}
                  disabled={gerando}
                />
              </div>

              <div className={styles.formGroup}>
                <label>Cidade</label>
                <input
                  className={styles.input}
                  placeholder="São Paulo"
                  value={emitente.cidade}
                  onChange={e => setEmitente({ ...emitente, cidade: e.target.value })}
                  disabled={gerando}
                />
              </div>

              <div className={styles.formGroup}>
                <label>Estado</label>
                <select
                  className={styles.input}
                  value={emitente.estado}
                  onChange={e => setEmitente({ ...emitente, estado: e.target.value })}
                  disabled={gerando}
                >
                  {ESTADOS.map(uf => <option key={uf}>{uf}</option>)}
                </select>
              </div>

              <div className={styles.formGroup}>
                <label>CEP</label>
                <input
                  className={styles.input}
                  placeholder="00000-000"
                  value={emitente.cep}
                  onChange={e => setEmitente({ ...emitente, cep: formatCEP(e.target.value) })}
                  disabled={gerando}
                />
              </div>
            </div>
          </div>

          {/* ── CSV Upload Section ── */}
          <div className={styles.csvUploadCard}>
            <div className={styles.csvUploadHeader}>
              <UploadCloud size={20} className={styles.csvUploadIcon} />
              <span>Emitir via Planilha CSV</span>
              <span className={styles.badgeBlue}>Novo</span>
            </div>

            <p className={styles.csvUploadDesc}>
              Faça upload de um arquivo <strong>.CSV</strong> com os dados dos compradores e itens.
              A IA irá ler cada linha e gerar automaticamente as notas fiscais.
            </p>

            {/* Drag-and-drop zone */}
            {!csvFile ? (
              <div
                className={`${styles.csvDropZone} ${csvDragging ? styles.csvDropZoneActive : ''}`}
                onDragOver={e => { e.preventDefault(); setCsvDragging(true); }}
                onDragLeave={() => setCsvDragging(false)}
                onDrop={handleCsvDrop}
                onClick={() => csvInputRef.current?.click()}
              >
                <UploadCloud size={32} className={styles.csvDropIcon} />
                <p className={styles.csvDropText}>Arraste o arquivo CSV aqui</p>
                <p className={styles.csvDropSub}>ou clique para selecionar</p>
                <input
                  ref={csvInputRef}
                  type="file"
                  accept=".csv"
                  style={{ display: 'none' }}
                  onChange={handleCsvInputChange}
                />
              </div>
            ) : (
              <div className={styles.csvFileInfo}>
                <div className={styles.csvFileInfoLeft}>
                  <CheckCircle2 size={20} className={styles.csvFileOk} />
                  <div>
                    <p className={styles.csvFileName}>{csvFile.name}</p>
                    <p className={styles.csvFileRows}>{csvRowCount} linha{csvRowCount !== 1 ? 's' : ''} de dados detectada{csvRowCount !== 1 ? 's' : ''}</p>
                  </div>
                </div>
                <button className={styles.csvClearBtn} onClick={clearCsv} title="Remover arquivo">
                  <Trash2 size={15} />
                </button>
              </div>
            )}

            {/* Emit button for CSV mode */}
            {csvFile && (
              <button
                className={styles.emitCsvBtn}
                onClick={handleEmitCSV}
                disabled={gerando}
              >
                {gerando ? (
                  <><Loader2 size={18} className={styles.spin} /> Processando CSV...</>
                ) : (
                  <><Sparkles size={18} /> Emitir {csvRowCount} Nota{csvRowCount !== 1 ? 's' : ''} via CSV</>
                )}
              </button>
            )}
          </div>

          {/* CSV Modelo Card */}
          <div className={styles.csvCard}>
            <div className={styles.csvCardLeft}>
              <FileSpreadsheet size={22} className={styles.csvIcon} />
              <div>
                <p className={styles.csvTitle}>Modelo de Planilha (Receita Federal)</p>
                <p className={styles.csvDesc}>Baixe o CSV com todos os campos obrigatórios da NF-e para preenchimento dos destinatários.</p>
              </div>
            </div>
            <button className={styles.csvDownloadBtn} onClick={downloadModeloCSV}>
              <Download size={16} /> Baixar Modelo .CSV
            </button>
          </div>

          {/* Context / Instructions */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <Sparkles size={20} className={styles.sparkIcon} />
              <span>Instruções para a IA</span>
              <span className={styles.badge}>Opcional</span>
            </div>
            <div className={styles.formGroup} style={{ marginTop: 0 }}>
              <textarea
                className={styles.textarea}
                placeholder="Ex: Gere notas para venda de serviços de consultoria de TI, valores entre R$ 500 e R$ 5.000, clientes de São Paulo e Minas Gerais, CFOP 5102..."
                rows={5}
                value={contexto}
                onChange={e => setContexto(e.target.value)}
                disabled={gerando}
              />
            </div>
            <div className={styles.aiHint}>
              <Info size={14} />
              <span>Quanto mais contexto você fornecer, mais precisas e realistas serão as notas geradas pela IA.</span>
            </div>
          </div>
        </div>

        {/* ── RIGHT PANEL ── */}
        <div className={styles.rightPanel}>
          {/* Quantity + Emit Card */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <Hash size={20} />
              <span>Quantidade de Notas</span>
            </div>

            <div className={styles.quantitySection}>
              <div className={styles.quantityControl}>
                <button
                  className={styles.qtyBtn}
                  onClick={() => setQuantidade(q => Math.max(1, q - 1))}
                  disabled={gerando || quantidade <= 1}
                >
                  <Minus size={20} />
                </button>
                <div className={styles.qtyDisplay}>
                  <span className={styles.qtyNumber}>{quantidade}</span>
                  <span className={styles.qtyLabel}>nota{quantidade !== 1 ? 's' : ''}</span>
                </div>
                <button
                  className={styles.qtyBtn}
                  onClick={() => setQuantidade(q => Math.min(400, q + 1))}
                  disabled={gerando || quantidade >= 400}
                >
                  <Plus size={20} />
                </button>
              </div>

              <div className={styles.qtySliderWrapper}>
                <input
                  type="range"
                  min={1}
                  max={400}
                  value={quantidade}
                  onChange={e => setQuantidade(Number(e.target.value))}
                  className={styles.slider}
                  disabled={gerando}
                />
                <div className={styles.sliderLabels}>
                  <span>1</span><span>100</span><span>200</span><span>400</span>
                </div>
              </div>

              <div className={styles.presets}>
                {[1, 10, 50, 100, 200, 400].map(n => (
                  <button
                    key={n}
                    className={`${styles.presetBtn} ${quantidade === n ? styles.presetActive : ''}`}
                    onClick={() => setQuantidade(n)}
                    disabled={gerando}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {erro && (
              <div className={styles.errorBox}>
                <AlertCircle size={16} />
                <span>{erro}</span>
              </div>
            )}

            <button
              className={styles.emitBtn}
              onClick={handleEmit}
              disabled={gerando}
            >
              {gerando ? (
                <><Loader2 size={20} className={styles.spin} /> Gerando notas...</>
              ) : (
                <><Sparkles size={20} /> Emitir {quantidade} Nota{quantidade !== 1 ? 's' : ''} com IA</>
              )}
            </button>
          </div>

          {/* Generation Log */}
          <AnimatePresence>
            {(gerando || logLines.length > 0) && (
              <motion.div
                className={styles.card}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <div className={styles.cardHeader}>
                  <div className={`${styles.logDot} ${gerando ? styles.logDotActive : styles.logDotDone}`} />
                  <span>{gerando ? 'Processando...' : 'Log de Emissão'}</span>
                </div>
                <div className={styles.logContainer} ref={logRef}>
                  {logLines.map((line, i) => (
                    <div key={i} className={styles.logLine}>{line}</div>
                  ))}
                  {gerando && <div className={styles.logCursor} />}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Generated Notes */}
          <AnimatePresence>
            {notas.length > 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className={styles.notasSection}
              >
                <div className={styles.notasHeader}>
                  <h3><Check size={18} /> {notas.length} Nota{notas.length !== 1 ? 's' : ''} Gerada{notas.length !== 1 ? 's' : ''}</h3>
                  <button className={styles.exportCsvBtn} onClick={() => exportNotasCSV(notas, emitente)}>
                    <FileSpreadsheet size={16} /> Exportar CSV
                  </button>
                </div>

                {/* CSV Export Banner */}
                <div className={styles.csvBanner}>
                  <Table2 size={16} className={styles.csvBannerIcon} />
                  <span>
                    <strong>{notas.reduce((acc, n) => acc + n.itens.length, 0)} linhas</strong> prontas para exportação
                    — 1 linha por item, com todos os campos da NF-e (chave, impostos, destinatário).
                  </span>
                  <button className={styles.csvBannerBtn} onClick={() => exportNotasCSV(notas, emitente)}>
                    <Download size={14} /> notas_fiscais_{new Date().toISOString().slice(0,10)}.csv
                  </button>
                </div>

                {notas.map((nota, idx) => (
                  <motion.div
                    key={nota.id}
                    className={styles.notaCard}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.05 }}
                  >
                    <div className={styles.notaCardHeader} onClick={() => setExpandedNota(expandedNota === nota.id ? null : nota.id)}>
                      <div className={styles.notaCardTitle}>
                        <div className={styles.notaNumberBadge}>NF-e {nota.numero}</div>
                        <span className={styles.notaDestinatario}>{nota.destinatario.nome}</span>
                      </div>
                      <div className={styles.notaCardRight}>
                        <span className={styles.notaTotal}>
                          R$ {nota.totalNota.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                        <div className={styles.notaActions}>
                          <button className={styles.iconBtn} title="Imprimir DANFE" onClick={e => { e.stopPropagation(); handlePrint(nota); }}>
                            <Printer size={15} />
                          </button>
                          <button className={styles.iconBtn} title="Copiar Chave de Acesso" onClick={e => { e.stopPropagation(); copyChave(nota.chaveAcesso); }}>
                            <Copy size={15} />
                          </button>
                        </div>
                        {expandedNota === nota.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </div>
                    </div>

                    <AnimatePresence>
                      {expandedNota === nota.id && (
                        <motion.div
                          className={styles.notaDetails}
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                        >
                          <div className={styles.detailGrid}>
                            <div className={styles.detailSection}>
                              <h5>Dados da Nota</h5>
                              <div className={styles.detailRow}><span>Número</span><strong>{nota.numero}</strong></div>
                              <div className={styles.detailRow}><span>Série</span><strong>{nota.serie}</strong></div>
                              <div className={styles.detailRow}><span>Data Emissão</span><strong>{nota.dataEmissao}</strong></div>
                              <div className={styles.detailRow}><span>Nat. Operação</span><strong>{nota.naturezaOperacao}</strong></div>
                            </div>

                            <div className={styles.detailSection}>
                              <h5>Destinatário</h5>
                              <div className={styles.detailRow}><span>Nome</span><strong>{nota.destinatario.nome}</strong></div>
                              <div className={styles.detailRow}><span>CPF/CNPJ</span><strong>{nota.destinatario.cpfCnpj}</strong></div>
                              <div className={styles.detailRow}><span>E-mail</span><strong>{nota.destinatario.email}</strong></div>
                              <div className={styles.detailRow}><span>Endereço</span><strong>{nota.destinatario.endereco}</strong></div>
                            </div>
                          </div>

                          <div className={styles.itensSection}>
                            <h5>Itens</h5>
                            <div className={styles.itensTable}>
                              <div className={styles.itensThead}>
                                <span>Descrição</span><span>Qtd</span><span>Vl. Unit.</span><span>Total</span>
                              </div>
                              {nota.itens.map((item, i) => (
                                <div key={i} className={styles.itensTr}>
                                  <span>{item.descricao}</span>
                                  <span>{item.quantidade} {item.unidade}</span>
                                  <span>R$ {item.valorUnitario.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                  <span>R$ {item.valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className={styles.totaisRow}>
                            <div className={styles.impostoChip}>ICMS: R$ {nota.impostos.icms.toFixed(2)}</div>
                            <div className={styles.impostoChip}>PIS: R$ {nota.impostos.pis.toFixed(2)}</div>
                            <div className={styles.impostoChip}>COFINS: R$ {nota.impostos.cofins.toFixed(2)}</div>
                            <div className={`${styles.impostoChip} ${styles.totalChip}`}>
                              Total NF: R$ {nota.totalNota.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </div>
                          </div>

                          <div className={styles.chaveSection}>
                            <span className={styles.chaveLabel}>Chave de Acesso:</span>
                            <code className={styles.chaveCode}>{nota.chaveAcesso}</code>
                            <button className={styles.iconBtn} onClick={() => copyChave(nota.chaveAcesso)}>
                              <Copy size={13} />
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
