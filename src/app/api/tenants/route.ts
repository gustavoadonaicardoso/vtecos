import { NextResponse } from 'next/server';
import { fetchTenants, createTenant } from '@/services/tenants.service';

// GET: Lista todos os tenants
export async function GET() {
  const result = await fetchTenants();
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json({ data: result.data });
}

// POST: Cria um novo tenant
export async function POST(request: Request) {
  try {
    const { name } = await request.json();
    if (!name?.trim()) {
      return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 });
    }

    const result = await createTenant(name);
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 500 });
    return NextResponse.json({ data: result.data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
