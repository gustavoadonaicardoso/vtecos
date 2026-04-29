/**
 * ============================================================
 * VÓRTICE CRM — Prompts Gemini do Módulo Fiscal
 * ============================================================
 * Centraliza os templates de prompt usados pelas rotas:
 *   - POST /api/fiscal/gerar  (geração livre por quantidade)
 *   - POST /api/fiscal/csv    (geração baseada em CSV)
 *
 * ⚠️  Importado apenas por Route Handlers (server-side).
 * ============================================================
 */

import type { EmitentInfo } from '@/types/fiscal';

// ─── Schema JSON compartilhado ────────────────────────────────

/** Schema JSON que ambos os prompts pedem ao Gemini. */
function jsonSchema(dataHoje: string): string {
  return `[
  {
    "numero": "string",
    "serie": "001",
    "dataEmissao": "${dataHoje}",
    "naturezaOperacao": "string",
    "destinatario": {
      "nome": "string",
      "cpfCnpj": "string",
      "endereco": "string",
      "email": "string"
    },
    "itens": [
      {
        "descricao": "string",
        "quantidade": number,
        "unidade": "string",
        "valorUnitario": number,
        "valorTotal": number,
        "ncm": "string",
        "cfop": "string",
        "cst": "string"
      }
    ],
    "impostos": {
      "icms": number,
      "pis": number,
      "cofins": number,
      "iss": number
    },
    "totalProdutos": number,
    "totalNota": number
  }
]`;
}

/** Instrução de impostos por regime tributário. */
function impostosPorRegime(regime: string): string {
  return `Impostos calculados corretamente para o regime ${regime}:
   - Simples Nacional: ICMS não destacado, PIS/COFINS no Simples
   - Lucro Presumido: ICMS 12-18%, PIS 0.65%, COFINS 3%
   - Lucro Real: ICMS 12-18%, PIS 1.65%, COFINS 7.6%
   - MEI: sem ICMS/PIS/COFINS destacados`;
}

/** Bloco de dados do emitente para o prompt. */
function emitenteParagraph(emitente: EmitentInfo, dataHoje: string): string {
  return `EMITENTE:
- Razão Social: ${emitente.razaoSocial}
- CNPJ: ${emitente.cnpj}
- IE: ${emitente.inscricaoEstadual || 'ISENTO'}
- Endereço: ${emitente.endereco}, ${emitente.cidade} - ${emitente.estado} - CEP: ${emitente.cep}
- E-mail: ${emitente.email}
- Regime Tributário: ${emitente.regimeTributario}
- Data Atual: ${dataHoje}`;
}

// ─── Prompt: Geração livre (por quantidade) ───────────────────

interface GerarParams {
  emitente: EmitentInfo;
  quantidade: number;
  contexto: string;
  dataHoje: string;
  anoAtual: number;
}

export function buildNfePrompt({ emitente, quantidade, contexto, dataHoje, anoAtual }: GerarParams): string {
  const startNum = Math.floor(Math.random() * 900) + 100;
  return `Você é um sistema fiscal brasileiro especializado em NF-e (Nota Fiscal Eletrônica).
Gere exatamente ${quantidade} notas fiscais eletrônicas REALISTAS e DISTINTAS no formato JSON.

${emitenteParagraph(emitente, dataHoje)}

${contexto ? `INSTRUÇÕES ADICIONAIS DO USUÁRIO:\n${contexto}\n` : ''}

REGRAS:
1. Cada nota deve ter um número sequencial único (começando em ${startNum}-${anoAtual})
2. Destinatários diferentes e realistas (nome, CPF/CNPJ, endereço)
3. Itens consistentes com o ramo do emitente (1 a 4 itens por nota)
4. Valores monetários realistas (não todos iguais, variação natural)
5. ${impostosPorRegime(emitente.regimeTributario)}
6. Série da NF-e: "001"
7. CFOP realistas (ex: 5102 para venda dentro do estado, 6102 fora do estado, 5933 para serviços)
8. NCM de 8 dígitos realistas
9. Unidades: UN, PCT, KG, M², HR, SV

Responda SOMENTE com um JSON array válido, sem markdown, sem explicações:
${jsonSchema(dataHoje)}`;
}

// ─── Prompt: Geração via CSV ──────────────────────────────────

interface GerarViaCsvParams {
  emitente: EmitentInfo;
  csvContent: string;
  contexto: string;
  dataHoje: string;
  anoAtual: number;
}

export function buildNfeFromCsvPrompt({ emitente, csvContent, contexto, dataHoje, anoAtual }: GerarViaCsvParams): string {
  return `Você é um sistema fiscal brasileiro especializado em NF-e (Nota Fiscal Eletrônica).
Analise o CSV abaixo e gere uma nota fiscal eletrônica para CADA LINHA DE DADOS do arquivo.
Interprete os campos disponíveis de forma inteligente, mesmo que os nomes das colunas sejam diferentes do padrão.

${emitenteParagraph(emitente, dataHoje)}

${contexto ? `INSTRUÇÕES ADICIONAIS DO USUÁRIO:\n${contexto}\n` : ''}

CONTEÚDO DO CSV:
${csvContent}

REGRAS DE GERAÇÃO:
1. Gere UMA nota fiscal por linha de dados do CSV (excluindo o cabeçalho).
2. Use os dados do CSV para preencher destinatário/itens. Campos ausentes → deduza ou use valor realista.
3. Numeração sequencial única (ex: 001-${anoAtual}, 002-${anoAtual} ...).
4. ${impostosPorRegime(emitente.regimeTributario)}
5. NCM de 8 dígitos compatível com o produto/serviço.
6. CFOP: 5102 (venda dentro do estado), 6102 (fora do estado), 5933/6933 (serviços).
7. Série da NF-e: "001".
8. Se houver campos de endereço separados, concatene-os no campo "endereco".

Responda SOMENTE com um JSON array válido, sem markdown, sem explicações:
${jsonSchema(dataHoje)}`;
}
