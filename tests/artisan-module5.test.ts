import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { getSharedToken } from './shared-auth';

const API_URL = 'http://localhost:3001';

describe('Artisan Module 5 — CRM Intelligence Hub', () => {
  let token: string;
  const testLeadId = `mod5-lead-${Date.now()}`;

  beforeAll(async () => {
    token = getSharedToken();
    // Seed a test lead
    await request(API_URL)
      .post('/api/leads/sync')
      .set('Authorization', `Bearer ${token}`)
      .send({
        leads: [{
          lead_id: testLeadId,
          name: 'Khalid Bin Salman',
          title: 'CEO',
          company: 'Dammam Industrial Group',
          email: 'khalid@dig.sa',
          industry: 'Manufacturing',
          lead_score: 88,
          email_verified: 1,
          email_source: 'test'
        }]
      });
  });

  // Test 5.1: Dashboard without auth
  it('5.1 - should reject dashboard without auth', async () => {
    const res = await request(API_URL).get('/api/artisan/crm/dashboard');
    expect(res.status).toBe(401);
  });

  // Test 5.2: Get dashboard
  it('5.2 - should return CRM dashboard', async () => {
    const res = await request(API_URL)
      .get('/api/artisan/crm/dashboard')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('total_leads');
    expect(res.body).toHaveProperty('total_outreaches');
    expect(res.body).toHaveProperty('total_replies');
    expect(res.body).toHaveProperty('pipeline_summary');
    expect(Array.isArray(res.body.pipeline_summary)).toBe(true);
  });

  // Test 5.3: Funnel without auth
  it('5.3 - should reject funnel without auth', async () => {
    const res = await request(API_URL).get('/api/artisan/crm/funnel');
    expect(res.status).toBe(401);
  });

  // Test 5.4: Get funnel visualization data
  it('5.4 - should return funnel data', async () => {
    const res = await request(API_URL)
      .get('/api/artisan/crm/funnel')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('funnel');
    expect(res.body).toHaveProperty('conversion_summary');
    expect(Array.isArray(res.body.funnel)).toBe(true);
    expect(res.body.funnel.length).toBeGreaterThanOrEqual(1);
  });

  // Test 5.5: Export CSV without auth
  it('5.5 - should reject CSV export without auth', async () => {
    const res = await request(API_URL).get('/api/artisan/crm/export-csv');
    expect(res.status).toBe(401);
  });

  // Test 5.6: Export leads to CSV
  it('5.6 - should export leads as CSV', async () => {
    const res = await request(API_URL)
      .get('/api/artisan/crm/export-csv')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain('lead_id');
    expect(res.text).toContain('name');
    expect(res.text).toContain(testLeadId);
  });
});
