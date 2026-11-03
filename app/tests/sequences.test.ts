import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { getSharedToken } from './shared-auth';

const API_URL = 'http://localhost:3001';

describe('Email Sequences API Tests', () => {
  let token: string;
  let sequenceId: string;

  beforeAll(async () => {
    token = getSharedToken();
  });

  // Test 5.1: List sequences (empty)
  it('5.1 - should list sequences', async () => {
    const res = await request(API_URL)
      .get('/api/sequences')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  // Test 5.2: Create sequence
  it('5.2 - should create sequence and return id', async () => {
    const res = await request(API_URL)
      .post('/api/sequences')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Test Sequence',
        steps: [
          { step: 1, type: 'email', subject: 'Hello {{name}}', body: 'Hi {{name}} from {{company}}', delay_hours: 0 },
          { step: 2, type: 'email', subject: 'Follow up', body: 'Following up {{name}}', delay_hours: 48 }
        ]
      });
    expect([200, 201]).toContain(res.status);
    expect(res.body).toHaveProperty('id');
    sequenceId = String(res.body.id);
  });

  // Test 5.3: Get created sequence
  it('5.3 - should get created sequence with steps', async () => {
    const res = await request(API_URL)
      .get(`/api/sequences/${sequenceId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('steps');
    expect(Array.isArray(res.body.steps)).toBe(true);
  });

  // Test 5.4: Update sequence name
  it('5.4 - should update sequence name', async () => {
    const res = await request(API_URL)
      .put(`/api/sequences/${sequenceId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Updated Test Sequence' });
    expect(res.status).toBe(200);
  });

  // Test 5.5: Activate sequence
  it('5.5 - should activate sequence', async () => {
    const res = await request(API_URL)
      .post(`/api/sequences/${sequenceId}/activate`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  // Test 5.6: Pause sequence
  it('5.6 - should pause sequence', async () => {
    const res = await request(API_URL)
      .post(`/api/sequences/${sequenceId}/pause`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  // Test 5.7: Enroll a lead
  it('5.7 - should enroll a lead', async () => {
    const res = await request(API_URL)
      .post(`/api/sequences/${sequenceId}/enroll`)
      .set('Authorization', `Bearer ${token}`)
      .send({ lead_ids: ['test-lead-001'] });
    expect(res.status).toBe(200);
  });

  // Test 5.8: List enrollments
  it('5.8 - should list enrollments with enrolled lead', async () => {
    const res = await request(API_URL)
      .get(`/api/sequences/${sequenceId}/enrollments`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  // Test 5.9: Unenroll lead
  it('5.9 - should unenroll lead', async () => {
    const res = await request(API_URL)
      .post(`/api/sequences/${sequenceId}/unenroll`)
      .set('Authorization', `Bearer ${token}`)
      .send({ lead_ids: ['test-lead-001'] });
    expect(res.status).toBe(200);
  });

  // Test 5.10: Delete sequence
  it('5.10 - should delete sequence', async () => {
    const res = await request(API_URL)
      .delete(`/api/sequences/${sequenceId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});
