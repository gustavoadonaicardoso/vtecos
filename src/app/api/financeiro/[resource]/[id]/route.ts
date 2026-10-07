import { NextResponse } from 'next/server';
import { requireFinanceAccess } from '@/lib/finance/access';
import {
  deleteRow, loadBusiness, mappers, parseChannel, parseFixedCost, parseIngredient, parseProduct, saveProduct, updateRow,
} from '@/services/finance.service';

type Params = { params: Promise<{ resource: string; id: string }> };

const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

const TABLES = {
  ingredients: 'fin_ingredients',
  channels: 'fin_channels',
  'fixed-costs': 'fin_fixed_costs',
  products: 'fin_products',
  sales: 'fin_sales',
} as const;

export async function PUT(request: Request, { params }: Params) {
  const { resource, id } = await params;
  const auth = await requireFinanceAccess(request, 'manage');
  if ('error' in auth) return fail(auth.error.message, auth.error.status);
  const tenantId = auth.access.tenant.id;

  try {
    const body = await request.json();
    switch (resource) {
      case 'ingredients': {
        const parsed = parseIngredient(body, (await loadBusiness(tenantId)).categories);
        if ('error' in parsed) return fail(parsed.error);
        const row = await updateRow('fin_ingredients', tenantId, id, parsed.data);
        return row ? NextResponse.json({ data: mappers.toIngredient(row) }) : fail('Insumo não encontrado.', 404);
      }
      case 'channels': {
        const parsed = parseChannel(body);
        if ('error' in parsed) return fail(parsed.error);
        const row = await updateRow('fin_channels', tenantId, id, parsed.data);
        return row ? NextResponse.json({ data: mappers.toChannel(row) }) : fail('Canal não encontrado.', 404);
      }
      case 'fixed-costs': {
        const parsed = parseFixedCost(body);
        if ('error' in parsed) return fail(parsed.error);
        const row = await updateRow('fin_fixed_costs', tenantId, id, parsed.data);
        return row ? NextResponse.json({ data: mappers.toFixedCost(row) }) : fail('Despesa não encontrada.', 404);
      }
      case 'products': {
        const parsed = parseProduct(body);
        if ('error' in parsed) return fail(parsed.error);
        const result = await saveProduct(tenantId, id, parsed.data);
        if ('error' in result && result.error) return fail(result.error);
        return NextResponse.json({ data: result.data });
      }
      default:
        return fail('Recurso desconhecido.', 404);
    }
  } catch (err: unknown) {
    return fail(err instanceof Error ? err.message : 'Erro interno.', 500);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const { resource, id } = await params;
  const table = TABLES[resource as keyof typeof TABLES];
  if (!table) return fail('Recurso desconhecido.', 404);

  // Apagar venda: quem registra vendas pode corrigir um lançamento errado.
  const auth = await requireFinanceAccess(request, resource === 'sales' ? 'sell' : 'manage');
  if ('error' in auth) return fail(auth.error.message, auth.error.status);

  const result = await deleteRow(table, auth.access.tenant.id, id);
  if (result.error) return fail(result.error, result.status);
  return NextResponse.json({ success: true });
}
