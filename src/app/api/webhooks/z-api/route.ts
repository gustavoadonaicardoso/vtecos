import { NextResponse } from 'next/server';
import { handleZapiWebhook } from '@/lib/zapi';

/**
 * Z-API Webhook Endpoint
 * Receive and process incoming WhatsApp messages
 */
export async function POST(request: Request) {
    try {
        const payload = await request.json();
        
        // Logic for Z-API webhook processing
        const result = await handleZapiWebhook(payload);
        
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
