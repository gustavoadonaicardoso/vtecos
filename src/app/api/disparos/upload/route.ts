import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: 'buffer', raw: false, cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows: Record<string, string>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Arquivo vazio ou sem dados' }, { status: 400 });
    }

    const columns = Object.keys(rows[0]);
    const preview = rows.slice(0, 5).map(row =>
      Object.fromEntries(Object.entries(row).map(([k, v]) => [k, String(v)]))
    );
    const allRows = rows.map(row =>
      Object.fromEntries(Object.entries(row).map(([k, v]) => [k, String(v)]))
    );

    return NextResponse.json({ columns, preview, allRows, totalRows: rows.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Erro ao processar arquivo' }, { status: 500 });
  }
}
