import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { getSharedToken } from './shared-auth';

const API_URL = 'http://localhost:3001';

describe('WhatsApp Sequences API Tests', () => {
  let token: string;
  let sequenceId: string;

  beforeAll(async () => {
    token = getSharedToken();
  });

  // Test 7.1: List WA sequences
  it('7.1 - should list WA sequences', async () => {
    const res = await request(API_URL)
      .get('/api/wa-sequences')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  // Test 7.2: Create WA sequence (first step must be template)
  it('7.2 - should create WA sequence with template first step', async () => {
    const res = await request(API_URL)
      .post('/api/wa-sequences')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Test WA Sequence',
        steps: [
          { step: 1, type: 'template', templateName: 'test_intro', params: ['{{name}}'], delay_hours: 0 },
          { step: 2, type: 'text', message: 'Hi {{name}}, following up', delay_hours: 24 }
        ]
      });
    expect([200, 201]).toContain(res.status);
    expect(res.body).toHaveProperty('id');
    sequenceId = String(res.body.id);
  });

  // Test 7.3: Create WA sequence with text first step (should fail)
  it('7.3 - should reject WA sequence with text first step', async () => {
    const res = await request(API_URL)
      .post('/api/wa-sequences')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Invalid WA Sequence',
        steps: [
          { step: 1, type: 'text', message: 'Hi {{name}}', delay_hours: 0 }
        ]
      });
    expect(res.status).toBe(400);
  });

  // Test 7.4: Get WA sequence
  it('7.4 - should get WA sequence', async () => {
    const res = await request(API_URL)
      .get(`/api/wa-sequences/${sequenceId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  // Test 7.5: Delete WA sequence
  it('7.5 - should delete WA sequence', async () => {
    const res = await request(API_URL)
      .delete(`/api/wa-sequences/${sequenceId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});
