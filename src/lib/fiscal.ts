/**
 * ============================================================
 * VÓRTICE CRM — Utilitários do Módulo Fiscal
 * ============================================================
 * Funções puras (sem dependências React) usadas pela página
 * de Notas Fiscais. Separadas do componente para manter o
 * arquivo de página focado em UI/lógica de estado.
 * ============================================================
 */

import type { EmitentInfo, NotaFiscalGerada } from '@/types/fiscal';

// ─── Formatadores ─────────────────────────────────────────────

export function formatCNPJ(v: string): string {
  return v
    .replace(/\D/g, '')
    .replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
    .slice(0, 18);
}

export function formatCEP(v: string): string {
  return v
    .replace(/\D/g, '')
    .replace(/(\d{5})(\d{3})/, '$1-$2')
    .slice(0, 9);
}

// ─── Geradores de chaves fiscais simuladas ────────────────────

/** Gera uma chave de acesso NF-e de 44 dígitos (simulada). */
export function gerarChaveAcesso(): string {
  return Array.from({ length: 44 }, () => Math.floor(Math.random() * 10)).join('');
}

/** Gera um protocolo de autorização NF-e (simulado). */
export function gerarProtocolo(): string {
  return `1${Date.now().toString().slice(-13)}`;
}

// ─── Constantes de domínio ────────────────────────────────────

export const REGIMES_TRIBUTARIOS = [
  'Simples Nacional',
  'Lucro Presumido',
  'Lucro Real',
  'MEI',
] as const;

export const ESTADOS_BR = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
  'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
  'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const;

// ─── Gerador de CSV modelo (Receita Federal) ──────────────────

/** Baixa o arquivo CSV de modelo para preenchimento de destinatários NF-e. */
export function downloadModeloCSV(): void {
  const BOM = '\uFEFF';

  const cabecalho = [
    'dest_nome_razao_social', 'dest_cpf_cnpj', 'dest_inscricao_estadual',
    'dest_indicador_ie', 'dest_email', 'dest_telefone',
    'dest_logradouro', 'dest_numero', 'dest_complemento', 'dest_bairro',
    'dest_municipio', 'dest_uf', 'dest_cep', 'dest_codigo_pais',
    'nfe_natureza_operacao', 'nfe_tipo_operacao', 'nfe_finalidade',
    'nfe_forma_pagamento', 'nfe_valor_pago',
    'item_descricao', 'item_ncm', 'item_cest', 'item_cfop',
    'item_unidade_comercial', 'item_quantidade', 'item_valor_unitario',
    'item_valor_total', 'item_valor_desconto',
    'item_cst_icms', 'item_modbc_icms', 'item_aliquota_icms', 'item_valor_icms',
    'item_cst_pis', 'item_aliquota_pis', 'item_valor_pis',
    'item_cst_cofins', 'item_aliquota_cofins', 'item_valor_cofins',
    'item_aliquota_iss', 'item_valor_iss',
    'total_produtos', 'total_icms', 'total_pis', 'total_cofins', 'total_iss', 'total_nota',
    'info_complementar', 'info_contribuinte',
  ];

  const exemploRow = [
    'Maria da Silva Ltda.', '12.345.678/0001-90', 'ISENTO', '9',
    'maria@empresa.com.br', '(11) 99999-1234',
    'Rua das Flores', '123', 'Sala 201', 'Centro', 'São Paulo', 'SP', '01310-100', '1058',
    'VENDA DE MERCADORIA', '1', '1', '01', '1500.00',
    'Serviço de Consultoria em TI', '84713000', '', '5933', 'SV', '1',
    '1500.00', '1500.00', '0.00',
    '400', '3', '12.00', '180.00',
    '07', '0.65', '9.75',
    '07', '3.00', '45.00',
    '5.00', '75.00',
    '1500.00', '180.00', '9.75', '45.00', '75.00', '1500.00',
    'Ref. Contrato 2024/001', 'Serviço prestado conforme proposta aprovada.',
  ];

  const csvContent = BOM + [
    cabecalho.join(';'),
    exemploRow.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';'),
  ].join('\n');

  triggerDownload(csvContent, 'modelo_destinatarios_nfe.csv', 'text/csv;charset=utf-8;');
}

// ─── Exportador de notas geradas ─────────────────────────────

/** Exporta as notas geradas para um arquivo CSV estruturado. */
export function exportNotasCSV(notas: NotaFiscalGerada[], emitente: EmitentInfo): void {
  if (notas.length === 0) return;

  const BOM = '\uFEFF';
  const cabecalho = [
    'nfe_numero', 'nfe_serie', 'nfe_data_emissao', 'nfe_natureza_operacao',
    'nfe_chave_acesso', 'nfe_protocolo',
    'dest_nome', 'dest_cpf_cnpj', 'dest_email', 'dest_endereco',
    'item_descricao', 'item_ncm', 'item_cfop', 'item_cst',
    'item_unidade', 'item_quantidade', 'item_valor_unitario', 'item_valor_total',
    'imposto_icms', 'imposto_pis', 'imposto_cofins', 'imposto_iss',
    'total_produtos', 'total_nota',
    'emitente_razao_social', 'emitente_cnpj', 'emitente_regime',
  ];

  const rows: string[][] = [];
  for (const nota of notas) {
    for (const item of nota.itens) {
      rows.push([
        nota.numero, nota.serie, nota.dataEmissao, nota.naturezaOperacao,
        nota.chaveAcesso, nota.protocolo,
        nota.destinatario.nome, nota.destinatario.cpfCnpj,
        nota.destinatario.email, nota.destinatario.endereco,
        item.descricao, item.ncm, item.cfop, item.cst,
        item.unidade, String(item.quantidade),
        item.valorUnitario.toFixed(2), item.valorTotal.toFixed(2),
        nota.impostos.icms.toFixed(2), nota.impostos.pis.toFixed(2),
        nota.impostos.cofins.toFixed(2), nota.impostos.iss.toFixed(2),
        nota.totalProdutos.toFixed(2), nota.totalNota.toFixed(2),
        emitente.razaoSocial, emitente.cnpj, emitente.regimeTributario,
      ]);
    }
  }

  const csvContent = BOM + [
    cabecalho.join(';'),
    ...rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')),
  ].join('\n');

  const date = new Date().toISOString().slice(0, 10);
  triggerDownload(csvContent, `notas_fiscais_${date}.csv`, 'text/csv;charset=utf-8;');
}

// ─── Builder HTML de impressão (DANFE simplificada) ──────────

/** Constrói o HTML de impressão da DANFE simplificada. */
export function buildPrintHTML(nota: NotaFiscalGerada, emitente: EmitentInfo): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>DANFE — NF-e ${nota.numero}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 11px; color: #000; background: #fff; padding: 15mm; }
    .danfe { border: 2px solid #000; }
    .header { display: flex; border-bottom: 1px solid #000; }
    .logo-area { flex: 1; padding: 8px; border-right: 1px solid #000; }
    .logo-area h2 { font-size: 14px; }
    .nfe-id { width: 200px; padding: 8px; text-align: center; border-right: 1px solid #000; }
    .nfe-id h3 { font-size: 13px; font-weight: bold; }
    .chave-area { width: 220px; padding: 8px; font-size: 9px; word-break: break-all; }
    .section { border-bottom: 1px solid #000; }
    .section-title { background: #ddd; padding: 3px 8px; font-weight: bold; font-size: 10px; border-bottom: 1px solid #000; }
    .section-body { display: flex; flex-wrap: wrap; padding: 5px 8px; gap: 12px; }
    .field { display: flex; flex-direction: column; }
    .field label { font-size: 9px; color: #555; }
    .field span { font-weight: bold; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #ddd; border: 1px solid #999; padding: 4px; font-size: 10px; }
    td { border: 1px solid #bbb; padding: 4px; font-size: 10px; }
    .total-row { background: #f5f5f5; font-weight: bold; }
    .footer-text { text-align: center; margin-top: 8px; font-size: 9px; color: #666; }
  </style>
</head>
<body>
<div class="danfe">
  <div class="header">
    <div class="logo-area">
      <h2>${emitente.razaoSocial}</h2>
      <p>CNPJ: ${emitente.cnpj} | IE: ${emitente.inscricaoEstadual}</p>
      <p>${emitente.endereco}, ${emitente.cidade} - ${emitente.estado} - CEP: ${emitente.cep}</p>
      <p>${emitente.email} | ${emitente.telefone}</p>
    </div>
    <div class="nfe-id">
      <h3>DANFE</h3>
      <p>Documento Auxiliar da Nota Fiscal Eletrônica</p>
      <br/>
      <p><strong>Nº ${nota.numero} — Série ${nota.serie}</strong></p>
      <p>Data: ${nota.dataEmissao}</p>
    </div>
    <div class="chave-area">
      <p><strong>Chave de Acesso:</strong></p>
      <p>${nota.chaveAcesso}</p>
      <br/>
      <p>Protocolo: ${nota.protocolo}</p>
    </div>
  </div>

  <div class="section">
    <div class="section-title">NATUREZA DA OPERAÇÃO</div>
    <div class="section-body"><p>${nota.naturezaOperacao}</p></div>
  </div>

  <div class="section">
    <div class="section-title">DESTINATÁRIO / REMETENTE</div>
    <div class="section-body">
      <div class="field"><label>Nome</label><span>${nota.destinatario.nome}</span></div>
      <div class="field"><label>CPF/CNPJ</label><span>${nota.destinatario.cpfCnpj}</span></div>
      <div class="field"><label>Endereço</label><span>${nota.destinatario.endereco}</span></div>
      <div class="field"><label>E-mail</label><span>${nota.destinatario.email}</span></div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">DADOS DOS PRODUTOS / SERVIÇOS</div>
    <table>
      <thead>
        <tr>
          <th>Descrição</th><th>NCM</th><th>CFOP</th><th>Un</th><th>Qtd</th><th>Vl. Unit.</th><th>Vl. Total</th>
        </tr>
      </thead>
      <tbody>
        ${nota.itens.map((item) => `
          <tr>
            <td>${item.descricao}</td>
            <td>${item.ncm}</td>
            <td>${item.cfop}</td>
            <td>${item.unidade}</td>
            <td>${item.quantidade}</td>
            <td>R$ ${item.valorUnitario.toFixed(2)}</td>
            <td>R$ ${item.valorTotal.toFixed(2)}</td>
          </tr>
        `).join('')}
        <tr class="total-row">
          <td colspan="6" style="text-align:right">TOTAL DA NOTA</td>
          <td>R$ ${nota.totalNota.toFixed(2)}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="section">
    <div class="section-title">CÁLCULO DO IMPOSTO</div>
    <div class="section-body">
      <div class="field"><label>ICMS</label><span>R$ ${nota.impostos.icms.toFixed(2)}</span></div>
      <div class="field"><label>PIS</label><span>R$ ${nota.impostos.pis.toFixed(2)}</span></div>
      <div class="field"><label>COFINS</label><span>R$ ${nota.impostos.cofins.toFixed(2)}</span></div>
      <div class="field"><label>TOTAL DA NOTA</label><span>R$ ${nota.totalNota.toFixed(2)}</span></div>
    </div>
  </div>
</div>
<p class="footer-text">Documento emitido por Vórtice CRM — Este DANFE não tem valor fiscal sem autenticação na SEFAZ.</p>
</body>
</html>`;
}

// ─── Sanitizador de nota retornada pela IA ────────────────────

/** Normaliza e garante campos numéricos na nota retornada pelo Gemini. */
export function sanitizarNota(nota: any, index: number, anoAtual: number, dataHoje: string): any {
  return {
    ...nota,
    numero: nota.numero || `${String(index + 1).padStart(3, '0')}-${anoAtual}`,
    serie: nota.serie || '001',
    dataEmissao: nota.dataEmissao || dataHoje,
    totalProdutos: Number(nota.totalProdutos) || 0,
    totalNota: Number(nota.totalNota) || 0,
    impostos: {
      icms: Number(nota.impostos?.icms) || 0,
      pis: Number(nota.impostos?.pis) || 0,
      cofins: Number(nota.impostos?.cofins) || 0,
      iss: Number(nota.impostos?.iss) || 0,
    },
    itens: (nota.itens ?? []).map((item: any) => ({
      ...item,
      quantidade: Number(item.quantidade) || 1,
      valorUnitario: Number(item.valorUnitario) || 0,
      valorTotal: Number(item.valorTotal) || 0,
    })),
  };
}

// ─── Utilitário interno ───────────────────────────────────────

function triggerDownload(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Re-exportações de tipo para conveniência ─────────────────

export type { EmitentInfo, NotaFiscalGerada, NotaFiscalGeradaRaw } from '@/types/fiscal';
