/**
 * ============================================================
 * VÓRTICE CRM — Tipos do Módulo Fiscal (NF-e)
 * ============================================================
 * Centralizados aqui para uso compartilhado entre as rotas de
 * API (/api/fiscal/gerar e /api/fiscal/csv) e o componente de
 * página (src/app/fiscal/page.tsx).
 * ============================================================
 */

// ─── Emitente ─────────────────────────────────────────────────

export interface EmitentInfo {
  razaoSocial: string;
  cnpj: string;
  inscricaoEstadual: string;
  endereco: string;
  cidade: string;
  estado: string;
  cep: string;
  email: string;
  telefone: string;
  regimeTributario: string;
}

// ─── Estrutura de NF-e gerada ─────────────────────────────────

export interface NotaFiscalItem {
  descricao: string;
  quantidade: number;
  unidade: string;
  valorUnitario: number;
  valorTotal: number;
  ncm: string;
  cfop: string;
  cst: string;
}

export interface NotaFiscalImpostos {
  icms: number;
  pis: number;
  cofins: number;
  iss: number;
}

export interface NotaFiscalDestinatario {
  nome: string;
  cpfCnpj: string;
  endereco: string;
  email: string;
}

/** Nota fiscal retornada pela IA (antes de enriquecimento no frontend) */
export interface NotaFiscalGeradaRaw {
  numero: string;
  serie: string;
  dataEmissao: string;
  naturezaOperacao: string;
  destinatario: NotaFiscalDestinatario;
  itens: NotaFiscalItem[];
  impostos: NotaFiscalImpostos;
  totalProdutos: number;
  totalNota: number;
}

/** Nota fiscal completa exibida no frontend (inclui campos gerados localmente) */
export interface NotaFiscalGerada extends NotaFiscalGeradaRaw {
  id: string;
  chaveAcesso: string;
  protocolo: string;
  status: 'gerando' | 'gerada' | 'erro';
}

// ─── Payloads de API ──────────────────────────────────────────

export interface GerarNotasPayload {
  emitente: EmitentInfo;
  quantidade: number;
  contexto: string;
}

export interface GerarNotasViaCsvPayload {
  emitente: EmitentInfo;
  csvContent: string;
  contexto: string;
}
