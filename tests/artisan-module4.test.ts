import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { getSharedToken } from './shared-auth';

const API_URL = 'http://localhost:3001';

describe('Artisan Module 4 — Secretary (Reply Manager)', () => {
  let token: string;
  const testLeadId = `mod4-lead-${Date.now()}`;

  beforeAll(async () => {
    token = getSharedToken();
    // Seed a test lead
    await request(API_URL)
      .post('/api/leads/sync')
      .set('Authorization', `Bearer ${token}`)
      .send({
        leads: [{
          lead_id: testLeadId,
          name: 'Fatima Al-Zahrani',
          title: 'Procurement Manager',
          company: 'Jeddah Logistics Co',
          email: 'fatima@jlc.sa',
          industry: 'Logistics',
          lead_score: 75,
          email_verified: 1,
          email_source: 'test'
        }]
      });
  });

  // Test 4.1: Classify reply without auth
  it('4.1 - should reject classify without auth', async () => {
    const res = await request(API_URL)
      .post('/api/artisan/replies/classify')
      .send({ emailBody: 'Interested', originalOutreach: 'Hello' });
    expect(res.status).toBe(401);
  });

  // Test 4.2: Classify a reply (interested)
  it('4.2 - should classify reply as interested', async () => {
    const res = await request(API_URL)
      .post('/api/artisan/replies/classify')
      .set('Authorization', `Bearer ${token}`)
      .send({
        emailBody: 'Thank you for reaching out. We are very interested in learning more about your services. Can we schedule a call next week?',
        originalOutreach: 'Hello, we would like to partner with you.',
        options: { userCompanyName: 'TestCo', userName: 'Tester' }
      });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('category');
    expect(res.body).toHaveProperty('artisanCategory');
    expect(['INTERESTED', 'QUESTION']).toContain(res.body.category);
  }, 15000);

  // Test 4.3: Classify a reply (not interested)
  it('4.3 - should classify reply as not interested', async () => {
    const res = await request(API_URL)
      .post('/api/artisan/replies/classify')
      .set('Authorization', `Bearer ${token}`)
      .send({
        emailBody: 'We are fully committed right now and this is not the right time for us. Please reach out again in six months.',
        originalOutreach: 'Hello, we would like to partner with you.'
      });
    expect(res.status).toBe(200);
    expect(res.body.category).toBe('NOT_INTERESTED');
    expect(res.body.artisanCategory).toBe('not_interested');
  }, 15000);

  // Test 4.4: Track a reply
  it('4.4 - should track a reply', async () => {
    const res = await request(API_URL)
      .post('/api/artisan/replies/track')
      .set('Authorization', `Bearer ${token}`)
      .send({
        lead_id: testLeadId,
        reply_body: 'We are interested. Please send more info.',
        category: 'interested',
        confidence: 92,
        suggested_response: 'I will send the details right away.'
      });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.reply_id).toBe('number');
  });

  // Test 4.5: Timeline without auth
  it('4.5 - should reject timeline without auth', async () => {
    const res = await request(API_URL).get(`/api/artisan/replies/timeline/${testLeadId}`);
    expect(res.status).toBe(401);
  });

  // Test 4.6: Get timeline for lead
  it('4.6 - should return timeline for lead', async () => {
    // First send an outreach so timeline has data
    await request(API_URL)
      .post('/api/artisan/outreach/send')
      .set('Authorization', `Bearer ${token}`)
      .send({
        lead_id: testLeadId,
        message_type: 'cold_email',
        subject: 'Test',
        body: 'Test outreach for timeline.',
        language: 'en'
      });

    const res = await request(API_URL)
      .get(`/api/artisan/replies/timeline/${testLeadId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.timeline)).toBe(true);
    expect(res.body.lead_id).toBe(testLeadId);
  });

  // Test 4.7: Suggest follow-up
  it('4.7 - should suggest follow-up for interested category', async () => {
    const res = await request(API_URL)
      .post('/api/artisan/replies/follow-up')
      .set('Authorization', `Bearer ${token}`)
      .send({
        reply_category: 'interested',
        lead_name: 'Fatima',
        company_name: 'Jeddah Logistics Co',
        language: 'en'
      });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('suggestion');
    expect(typeof res.body.suggestion).toBe('string');
    expect(res.body.suggestion.length).toBeGreaterThan(10);
    expect(res.body.category).toBe('interested');
  });

  // Test 4.8: Suggest follow-up in Arabic
  it('4.8 - should suggest Arabic follow-up', async () => {
    const res = await request(API_URL)
      .post('/api/artisan/replies/follow-up')
      .set('Authorization', `Bearer ${token}`)
      .send({
        reply_category: 'follow_up_needed',
        lead_name: 'فاطمة',
        language: 'ar'
      });
    expect(res.status).toBe(200);
    expect(res.body.language).toBe('ar');
    expect(res.body.suggestion).toContain('شكراً');
  });
});
