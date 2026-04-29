"use client";

import React, { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload, ChevronRight, ChevronLeft, Phone, Variable,
  CheckCircle2, Loader2, FileSpreadsheet, X, Plus, Eye,
  Send, AlertTriangle, UserCheck, GitBranch, RefreshCw,
  MessageSquare, Tag, Globe, ChevronDown, ChevronUp
} from "lucide-react";
import styles from "./nova.module.css";

interface ColumnConfig {
  key: string;
  label: string;
  isPhone: boolean;
  isVariable: boolean;
}

interface ParsedFile {
  columns: string[];
  preview: Record<string, string>[];
  allRows: Record<string, string>[];
  totalRows: number;
}

interface MetaTemplateComponent {
  type: "HEADER" | "BODY" | "FOOTER" | "BUTTONS";
  format?: string;
  text?: string;
}

interface MetaTemplate {
  id: string;
  name: string;
  status: string;
  category: string;
  language: string;
  components: MetaTemplateComponent[];
}

const STEPS = ["Upload", "Colunas", "Template", "Confirmar"];

const CATEGORY_LABEL: Record<string, string> = {
  MARKETING: "Marketing",
  UTILITY: "Utilidade",
  AUTHENTICATION: "Autenticação",
};

function renderMessage(template: string, row: Record<string, string>) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => row[key] ?? `{{${key}}}`);
}

function getBody(t: MetaTemplate): string {
  return t.components.find(c => c.type === "BODY")?.text ?? "";
}

function getHeader(t: MetaTemplate): string | null {
  const h = t.components.find(c => c.type === "HEADER");
  return h?.format === "TEXT" ? (h.text ?? null) : null;
}

function extractVarNumbers(text: string): string[] {
  const seen = new Set<string>();
  const matches = text.matchAll(/\{\{(\d+)\}\}/g);
  for (const m of matches) seen.add(m[1]);
  return [...seen].sort((a, b) => Number(a) - Number(b));
}

function applyVarMapping(text: string, mapping: Record<string, string>): string {
  return text.replace(/\{\{(\d+)\}\}/g, (_, n) =>
    mapping[n] ? `{{${mapping[n]}}}` : `{{var${n}}}`
  );
}

export default function NovaDisparoPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);

  // Step 1
  const [parsedFile, setParsedFile] = useState<ParsedFile | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 2
  const [columnConfigs, setColumnConfigs] = useState<ColumnConfig[]>([]);

  // Step 3 — template
  const [campaignName, setCampaignName] = useState("");
  const [template, setTemplate] = useState("");
  const [delayMin, setDelayMin] = useState(3);
  const [delayMax, setDelayMax] = useState(8);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Step 3 — Meta templates panel
  const [showMetaPanel, setShowMetaPanel] = useState(false);
  const [metaTemplates, setMetaTemplates] = useState<MetaTemplate[]>([]);
  const [metaLoading, setMetaLoading] = useState(false);
  const [metaError, setMetaError] = useState("");
  const [metaSearch, setMetaSearch] = useState("");
  const [selectedMeta, setSelectedMeta] = useState<MetaTemplate | null>(null);
  const [varMapping, setVarMapping] = useState<Record<string, string>>({});
  const [metaSynced, setMetaSynced] = useState(false);

  // Step 3 — routing
  const [routeType, setRouteType] = useState<"none" | "user" | "stage">("none");
  const [routeToId, setRouteToId] = useState("");
  const [routeToLabel, setRouteToLabel] = useState("");
  const [routeOptions, setRouteOptions] = useState<{ id: string; label: string }[]>([]);
  const [routeOptionsLoading, setRouteOptionsLoading] = useState(false);

  // Step 4
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  // ─── File upload ────────────────────────────────────────────────────────────

  const handleFile = useCallback(async (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    const allowed = ["text/csv", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel"];
    if (!allowed.includes(file.type) && ext !== "csv" && ext !== "xlsx" && ext !== "xls") {
      setUploadError("Apenas arquivos CSV ou Excel (.xlsx, .xls) são suportados.");
      return;
    }
    setUploading(true);
    setUploadError("");
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/disparos/upload", { method: "POST", body: form });
    const data = await res.json();
    setUploading(false);
    if (!res.ok || data.error) { setUploadError(data.error ?? "Erro ao processar arquivo"); return; }
    setParsedFile(data);
    setColumnConfigs(data.columns.map((key: string) => ({
      key,
      label: key,
      isPhone: /^(tel|fone|celular|phone|whatsapp|numero|número)/i.test(key),
      isVariable: true,
    })));
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  // ─── Textarea variable insert ────────────────────────────────────────────────

  const insertVariable = (key: string) => {
    const ta = textareaRef.current;
    if (!ta) { setTemplate(t => t + `{{${key}}}`); return; }
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const val = template.slice(0, start) + `{{${key}}}` + template.slice(end);
    setTemplate(val);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + key.length + 4, start + key.length + 4);
    });
  };

  // ─── Meta templates ──────────────────────────────────────────────────────────

  const syncMetaTemplates = async () => {
    setMetaLoading(true);
    setMetaError("");
    const res = await fetch("/api/disparos/meta-templates");
    const data = await res.json();
    setMetaLoading(false);
    if (!res.ok || data.error) {
      setMetaError(data.error ?? "Erro ao buscar templates");
      return;
    }
    setMetaTemplates(data.templates ?? []);
    setMetaSynced(true);
  };

  const handleOpenMetaPanel = () => {
    setShowMetaPanel(v => {
      if (!v && !metaSynced) syncMetaTemplates();
      return !v;
    });
    setSelectedMeta(null);
    setVarMapping({});
  };

  const handleSelectMetaTemplate = (t: MetaTemplate) => {
    setSelectedMeta(t);
    setVarMapping({});
  };

  const applyMetaTemplate = () => {
    if (!selectedMeta) return;
    const body = getBody(selectedMeta);
    const header = getHeader(selectedMeta);
    const varNums = extractVarNumbers(body);

    let finalText = body;
    if (header) finalText = `*${header}*\n\n${body}`;

    if (varNums.length > 0) {
      finalText = applyVarMapping(finalText, varMapping);
    }

    setTemplate(finalText);
    setShowMetaPanel(false);
    setSelectedMeta(null);
  };

  const filteredTemplates = metaTemplates.filter(t =>
    !metaSearch || t.name.toLowerCase().includes(metaSearch.toLowerCase())
  );

  // ─── Routing ─────────────────────────────────────────────────────────────────

  const loadRouteOptions = async (type: "user" | "stage") => {
    setRouteOptionsLoading(true);
    setRouteToId("");
    setRouteToLabel("");
    const res = await fetch(`/api/disparos/route-options?type=${type}`);
    const data = await res.json();
    setRouteOptions(data.options ?? []);
    setRouteOptionsLoading(false);
  };

  const handleRouteTypeChange = (type: "none" | "user" | "stage") => {
    setRouteType(type);
    setRouteOptions([]);
    setRouteToId("");
    setRouteToLabel("");
    if (type !== "none") loadRouteOptions(type);
  };

  // ─── Navigation ──────────────────────────────────────────────────────────────

  const variables = columnConfigs.filter(c => c.isVariable && !c.isPhone);

  const canProceed = () => {
    if (step === 0) return !!parsedFile;
    if (step === 1) return columnConfigs.some(c => c.isPhone);
    if (step === 2) return campaignName.trim().length > 0 && template.trim().length > 0;
    return true;
  };

  const handleCreate = async () => {
    if (!parsedFile) return;
    setCreating(true);
    setCreateError("");
    const res = await fetch("/api/disparos/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: campaignName,
        template,
        columnsConfig: columnConfigs,
        delayMin,
        delayMax,
        contacts: parsedFile.allRows,
        routeType,
        routeToId: routeToId || null,
        routeToLabel: routeToLabel || null,
      }),
    });
    const data = await res.json();
    setCreating(false);
    if (!res.ok || data.error) { setCreateError(data.error ?? "Erro ao criar campanha"); return; }
    router.push(`/disparos/${data.campaign.id}`);
  };

  // ─── Step renders ─────────────────────────────────────────────────────────────

  const renderStep0 = () => (
    <div className={styles.stepContent}>
      <h2>Importe sua planilha</h2>
      <p>Faça upload de um arquivo CSV ou Excel com os contatos e dados da campanha.</p>

      {parsedFile ? (
        <div className={styles.fileSuccess}>
          <FileSpreadsheet size={32} />
          <div>
            <strong>{parsedFile.totalRows} contatos carregados</strong>
            <span>{parsedFile.columns.length} colunas detectadas: {parsedFile.columns.join(", ")}</span>
          </div>
          <button className={styles.removeFile} onClick={() => { setParsedFile(null); setColumnConfigs([]); }}>
            <X size={16} />
          </button>
        </div>
      ) : (
        <div
          className={`${styles.dropzone} ${dragging ? styles.dragging : ""}`}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? (
            <Loader2 size={40} className={styles.spinner} />
          ) : (
            <>
              <Upload size={40} />
              <strong>Arraste o arquivo aqui ou clique para selecionar</strong>
              <span>CSV, XLSX, XLS — Tamanho máximo: 10MB</span>
            </>
          )}
          <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" className={styles.hiddenInput}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
        </div>
      )}

      {uploadError && <div className={styles.errorMsg}><AlertTriangle size={16} />{uploadError}</div>}

      {parsedFile && (
        <div className={styles.previewTable}>
          <h4>Prévia dos dados</h4>
          <div className={styles.tableWrap}>
            <table>
              <thead><tr>{parsedFile.columns.map(col => <th key={col}>{col}</th>)}</tr></thead>
              <tbody>
                {parsedFile.preview.map((row, i) => (
                  <tr key={i}>{parsedFile.columns.map(col => <td key={col}>{row[col] ?? ""}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
          {parsedFile.totalRows > 5 && <p className={styles.moreRows}>+ {parsedFile.totalRows - 5} linhas não exibidas</p>}
        </div>
      )}
    </div>
  );

  const renderStep1 = () => (
    <div className={styles.stepContent}>
      <h2>Configure as colunas</h2>
      <p>Defina qual coluna é o telefone e quais serão usadas como variáveis na mensagem.</p>
      <div className={styles.columnsTable}>
        <div className={styles.colHeader}>
          <span>Coluna original</span>
          <span>Rótulo / Nome</span>
          <span className={styles.center}>É o telefone?</span>
          <span className={styles.center}>Usar como variável?</span>
        </div>
        {columnConfigs.map((col, i) => (
          <div key={col.key} className={styles.colRow}>
            <span className={styles.colKey}>{col.key}</span>
            <input className={styles.colLabelInput} value={col.label}
              onChange={e => { const arr = [...columnConfigs]; arr[i] = { ...arr[i], label: e.target.value }; setColumnConfigs(arr); }} />
            <div className={styles.center}>
              <button className={`${styles.toggleBtn} ${col.isPhone ? styles.toggleOn : ""}`}
                onClick={() => setColumnConfigs(columnConfigs.map((c, j) => ({ ...c, isPhone: j === i })))}>
                <Phone size={14} />{col.isPhone ? "Sim" : "Não"}
              </button>
            </div>
            <div className={styles.center}>
              <button className={`${styles.toggleBtn} ${col.isVariable ? styles.toggleOn : ""}`}
                onClick={() => { const arr = [...columnConfigs]; arr[i] = { ...arr[i], isVariable: !arr[i].isVariable }; setColumnConfigs(arr); }}>
                <Variable size={14} />{col.isVariable ? "Sim" : "Não"}
              </button>
            </div>
          </div>
        ))}
      </div>
      {!columnConfigs.some(c => c.isPhone) && (
        <div className={styles.warnMsg}><AlertTriangle size={16} /> Marque uma coluna como telefone para continuar.</div>
      )}
      {variables.length > 0 && (
        <div className={styles.variablesPreview}>
          <strong>Variáveis disponíveis:</strong>
          {variables.map(v => <span key={v.key} className={styles.varChip}>{`{{${v.key}}}`}</span>)}
        </div>
      )}
    </div>
  );

  const renderMetaPanel = () => {
    const bodyVars = selectedMeta ? extractVarNumbers(getBody(selectedMeta)) : [];
    const allMapped = bodyVars.every(n => !!varMapping[n]);

    return (
      <AnimatePresence>
        {showMetaPanel && (
          <motion.div
            className={styles.metaPanel}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
          >
            <div className={styles.metaPanelHeader}>
              <div className={styles.metaPanelTitle}>
                <MessageSquare size={16} />
                <strong>Templates aprovados da Meta</strong>
                {metaSynced && <span className={styles.syncedBadge}>{metaTemplates.length} templates</span>}
              </div>
              <div className={styles.metaPanelActions}>
                <button className={styles.metaSyncBtn} onClick={syncMetaTemplates} disabled={metaLoading}>
                  {metaLoading ? <Loader2 size={14} className={styles.spinner} /> : <RefreshCw size={14} />}
                  {metaSynced ? "Sincronizar" : "Buscar templates"}
                </button>
                <button className={styles.metaCloseBtn} onClick={() => { setShowMetaPanel(false); setSelectedMeta(null); }}>
                  <X size={16} />
                </button>
              </div>
            </div>

            {metaError && <div className={styles.errorMsg} style={{ margin: "0 0 0.75rem" }}><AlertTriangle size={14} />{metaError}</div>}

            {metaLoading && (
              <div className={styles.metaLoadingRow}><Loader2 size={24} className={styles.spinner} /><span>Buscando templates...</span></div>
            )}

            {!metaLoading && metaSynced && (
              <>
                <input
                  className={styles.metaSearch}
                  placeholder="Buscar por nome..."
                  value={metaSearch}
                  onChange={e => setMetaSearch(e.target.value)}
                />

                {filteredTemplates.length === 0 ? (
                  <p className={styles.metaEmpty}>Nenhum template encontrado.</p>
                ) : (
                  <div className={styles.metaTemplateGrid}>
                    {filteredTemplates.map(t => {
                      const body = getBody(t);
                      const isSelected = selectedMeta?.id === t.id;
                      return (
                        <div
                          key={t.id}
                          className={`${styles.metaCard} ${isSelected ? styles.metaCardSelected : ""}`}
                          onClick={() => handleSelectMetaTemplate(t)}
                        >
                          <div className={styles.metaCardTop}>
                            <span className={styles.metaCardName}>{t.name}</span>
                            <div className={styles.metaCardMeta}>
                              <span className={styles.metaCatChip}><Tag size={10} />{CATEGORY_LABEL[t.category] ?? t.category}</span>
                              <span className={styles.metaLangChip}><Globe size={10} />{t.language}</span>
                            </div>
                          </div>
                          <p className={styles.metaCardBody}>{body.slice(0, 120)}{body.length > 120 ? "…" : ""}</p>
                          {extractVarNumbers(body).length > 0 && (
                            <span className={styles.metaVarCount}>
                              <Variable size={11} />{extractVarNumbers(body).length} variável(is)
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Variable mapping for selected template */}
                <AnimatePresence>
                  {selectedMeta && bodyVars.length > 0 && (
                    <motion.div
                      className={styles.metaMapping}
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                    >
                      <div className={styles.metaMappingTitle}>
                        <Variable size={14} />
                        <strong>Mapeie as variáveis do template</strong>
                        <span className={styles.metaMappingHint}>"{selectedMeta.name}"</span>
                      </div>
                      <div className={styles.metaMappingGrid}>
                        {bodyVars.map(n => (
                          <div key={n} className={styles.metaMappingRow}>
                            <span className={styles.metaVarTag}>{`{{${n}}}`}</span>
                            <span className={styles.metaMappingArrow}>→</span>
                            <select
                              className={styles.select}
                              value={varMapping[n] ?? ""}
                              onChange={e => setVarMapping(prev => ({ ...prev, [n]: e.target.value }))}
                            >
                              <option value="">Selecionar coluna…</option>
                              {variables.map(v => (
                                <option key={v.key} value={v.key}>{v.label}</option>
                              ))}
                            </select>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {selectedMeta && (
                  <div className={styles.metaApplyRow}>
                    <div className={styles.metaApplyPreview}>
                      <Eye size={13} />
                      <span>{applyVarMapping(getBody(selectedMeta), varMapping).slice(0, 100)}…</span>
                    </div>
                    <button
                      className={styles.metaApplyBtn}
                      onClick={applyMetaTemplate}
                      disabled={bodyVars.length > 0 && !allMapped}
                    >
                      <CheckCircle2 size={15} /> Usar este template
                    </button>
                  </div>
                )}
              </>
            )}

            {!metaLoading && !metaSynced && (
              <p className={styles.metaEmpty}>Clique em "Buscar templates" para sincronizar com a Meta.</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    );
  };

  const renderStep2 = () => {
    const previewRow = parsedFile?.preview[0] ?? {};
    return (
      <div className={styles.stepContent}>
        <h2>Escreva o template</h2>
        <p>Escreva manualmente ou importe um template aprovado da Meta.</p>

        <div className={styles.formGrid}>
          <div className={styles.formGroup}>
            <label>Nome da campanha</label>
            <input className={styles.input} value={campaignName}
              onChange={e => setCampaignName(e.target.value)} placeholder="Ex: Promoção Outubro 2026" />
          </div>
          <div className={styles.formGroupRow}>
            <div className={styles.formGroup}>
              <label>Delay mínimo (seg)</label>
              <input type="number" min={1} max={60} className={styles.input} value={delayMin}
                onChange={e => setDelayMin(Number(e.target.value))} />
            </div>
            <div className={styles.formGroup}>
              <label>Delay máximo (seg)</label>
              <input type="number" min={1} max={60} className={styles.input} value={delayMax}
                onChange={e => setDelayMax(Number(e.target.value))} />
            </div>
          </div>
        </div>

        <div className={styles.templateEditorWrap}>
          <div className={styles.templateEditorHeader}>
            <label>Mensagem</label>
            <button
              className={`${styles.metaImportBtn} ${showMetaPanel ? styles.metaImportBtnActive : ""}`}
              onClick={handleOpenMetaPanel}
            >
              <MessageSquare size={14} />
              Templates da Meta
              {showMetaPanel ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          </div>

          {renderMetaPanel()}

          {variables.length > 0 && (
            <div className={styles.varBar}>
              <span className={styles.varBarLabel}>Inserir variável:</span>
              {variables.map(v => (
                <button key={v.key} className={styles.varInsertChip} onClick={() => insertVariable(v.key)}>
                  <Plus size={12} /> {v.label}
                </button>
              ))}
            </div>
          )}

          <textarea
            ref={textareaRef}
            className={styles.textarea}
            rows={7}
            value={template}
            onChange={e => setTemplate(e.target.value)}
            placeholder="Ex: Olá {{nome}}! Temos uma proposta especial para {{empresa}} 🎉"
          />
        </div>

        {template && (
          <div className={styles.livePreview}>
            <div className={styles.previewLabel}><Eye size={14} /> Prévia com dados da 1ª linha:</div>
            <div className={styles.previewBubble}>{renderMessage(template, previewRow)}</div>
          </div>
        )}

        {/* Routing */}
        <div className={styles.routingSection}>
          <h4 className={styles.routingTitle}><UserCheck size={16} /> Direcionar respostas para</h4>
          <p className={styles.routingDesc}>Quando um contato responder esta campanha, a conversa será automaticamente direcionada.</p>
          <div className={styles.routeTypeGroup}>
            {(["none", "user", "stage"] as const).map(t => (
              <button key={t} className={`${styles.routeTypeBtn} ${routeType === t ? styles.routeTypeBtnActive : ""}`}
                onClick={() => handleRouteTypeChange(t)}>
                {t === "none" && <X size={14} />}
                {t === "user" && <UserCheck size={14} />}
                {t === "stage" && <GitBranch size={14} />}
                {t === "none" ? "Sem direcionamento" : t === "user" ? "Usuário" : "Etapa do Pipeline"}
              </button>
            ))}
          </div>
          {routeType !== "none" && (
            <div className={styles.routeSelect}>
              {routeOptionsLoading ? (
                <div className={styles.routeLoading}><Loader2 size={16} className={styles.spinner} /> Carregando opções...</div>
              ) : (
                <select className={styles.select} value={routeToId}
                  onChange={e => { const opt = routeOptions.find(o => o.id === e.target.value); setRouteToId(e.target.value); setRouteToLabel(opt?.label ?? ""); }}>
                  <option value="">{routeType === "user" ? "Selecione um usuário..." : "Selecione uma etapa..."}</option>
                  {routeOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderStep3 = () => {
    if (!parsedFile) return null;
    const previewRows = parsedFile.preview.slice(0, 3);
    return (
      <div className={styles.stepContent}>
        <h2>Confirme e crie a campanha</h2>
        <p>Revise as informações antes de criar. Você poderá iniciar o disparo na próxima tela.</p>
        <div className={styles.summaryCards}>
          <div className={styles.summaryCard}><strong>{parsedFile.totalRows}</strong><span>Contatos</span></div>
          <div className={styles.summaryCard}><strong>{variables.length}</strong><span>Variáveis</span></div>
          <div className={styles.summaryCard}><strong>{delayMin}–{delayMax}s</strong><span>Delay</span></div>
        </div>
        <div className={styles.summaryTemplate}>
          <label>Template:</label>
          <p>{template}</p>
        </div>
        <h4 className={styles.previewTitle}>Prévia das primeiras mensagens:</h4>
        {previewRows.map((row, i) => {
          const phoneCol = columnConfigs.find(c => c.isPhone)?.key ?? "";
          return (
            <div key={i} className={styles.confirmPreviewItem}>
              <span className={styles.confirmPhone}>{row[phoneCol] ?? "—"}</span>
              <div className={styles.confirmBubble}>{renderMessage(template, row)}</div>
            </div>
          );
        })}
        {createError && <div className={styles.errorMsg}><AlertTriangle size={16} />{createError}</div>}
      </div>
    );
  };

  // ─── Layout ───────────────────────────────────────────────────────────────────

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => router.push("/disparos")}>
          <ChevronLeft size={20} /> Voltar
        </button>
        <h1>Nova Campanha</h1>
      </header>

      <div className={styles.stepper}>
        {STEPS.map((s, i) => (
          <React.Fragment key={s}>
            <div className={`${styles.stepDot} ${i <= step ? styles.stepActive : ""} ${i < step ? styles.stepDone : ""}`}>
              {i < step ? <CheckCircle2 size={16} /> : <span>{i + 1}</span>}
              <label>{s}</label>
            </div>
            {i < STEPS.length - 1 && <div className={`${styles.stepLine} ${i < step ? styles.stepLineDone : ""}`} />}
          </React.Fragment>
        ))}
      </div>

      <div className={styles.body}>
        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.2 }}>
            {step === 0 && renderStep0()}
            {step === 1 && renderStep1()}
            {step === 2 && renderStep2()}
            {step === 3 && renderStep3()}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className={styles.footer}>
        {step > 0 && (
          <button className={styles.prevBtn} onClick={() => setStep(s => s - 1)}>
            <ChevronLeft size={18} /> Anterior
          </button>
        )}
        <div style={{ flex: 1 }} />
        {step < STEPS.length - 1 ? (
          <button className={styles.nextBtn} onClick={() => setStep(s => s + 1)} disabled={!canProceed()}>
            Próximo <ChevronRight size={18} />
          </button>
        ) : (
          <button className={styles.createBtn} onClick={handleCreate} disabled={creating || !canProceed()}>
            {creating ? <Loader2 size={18} className={styles.spinner} /> : <Send size={18} />}
            {creating ? "Criando..." : "Criar Campanha"}
          </button>
        )}
      </div>
    </div>
  );
}
