import { NextResponse } from 'next/server';
import { requireActiveProfile } from '@/lib/session';
import { requireFinanceAccess } from '@/lib/finance/access';
import {
  billPlatformMonth, createSales, currentSettings, importPlatformPlans, importRows, insertRow, listSales, listTenantsForStaff, mappers,
  parseChannel, parseFixedCost, loadBusiness, parseIngredient, parseProduct, parseSaleInput, parseSettings, platformSummary,
  refreshExchangeRates, reorderChannels, saveBusiness, saveProduct, saveSettings,
} from '@/services/finance.service';

type Params = { params: Promise<{ resource: string }> };
type SaleInput = Extract<ReturnType<typeof parseSaleInput>, { data: unknown }>['data'];

const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status });
const isMonth = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
const NOT_PLATFORM = 'Só a planilha da própria Vórtice usa os clientes do Painel Master.';

export async function GET(request: Request, { params }: Params) {
  const { resource } = await params;

  // Seletor de empresa: só a equipe da plataforma (Vórtice) lista outras empresas.
  if (resource === 'tenants') {
    const auth = await requireActiveProfile({ module: 'financeiro', permission: 'financeiro.view' });
    if ('error' in auth) return fail(auth.error.message, auth.error.status);
    if (!auth.isPlatform) return NextResponse.json({ data: [{ id: auth.tenantId, name: auth.tenantName, status: 'ACTIVE' }] });
    try {
      return NextResponse.json({ data: await listTenantsForStaff() });
    } catch (err: unknown) {
      return fail(err instanceof Error ? err.message : 'Erro ao listar empresas.', 500);
    }
  }

  if (resource === 'sales') {
    const auth = await requireFinanceAccess(request);
    if ('error' in auth) return fail(auth.error.message, auth.error.status);
    const month = new URL(request.url).searchParams.get('month') || '';
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return fail('Mês inválido.');
    try {
      return NextResponse.json({ data: await listSales(auth.access.tenant.id, month) });
    } catch (err: unknown) {
      return fail(err instanceof Error ? err.message : 'Erro ao listar vendas.', 500);
    }
  }

  // Clientes e planos do Painel Master (só na planilha da Vórtice).
  if (resource === 'platform') {
    const auth = await requireFinanceAccess(request);
    if ('error' in auth) return fail(auth.error.message, auth.error.status);
    if (!auth.access.tenant.isPlatform) return fail(NOT_PLATFORM, 403);
    const month = new URL(request.url).searchParams.get('month') || '';
    if (!isMonth(month)) return fail('Mês inválido.');
    try {
      return NextResponse.json({ data: await platformSummary(auth.access.tenant.id, month) });
    } catch (err: unknown) {
      return fail(err instanceof Error ? err.message : 'Erro ao carregar os clientes.', 500);
    }
  }

  return fail('Recurso desconhecido.', 404);
}

export async function POST(request: Request, { params }: Params) {
  const { resource } = await params;
  const auth = await requireFinanceAccess(request, resource === 'sales' ? 'sell' : 'manage');
  if ('error' in auth) return fail(auth.error.message, auth.error.status);
  const tenantId = auth.access.tenant.id;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return fail('Corpo inválido.');
  }

  try {
    switch (resource) {
      case 'ingredients': {
        const parsed = parseIngredient(body, (await loadBusiness(tenantId)).categories);
        if ('error' in parsed) return fail(parsed.error);
        return NextResponse.json({ data: mappers.toIngredient(await insertRow('fin_ingredients', tenantId, parsed.data)) }, { status: 201 });
      }
      case 'channels': {
        if (Array.isArray(body.order)) {
          await reorderChannels(tenantId, (body.order as unknown[]).filter((id): id is string => typeof id === 'string'));
          return NextResponse.json({ success: true });
        }
        const parsed = parseChannel(body);
        if ('error' in parsed) return fail(parsed.error);
        return NextResponse.json({ data: mappers.toChannel(await insertRow('fin_channels', tenantId, parsed.data)) }, { status: 201 });
      }
      case 'fixed-costs': {
        const parsed = parseFixedCost(body);
        if ('error' in parsed) return fail(parsed.error);
        return NextResponse.json({ data: mappers.toFixedCost(await insertRow('fin_fixed_costs', tenantId, parsed.data)) }, { status: 201 });
      }
      case 'products': {
        const parsed = parseProduct(body);
        if ('error' in parsed) return fail(parsed.error);
        const result = await saveProduct(tenantId, null, parsed.data);
        if ('error' in result && result.error) return fail(result.error);
        return NextResponse.json({ data: result.data }, { status: 201 });
      }
      case 'business': {
        const result = await saveBusiness(tenantId, body);
        if ('error' in result) return fail(result.error);
        return NextResponse.json({ data: result.data });
      }
      case 'settings': {
        return NextResponse.json({ data: await saveSettings(tenantId, parseSettings(body, await currentSettings(tenantId))) });
      }
      case 'fx': {
        const result = await refreshExchangeRates(tenantId).catch((err: Error) => ({ error: err.message }));
        if ('error' in result) return fail(result.error, 502);
        return NextResponse.json({ data: result });
      }
      case 'platform': {
        if (!auth.access.tenant.isPlatform) return fail(NOT_PLATFORM, 403);
        if (body.action === 'import_plans') return NextResponse.json({ data: await importPlatformPlans(tenantId) });
        if (body.action === 'bill_month') {
          if (!isMonth(body.month)) return fail('Mês inválido.');
          return NextResponse.json({ data: await billPlatformMonth(tenantId, auth.access.profile.id, body.month) });
        }
        return fail('Ação inválida.');
      }
      case 'sales': {
        const list = Array.isArray(body.sales) ? (body.sales as Record<string, unknown>[]) : [body];
        if (list.length === 0 || list.length > 2000) return fail('Envie de 1 a 2000 vendas por vez.');
        const parsed = list.map(parseSaleInput);
        const inputs: SaleInput[] = [];
        const errors: { row: number; message: string }[] = [];
        parsed.forEach((item, index) => {
          if ('error' in item) errors.push({ row: index + 1, message: item.error as string });
          else inputs.push(item.data);
        });
        if (list.length === 1 && errors.length === 1) return fail(errors[0].message);
        const source = body.source === 'import' ? 'import' : 'manual';
        const result = await createSales(tenantId, auth.access.profile.id, inputs, source);
        if (list.length === 1 && result.errors.length === 1) return fail(result.errors[0].message);
        return NextResponse.json({ data: result.inserted, errors: [...errors, ...result.errors] }, { status: 201 });
      }
      case 'import': {
        const kind = body.kind === 'fixed_costs' ? 'fixed_costs' : body.kind === 'ingredients' ? 'ingredients' : null;
        if (!kind || !Array.isArray(body.rows)) return fail('Importação inválida.');
        return NextResponse.json({ data: await importRows(tenantId, kind, body.rows as Record<string, unknown>[]) });
      }
      default:
        return fail('Recurso desconhecido.', 404);
    }
  } catch (err: unknown) {
    return fail(err instanceof Error ? err.message : 'Erro interno.', 500);
  }
}
