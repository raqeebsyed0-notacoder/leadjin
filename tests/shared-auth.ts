import request from 'supertest';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const API_URL = 'http://localhost:3001';
const cachePath = resolve(__dirname, '.auth-cache.json');

export function getSharedToken(): string {
  const data = JSON.parse(readFileSync(cachePath, 'utf-8'));
  return data.token;
}

export function getSharedCredentials(): { email: string; password: string } {
  const data = JSON.parse(readFileSync(cachePath, 'utf-8'));
  return { email: data.email, password: data.password };
}

export function setSharedToken(token: string): void {
  const data = JSON.parse(readFileSync(cachePath, 'utf-8'));
  data.token = token;
  writeFileSync(cachePath, JSON.stringify(data));
}

/**
 * Register a unique user and return their token.
 * Use this only in auth tests that specifically need a fresh registration.
 */
export async function registerAndGetToken(): Promise<string> {
  const email = `test_${Date.now()}_${Math.random().toString(36).slice(2)}@leadjin-test.com`;
  const password = 'TestPassword123!';
  const res = await request(API_URL)
    .post('/api/auth/register')
    .send({ email, password });
  if (res.body.token) return res.body.token;
  const loginRes = await request(API_URL)
    .post('/api/auth/login')
    .send({ email, password });
  return loginRes.body.token || '';
}
