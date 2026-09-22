import { NextResponse } from 'next/server';
import { handleZapiWebhook } from '@/lib/zapi';
import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * Z-API Webhook Endpoint
 * Receive and process incoming WhatsApp messages
 */
export async function POST(request: Request) {
    try {
        const payload = await request.json();

        // Chamada server-to-server (sem sessão de usuário) — usa o client
        // administrativo para não ser bloqueada pelo RLS.
        const result = await handleZapiWebhook(payload, supabaseAdmin);
        
        if (!result.success) {
            console.warn('Falha no processamento do webhook Z-API:', result.error);
        }

        return NextResponse.json({ success: true, message: 'Webhook recebido com sucesso' });
    } catch (error: any) {
        console.error('Erro na rota de Webhook Z-API:', error);
        return NextResponse.json(
            { success: false, error: 'Erro ao processar as informações' }, 
            { status: 500 }
        );
    }
}
