import request from 'supertest';
import { writeFileSync } from 'fs';
import { resolve } from 'path';

const API_URL = 'http://localhost:3001';

export default async function setup() {
  const email = `test_${Date.now()}_${Math.random().toString(36).slice(2)}@leadjin-test.com`;
  const password = 'TestPassword123!';

  const res = await request(API_URL)
    .post('/api/auth/register')
    .send({ email, password });

  let token = res.body.token;
  if (!token) {
    const loginRes = await request(API_URL)
      .post('/api/auth/login')
      .send({ email, password });
    token = loginRes.body.token;
  }

  const cachePath = resolve(__dirname, '.auth-cache.json');
  writeFileSync(cachePath, JSON.stringify({ email, password, token }));
}
