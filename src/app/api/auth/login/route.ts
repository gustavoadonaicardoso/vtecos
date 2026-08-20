import { NextResponse } from 'next/server';
import { signIn } from '@/services/auth.service';

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email e senha obrigatórios' },
        { status: 400 }
      );
    }

    const result = await signIn(email.trim(), password);

    if (!result.success) {
      console.error('Erro no login:', result.error);

      return NextResponse.json(
        { error: result.error || 'Credenciais inválidas' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { data: result.data },
      { status: 200 }
    );
  } catch (error) {
    console.error('Erro na rota de login:', error);

    return NextResponse.json(
      { error: 'Erro interno de autenticação' },
      { status: 500 }
    );
  }
}