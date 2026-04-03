import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { getSharedToken } from './shared-auth';

const API_URL = 'http://localhost:3001';

describe('Intent Signals API Tests', () => {
  let token: string;

  beforeAll(async () => {
    token = getSharedToken();
  });

  // Test 8.1: List signals without auth
  it('8.1 - should reject list signals without auth', async () => {
    const res = await request(API_URL).get('/api/signals');
    expect(res.status).toBe(401);
  });

  // Test 8.2: List signals with auth
  it('8.2 - should list signals with auth', async () => {
    const res = await request(API_URL)
      .get('/api/signals')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  // Test 8.3: Detect signals for a company
  it('8.3 - should detect signals for a company', async () => {
    const res = await request(API_URL)
      .post('/api/signals/detect')
      .set('Authorization', `Bearer ${token}`)
      .send({ company: 'Test Corp', industry: 'Technology' });
    expect(res.status).toBe(200);
  });

  // Test 8.4: Get signals for nonexistent lead
  it('8.4 - should return empty array for nonexistent lead', async () => {
    const res = await request(API_URL)
      .get('/api/signals/lead/fake-id')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(0);
  });
});
