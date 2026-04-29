/**
 * VÓRTICE CRM — Meta Messaging API Service (Instagram & Messenger)
 */

// Tipos centralizados em @/types
import type { MetaMessagePayload } from '@/types';

export type { MetaMessagePayload };

export class MetaMessagingService {
  private static API_VERSION = 'v21.0';
  private static BASE_URL = `https://graph.facebook.com/${this.API_VERSION}`;

  /**
   * Send a message through Meta Messaging API
   */
  static async sendMessage(config: { pageToken: string; pageId: string }, payload: MetaMessagePayload) {
    const url = `${this.BASE_URL}/${config.pageId}/messages`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          access_token: config.pageToken,
          recipient: { id: payload.recipientId },
          message: payload.message,
          messaging_type: 'RESPONSE', // Usually for replying to received messages
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || 'Erro ao enviar mensagem via Meta API');
      }

      return { success: true, data };
    } catch (error: any) {
      console.error('Meta Messaging Service Error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Fetch Instagram Business Account Details
   */
  static async getInstagramContent(config: { pageToken: string; instagramId: string }) {
     const url = `${this.BASE_URL}/${config.instagramId}?fields=name,username,profile_picture_url&access_token=${config.pageToken}`;
     
     try {
        const response = await fetch(url);
        return await response.json();
     } catch (error) {
        return null;
     }
  }
}
