import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { getSharedToken } from './shared-auth';

const API_URL = 'http://localhost:3001';

describe('Leads API Tests', () => {
  let token: string;

  beforeAll(async () => {
    token = getSharedToken();
  });

  // Test 2.1: Get leads without auth
  it('2.1 - should reject get leads without auth', async () => {
    const res = await request(API_URL).get('/api/leads');
    expect(res.status).toBe(401);
  });

  // Test 2.2: Get leads with auth
  it('2.2 - should return leads array with auth', async () => {
    const res = await request(API_URL)
      .get('/api/leads')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  // Test 2.3: Sync a lead
  it('2.3 - should sync a lead', async () => {
    const res = await request(API_URL)
      .post('/api/leads/sync')
      .set('Authorization', `Bearer ${token}`)
      .send({
        leads: [{
          lead_id: 'test-lead-001',
          name: 'Test Lead',
          title: 'CTO',
          company: 'Test Corp',
          email: 'test@testcorp.com',
          linkedin: 'https://linkedin.com/in/test',
          industry: 'Technology',
          lead_score: 75,
          email_verified: 0,
          email_source: 'test'
        }]
      });
    expect(res.status).toBe(200);
  });

  // Test 2.4: Get leads after sync
  it('2.4 - should return leads including synced lead', async () => {
    const res = await request(API_URL)
      .get('/api/leads')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });

  // Test 2.5: Update lead status
  it('2.5 - should update lead status', async () => {
    const res = await request(API_URL)
      .post('/api/leads/status')
      .set('Authorization', `Bearer ${token}`)
      .send({
        id: 'test-lead-001',
        status: 'CONTACTED'
      });
    expect(res.status).toBe(200);
  });

  // Test 2.6: Delete lead
  it('2.6 - should delete lead', async () => {
    const res = await request(API_URL)
      .delete('/api/leads/test-lead-001')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  // Test 2.7: Delete nonexistent lead
  it('2.7 - should return 404 for nonexistent lead', async () => {
    const res = await request(API_URL)
      .delete('/api/leads/fake-id')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});
