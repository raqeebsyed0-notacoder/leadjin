import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { getSharedCredentials, setSharedToken } from './shared-auth';

const API_URL = 'http://localhost:3001';

const testEmail = `auth_${Date.now()}_${Math.random().toString(36).slice(2)}@leadjin-test.com`;
const testPassword = 'TestPassword123!';
let authToken = '';

describe('Auth API Tests', () => {
  // Test 1.1: Register with valid email/password
  it('1.1 - should register with valid email/password', async () => {
    const res = await request(API_URL)
      .post('/api/auth/register')
      .send({ email: testEmail, password: testPassword });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('user');
    expect(res.body.user).toHaveProperty('id');
    expect(res.body.user).toHaveProperty('email', testEmail);
  });

  // Test 1.2: Register with duplicate email
  it('1.2 - should reject duplicate email registration', async () => {
    const res = await request(API_URL)
      .post('/api/auth/register')
      .send({ email: testEmail, password: testPassword });

    expect([400, 409]).toContain(res.status);
  });

  // Test 1.3: Register with empty email
  it('1.3 - should reject registration with empty email', async () => {
    const res = await request(API_URL)
      .post('/api/auth/register')
      .send({ email: '', password: testPassword });

    expect(res.status).toBe(400);
  });

  // Test 1.4: Register with empty password
  it('1.4 - should reject registration with empty password', async () => {
    const uniqueEmail = `test_${Date.now()}_${Math.random().toString(36).slice(2)}@leadjin-test.com`;
    const res = await request(API_URL)
      .post('/api/auth/register')
      .send({ email: uniqueEmail, password: '' });

    expect(res.status).toBe(400);
  });

  // Test 1.5: Login with valid credentials
  it('1.5 - should login with valid credentials and return token', async () => {
    const creds = getSharedCredentials();
    const res = await request(API_URL)
      .post('/api/auth/login')
      .send({ email: creds.email, password: creds.password });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    authToken = res.body.token;
    setSharedToken(authToken);
  });

  // Test 1.6: Login with wrong password
  it('1.6 - should reject login with wrong password', async () => {
    const creds = getSharedCredentials();
    const res = await request(API_URL)
      .post('/api/auth/login')
      .send({ email: creds.email, password: 'WrongPassword123!' });

    expect(res.status).toBe(401);
  });

  // Test 1.7: Login with nonexistent email
  it('1.7 - should reject login with nonexistent email', async () => {
    const res = await request(API_URL)
      .post('/api/auth/login')
      .send({ email: 'nonexistent@fake.com', password: testPassword });

    expect(res.status).toBe(401);
  });

  // Test 1.8: Get /api/auth/me without token
  it('1.8 - should reject /api/auth/me without token', async () => {
    const res = await request(API_URL)
      .get('/api/auth/me');

    expect(res.status).toBe(401);
  });

  // Test 1.9: Get /api/auth/me with valid token
  it('1.9 - should return user with valid token', async () => {
    const res = await request(API_URL)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('user');
    expect(res.body.user).toHaveProperty('id');
    expect(res.body.user).toHaveProperty('email');
  });

  // Test 1.10: Email case normalization
  it('1.10 - should normalize email case for login', async () => {
    // Register with uppercase email
    const upperEmail = `UPPER_${Date.now()}_${Math.random().toString(36).slice(2)}@test.com`;
    const lowerEmail = upperEmail.toLowerCase();

    await request(API_URL)
      .post('/api/auth/register')
      .send({ email: upperEmail, password: testPassword });

    // Login with lowercase email
    const res = await request(API_URL)
      .post('/api/auth/login')
      .send({ email: lowerEmail, password: testPassword });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
  });
});
