/**
 * WhatsApp Business Cloud API Service
 *
 * Required environment variables:
 *   WHATSAPP_PHONE_NUMBER_ID      — Phone number ID from Meta Business Suite
 *   WHATSAPP_ACCESS_TOKEN         — Permanent or temporary access token (System User token recommended)
 *   WHATSAPP_BUSINESS_ACCOUNT_ID  — WhatsApp Business Account ID from Meta Business Suite
 *   WHATSAPP_WEBHOOK_VERIFY_TOKEN — Any secret string you choose; used to verify webhook registration
 *
 * Cloud API reference: https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages
 */

const WA_API_VERSION = 'v21.0';
const WA_BASE_URL = `https://graph.facebook.com/${WA_API_VERSION}`;

export interface WhatsAppConfig {
  phoneNumberId: string;
  accessToken: string;
  businessAccountId: string;
  webhookVerifyToken: string;
}

export interface WhatsAppMessageResult {
  success: boolean;
  messageId?: string;
  error?: string;
  raw?: any;
}

// In-memory status cache for sent messages
const messageStatusCache = new Map<string, string>();

class WhatsAppService {
  private config: WhatsAppConfig | null = null;

  constructor() {
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const businessAccountId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
    const webhookVerifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

    if (phoneNumberId && accessToken && businessAccountId && webhookVerifyToken) {
      this.config = { phoneNumberId, accessToken, businessAccountId, webhookVerifyToken };
      console.log('[WhatsApp] Service initialized — phone number ID:', phoneNumberId);
    } else {
      console.warn('[WhatsApp] Service not configured — set WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN, WHATSAPP_BUSINESS_ACCOUNT_ID, WHATSAPP_WEBHOOK_VERIFY_TOKEN');
    }
  }

  isConfigured(): boolean {
    return this.config !== null;
  }

  /**
   * Format a phone number for the WhatsApp API (no +, no spaces, country code prefix).
   *
   * Handles KSA (+966) and UAE (+971) formats:
   *   "0551234567"     → "966551234567"  (leading 0 = KSA local, strip and add 966)
   *   "+966551234567"  → "966551234567"  (strip +)
   *   "966551234567"   → "966551234567"  (already correct)
   *   "551234567"      → "966551234567"  (9 digits starting with 5 = assume KSA)
   *   "+971501234567"  → "971501234567"  (UAE, strip +)
   */
  formatPhone(phone: string): string {
    if (!phone) return '';
    // Strip all non-digit characters except leading +
    let cleaned = phone.replace(/[\s\-().]/g, '');

    // Remove leading +
    if (cleaned.startsWith('+')) {
      cleaned = cleaned.slice(1);
    }

    // Already has country code (11+ digits starting with known country code)
    if (cleaned.startsWith('966') || cleaned.startsWith('971') || cleaned.startsWith('974') || cleaned.startsWith('973')) {
      return cleaned;
    }

    // Leading 0 — assume KSA local
    if (cleaned.startsWith('0')) {
      return '966' + cleaned.slice(1);
    }

    // 9-digit number starting with 5 — assume KSA mobile
    if (cleaned.length === 9 && cleaned.startsWith('5')) {
      return '966' + cleaned;
    }

    // 10-digit number — likely KSA with leading 0 already stripped by previous step
    // (shouldn't reach here but be safe)
    if (cleaned.length === 10 && cleaned.startsWith('05')) {
      return '966' + cleaned.slice(1);
    }

    // Fallback — return as-is (may be an already-formatted international number)
    return cleaned;
  }

  /**
   * Check whether the WhatsApp Cloud API considers a number valid.
   * Uses the contacts endpoint (requires a Business tier approval).
   * Returns true if the number exists on WhatsApp, false otherwise.
   * NOTE: this endpoint may not be available on all Meta app tiers.
   */
  async validatePhone(phone: string): Promise<boolean> {
    if (!this.config) return false;
    const formatted = this.formatPhone(phone);
    try {
      const response = await fetch(
        `${WA_BASE_URL}/${this.config.phoneNumberId}/contacts`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.config.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            blocking: 'wait',
            contacts: [`+${formatted}`],
            force_check: true,
          }),
        }
      );
      const data: any = await response.json();
      return data?.contacts?.[0]?.status === 'valid';
    } catch (err: any) {
      console.error('[WhatsApp] validatePhone error:', err.message);
      return false;
    }
  }

  /**
   * Send a plain text message to a phone number.
   */
  async sendMessage(to: string, text: string): Promise<WhatsAppMessageResult> {
    if (!this.config) {
      return { success: false, error: 'WhatsApp not configured' };
    }

    const formatted = this.formatPhone(to);
    const body = {
      messaging_product: 'whatsapp',
      to: formatted,
      type: 'text',
      text: { body: text },
    };

    return this._post(body);
  }

  /**
   * Send a template message. Required for the first outbound message to a contact
   * (outside the 24-hour customer service window).
   *
   * @param to           Destination phone number (will be formatted)
   * @param templateName Approved template name in Meta Business Suite
   * @param params       Ordered list of variable substitution values for the template body
   * @param languageCode BCP-47 language code; defaults to 'ar' for Arabic (KSA default)
   */
  async sendTemplate(
    to: string,
    templateName: string,
    params: string[],
    languageCode = 'ar'
  ): Promise<WhatsAppMessageResult> {
    if (!this.config) {
      return { success: false, error: 'WhatsApp not configured' };
    }

    const formatted = this.formatPhone(to);
    const components: any[] = [];

    if (params.length > 0) {
      components.push({
        type: 'body',
        parameters: params.map((text) => ({ type: 'text', text })),
      });
    }

    const body = {
      messaging_product: 'whatsapp',
      to: formatted,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        ...(components.length > 0 && { components }),
      },
    };

    return this._post(body);
  }

  /**
   * Send an image or document by URL.
   */
  async sendMedia(
    to: string,
    type: 'image' | 'document',
    url: string,
    caption?: string
  ): Promise<WhatsAppMessageResult> {
    if (!this.config) {
      return { success: false, error: 'WhatsApp not configured' };
    }

    const formatted = this.formatPhone(to);
    const mediaPayload: any = { link: url };
    if (caption) mediaPayload.caption = caption;

    const body = {
      messaging_product: 'whatsapp',
      to: formatted,
      type,
      [type]: mediaPayload,
    };

    return this._post(body);
  }

  /**
   * Mark an incoming message as read (shows double blue ticks to the sender).
   */
  async markAsRead(messageId: string): Promise<void> {
    if (!this.config) return;
    try {
      await fetch(`${WA_BASE_URL}/${this.config.phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          status: 'read',
          message_id: messageId,
        }),
      });
    } catch (err: any) {
      console.error('[WhatsApp] markAsRead error:', err.message);
    }
  }

  /**
   * Get the last known delivery status for a message ID (from the in-memory cache).
   * The cache is populated by the webhook handler in server.ts.
   */
  getMessageStatus(messageId: string): string {
    return messageStatusCache.get(messageId) || 'unknown';
  }

  /**
   * Update message status in the in-memory cache (called from webhook handler).
   */
  updateMessageStatus(messageId: string, status: string): void {
    messageStatusCache.set(messageId, status);
  }

  // ---- private helpers ----

  private async _post(body: object): Promise<WhatsAppMessageResult> {
    try {
      const response = await fetch(
        `${WA_BASE_URL}/${this.config!.phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.config!.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        }
      );

      const data: any = await response.json();

      if (!response.ok) {
        const errMsg = data?.error?.message || `HTTP ${response.status}`;
        console.error('[WhatsApp] API error:', errMsg, JSON.stringify(data));
        return { success: false, error: errMsg, raw: data };
      }

      const messageId = data?.messages?.[0]?.id;
      if (messageId) {
        messageStatusCache.set(messageId, 'sent');
      }

      return { success: true, messageId, raw: data };
    } catch (err: any) {
      console.error('[WhatsApp] Fetch error:', err.message);
      return { success: false, error: err.message };
    }
  }
}

// Export singleton
export const whatsappService = new WhatsAppService();
