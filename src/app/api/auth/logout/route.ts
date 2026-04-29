import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { signOut } from '@/services/auth.service';

export async function POST() {
  try {
    await signOut();
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ error: 'Erro ao fazer logoff' }, { status: 500 });
  }
}
