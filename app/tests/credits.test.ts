import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { getSharedToken } from './shared-auth';

const API_URL = 'http://localhost:3001';

describe('Credits API Tests', () => {
  let token: string;

  beforeAll(async () => {
    token = getSharedToken();
  });

  // Test 4.1: Get credit balance without auth
  it('4.1 - should reject get credit balance without auth', async () => {
    const res = await request(API_URL).get('/api/credits/balance');
    expect(res.status).toBe(401);
  });

  // Test 4.2: Get credit balance with auth
  it('4.2 - should return credit balance with auth', async () => {
    const res = await request(API_URL)
      .get('/api/credits/balance')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('balance');
    expect(res.body).toHaveProperty('used');
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('transactions');
  });

  // Test 4.3: New user should have 50 credits
  it('4.3 - should have at least 50 credits for new user', async () => {
    const res = await request(API_URL)
      .get('/api/credits/balance')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.balance).toBeGreaterThanOrEqual(50);
  });
});
