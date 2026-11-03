import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { getSharedToken } from './shared-auth';

const API_URL = 'http://localhost:3001';

describe('WhatsApp API Tests', () => {
  let token: string;

  beforeAll(async () => {
    token = getSharedToken();
  });

  // Test 6.1: Get WhatsApp status
  it('6.1 - should return WhatsApp status with configured: false', async () => {
    const res = await request(API_URL)
      .get('/api/whatsapp/status')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('configured', false);
  });

  // Test 6.2: Send without WhatsApp configured
  it('6.2 - should reject send when WhatsApp not configured', async () => {
    const res = await request(API_URL)
      .post('/api/whatsapp/send')
      .set('Authorization', `Bearer ${token}`)
      .send({
        to: '+1234567890',
        message: 'Test message'
      });
    expect([400, 503]).toContain(res.status);
  });

  // Test 6.3: Webhook verify with wrong token
  it('6.3 - should reject webhook verify with wrong token', async () => {
    const res = await request(API_URL)
      .get('/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=test123');
    expect([403, 500]).toContain(res.status);
  });
});
