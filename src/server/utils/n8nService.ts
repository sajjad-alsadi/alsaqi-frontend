import axios from 'axios';
import logger from './logger.js';

export class N8nService {
  private static webhookUrl = process.env.N8N_WEBHOOK_URL || null;
  private static apiKey = process.env.N8N_WEBHOOK_API_KEY || null;

  static async sendEvent(eventName: string, payload: any) {
    if (!this.webhookUrl) {
      logger.warn(`[n8n] Webhook URL is not configured. Skipped event: ${eventName}`);
      return;
    }

    try {
      logger.info(`[n8n] Sending event ${eventName} to n8n...`);
      
      const headers: any = {};
      if (this.apiKey) {
        // Support both common patterns: X-N8N-API-KEY or Authorization header
        headers['X-N8N-API-KEY'] = this.apiKey;
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      await axios.post(this.webhookUrl, {
        event: eventName,
        timestamp: new Date().toISOString(),
        data: payload,
      }, { headers });
      logger.info(`[n8n] Successfully sent event: ${eventName}`);
    } catch (error: any) {
      logger.error(`[n8n] Failed to send event ${eventName}: ${error.message}`);
    }
  }
}
