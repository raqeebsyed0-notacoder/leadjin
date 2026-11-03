import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { getSharedToken } from './shared-auth';

const API_URL = 'http://localhost:3001';

describe('Enrichment API Tests', () => {
  let token: string;

  beforeAll(async () => {
    token = getSharedToken();
  });

  // Test 3.1: Get providers without auth
  it('3.1 - should reject get providers without auth', async () => {
    const res = await request(API_URL).get('/api/enrichment/providers');
    expect(res.status).toBe(401);
  });

  // Test 3.2: Get providers with auth
  it('3.2 - should return providers with auth', async () => {
    const res = await request(API_URL)
      .get('/api/enrichment/providers')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('providers');
    expect(res.body).toHaveProperty('totalActive');
    expect(Array.isArray(res.body.providers)).toBe(true);
  });

  // Test 3.3: Get enrichment stats
  it('3.3 - should return enrichment stats', async () => {
    const res = await request(API_URL)
      .get('/api/enrichment/stats')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  // Test 3.4: Enrich-waterfall without lead data
  it('3.4 - should reject enrich-waterfall without lead data', async () => {
    const res = await request(API_URL)
      .post('/api/leads/enrich-waterfall')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
  });

  // Test 3.5: Enrich-waterfall with lead data (no providers configured)
  it('3.5 - should handle enrich-waterfall with lead data', async () => {
    const res = await request(API_URL)
      .post('/api/leads/enrich-waterfall')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Test Lead',
        company: 'Test Corp',
        email: 'test@testcorp.com'
      });
    expect(res.status).toBe(200);
  });

  // Test 3.6: Bulk enrich with empty array
  it('3.6 - should handle bulk enrich with empty array', async () => {
    const res = await request(API_URL)
      .post('/api/leads/enrich-bulk')
      .set('Authorization', `Bearer ${token}`)
      .send({ leads: [] });
    expect([200, 400]).toContain(res.status);
  });
});
