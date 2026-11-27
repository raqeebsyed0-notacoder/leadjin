import request from 'supertest';
import { writeFileSync } from 'fs';
import { resolve } from 'path';

const API_URL = process.env.API_URL || 'http://localhost:3001';
const ISOLATED = Boolean(process.env.API_URL);

export default async function setup() {
  if (ISOLATED) {
    // Start the throwaway LeadJin service with its own database (test-gate1.db)
    // on its own port so the acceptance tests never touch the live runtime DB.
    const { spawn } = await import('child_process');
    const { setTimeout: sleep } = await import('timers/promises');
    const SERVER_PATH = resolve(__dirname, '../server.ts');
    const PORT = new URL(API_URL).port;
    const dbPath = resolve(__dirname, '../data/test-gate1.db');
    const proc = spawn('npx', ['tsx', SERVER_PATH], {
      env: { ...process.env, DATABASE_PATH: dbPath, PORT, NODE_ENV: 'production' },
      stdio: 'ignore',
      detached: true,
    });
    // Wait for the throwaway service to accept connections.
    for (let i = 0; i < 80; i += 1) {
      try {
        const res = await fetch(`http://localhost:${PORT}/api/health`);
        if (res.ok) break;
      } catch {
        /* not ready yet */
      }
      await sleep(250);
    }
  }
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
