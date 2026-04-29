import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { signIn } from '@/services/auth.service';

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email e senha obrigatórios' }, { status: 400 });
    }

    const result = await signIn(email, password);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 401 });
    }

    return NextResponse.json({ data: result.data }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ error: 'Erro de autenticação' }, { status: 500 });
  }
}
