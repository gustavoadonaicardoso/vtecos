/**
 * Custos & Precificação — cotação do dólar e do euro (server-only).
 *
 * Fonte principal: PTAX do Banco Central (cotação oficial de venda do
 * último dia útil). Se o Banco Central não responder, tenta a AwesomeAPI.
 * O IOF/spread do cartão fica nas configurações da empresa, à parte.
 */

export interface ExchangeRates {
  usd: number;
  eur: number;
  /** Dia da cotação (YYYY-MM-DD). */
  date: string;
  source: 'Banco Central (PTAX)' | 'AwesomeAPI';
}

const TIMEOUT_MS = 8000;

/** MM-DD-YYYY, o formato que a API do Banco Central pede. */
function bcbDate(date: Date) {
  return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}-${date.getFullYear()}`;
}

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

interface PtaxRow { cotacaoVenda?: number; dataHoraCotacao?: string; tipoBoletim?: string }

async function ptax(currency: 'USD' | 'EUR') {
  const end = new Date();
  const start = new Date(end.getTime() - 10 * 86_400_000);
  const url = 'https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/'
    + 'CotacaoMoedaPeriodo(moeda=@moeda,dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)'
    + `?@moeda='${currency}'&@dataInicial='${bcbDate(start)}'&@dataFinalCotacao='${bcbDate(end)}'&$format=json`;
  const json = (await getJson(url)) as { value?: PtaxRow[] };
  const rows = (json.value || []).filter((row) => Number(row.cotacaoVenda) > 0);
  // O último boletim do período; "Fechamento" é o oficial do dia.
  const closing = rows.filter((row) => row.tipoBoletim === 'Fechamento');
  const last = (closing.length ? closing : rows).at(-1);
  if (!last) throw new Error('Sem cotação no período.');
  return { rate: Number(last.cotacaoVenda), date: String(last.dataHoraCotacao || '').slice(0, 10) };
}

async function awesome() {
  const json = (await getJson('https://economia.awesomeapi.com.br/json/last/USD-BRL,EUR-BRL')) as Record<string, { bid?: string; create_date?: string }>;
  const usd = Number(json.USDBRL?.bid);
  const eur = Number(json.EURBRL?.bid);
  if (!(usd > 0) || !(eur > 0)) throw new Error('Resposta sem cotação.');
  return { usd, eur, date: String(json.USDBRL?.create_date || '').slice(0, 10) };
}

const round4 = (value: number) => Math.round(value * 10000) / 10000;

export async function fetchExchangeRates(): Promise<ExchangeRates> {
  try {
    const [usd, eur] = await Promise.all([ptax('USD'), ptax('EUR')]);
    return { usd: round4(usd.rate), eur: round4(eur.rate), date: usd.date, source: 'Banco Central (PTAX)' };
  } catch {
    try {
      const rates = await awesome();
      return { usd: round4(rates.usd), eur: round4(rates.eur), date: rates.date, source: 'AwesomeAPI' };
    } catch {
      throw new Error('Não foi possível buscar a cotação agora. Digite o valor do dólar e do euro à mão.');
    }
  }
}
