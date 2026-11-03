import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { getSharedToken } from './shared-auth';

const API_URL = 'http://localhost:3001';

const testCsvContent = `name,company,email,title
Ahmed Al-Rashid,Saudi Telecom,ahmed@stc.com,VP Sales
Fatima Hassan,Aramco Digital,fatima@aramcodigital.com,Director`;

describe('CSV Upload Tests', () => {
  let token: string;

  beforeAll(async () => {
    token = getSharedToken();
  });

  // Test 9.1: Upload without file
  it('9.1 - should reject upload without file', async () => {
    const res = await request(API_URL)
      .post('/api/leads/upload-csv')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  // Test 9.2: Upload valid CSV
  it('9.2 - should upload valid CSV and return parsed data', async () => {
    const res = await request(API_URL)
      .post('/api/leads/upload-csv')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from(testCsvContent), 'test.csv');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('parsed');
    expect(res.body).toHaveProperty('columns');
    expect(res.body).toHaveProperty('uploadId');
  });

  // Test 9.3: Confirm upload
  it('9.3 - should confirm upload and return import stats', async () => {
    // First upload to get a fresh uploadId
    const uploadRes = await request(API_URL)
      .post('/api/leads/upload-csv')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from(testCsvContent), 'test.csv');

    expect(uploadRes.status).toBe(200);
    const freshUploadId = uploadRes.body.uploadId;

    const res = await request(API_URL)
      .post('/api/leads/upload-csv/confirm')
      .set('Authorization', `Bearer ${token}`)
      .send({ uploadId: freshUploadId });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('imported');
    expect(res.body).toHaveProperty('enriched');
    expect(res.body).toHaveProperty('failed');
  });

  // Test 9.4: Confirm with invalid uploadId
  it('9.4 - should reject confirm with invalid uploadId', async () => {
    const res = await request(API_URL)
      .post('/api/leads/upload-csv/confirm')
      .set('Authorization', `Bearer ${token}`)
      .send({ uploadId: 'invalid-upload-id-12345' });

    expect([400, 404]).toContain(res.status);
  });
});
