import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { getSharedToken } from './shared-auth';

const API_URL = 'http://localhost:3001';

describe('Artisan Module 3 — Vision Strategist', () => {
  let token: string;
  const testLeadId = `mod3-lead-${Date.now()}`;

  beforeAll(async () => {
    token = getSharedToken();
    // Seed a test lead
    await request(API_URL)
      .post('/api/leads/sync')
      .set('Authorization', `Bearer ${token}`)
      .send({
        leads: [{
          lead_id: testLeadId,
          name: 'Ahmad Al-Rashid',
          title: 'Director of Strategy',
          company: 'Riyadh Tech Ventures',
          email: 'ahmad@rtv.sa',
          industry: 'Technology',
          lead_score: 80,
          email_verified: 1,
          email_source: 'test'
        }]
      });
  });

  // Test 3.1: Templates without auth
  it('3.1 - should reject templates without auth', async () => {
    const res = await request(API_URL).get('/api/artisan/outreach/templates');
    expect(res.status).toBe(401);
  });

  // Test 3.2: Get templates with auth
  it('3.2 - should return outreach templates', async () => {
    const res = await request(API_URL)
      .get('/api/artisan/outreach/templates')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.templates)).toBe(true);
    expect(res.body.templates.length).toBeGreaterThanOrEqual(6);
  });

  // Test 3.3: Filter templates by type
  it('3.3 - should filter templates by type', async () => {
    const res = await request(API_URL)
      .get('/api/artisan/outreach/templates?type=linkedin')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.templates.every((t: any) => t.message_type === 'linkedin')).toBe(true);
  });

  // Test 3.4: Generate outreach without auth
  it('3.4 - should reject outreach generation without auth', async () => {
    const res = await request(API_URL)
      .post('/api/artisan/outreach/generate')
      .send({ lead: { name: 'Test', title: 'CEO', company: 'TestCo' }, context: { service: 'Design' } });
    expect(res.status).toBe(401);
  });

  // Test 3.5: Generate personalized outreach
  it('3.5 - should generate personalized outreach', async () => {
    const res = await request(API_URL)
      .post('/api/artisan/outreach/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({
        lead: {
          name: 'Ahmad Al-Rashid',
          title: 'Director of Strategy',
          company: 'Riyadh Tech Ventures',
          industry: 'Technology'
        },
        context: { service: 'Strategic Partnership' },
        messageType: 'cold_email',
        language: 'en'
      });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('subject');
    expect(res.body).toHaveProperty('body');
    expect(res.body).toHaveProperty('language');
    expect(typeof res.body.body).toBe('string');
    expect(res.body.body.length).toBeGreaterThan(20);
  }, 15000);

  // Test 3.6: Send outreach without lead_id
  it('3.6 - should reject send outreach without required fields', async () => {
    const res = await request(API_URL)
      .post('/api/artisan/outreach/send')
      .set('Authorization', `Bearer ${token}`)
      .send({ message_type: 'cold_email', body: 'Hello' });
    expect(res.status).toBe(400);
  });

  // Test 3.7: Send and track outreach
  it('3.7 - should send and track outreach', async () => {
    const res = await request(API_URL)
      .post('/api/artisan/outreach/send')
      .set('Authorization', `Bearer ${token}`)
      .send({
        lead_id: testLeadId,
        message_type: 'cold_email',
        subject: 'Test Outreach',
        body: 'This is a test outreach message.',
        language: 'en'
      });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.outreach_id).toBe('number');
  });
});
