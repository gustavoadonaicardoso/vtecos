/**
 * VÓRTICE CRM — Official WhatsApp Business API Service
 */

// Tipos centralizados em @/types
import type { WhatsAppMessagePayload } from '@/types';

export type { WhatsAppMessagePayload };

export class WhatsAppService {
  private static API_VERSION = 'v21.0';
  private static BASE_URL = `https://graph.facebook.com/${this.API_VERSION}`;

  /**
   * Send a message through the Official WhatsApp API
   */
  static async sendMessage(config: { token: string; phoneId: string }, payload: WhatsAppMessagePayload) {
    const url = `${this.BASE_URL}/${config.phoneId}/messages`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: payload.to,
          type: payload.type,
          ...(payload.type === 'text' ? { text: payload.text } : { template: payload.template })
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || 'Erro ao enviar mensagem via WhatsApp');
      }

      return { success: true, data };
    } catch (error: any) {
      console.error('WhatsApp Service Error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Validate connection using a simple API call
   */
  static async validateConnection(config: { token: string; phoneId: string }) {
    const url = `${this.BASE_URL}/${config.phoneId}`;

    try {
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${config.token}`,
        },
      });

      // FIX #19: não declarar `data` — apenas verifica se a resposta é OK
      return response.ok;
    } catch (error) {
      return false;
    }
  }
}
