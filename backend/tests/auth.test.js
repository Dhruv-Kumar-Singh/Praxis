import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { __resetStore } from '../src/repositories/index.js';

describe('Auth API (/api/v1/auth)', () => {
  beforeEach(() => {
    __resetStore();
  });

  it('registers a new candidate', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'alex@example.com',
        password: 'Password123!',
        name: 'Alex Mercer',
        role: 'candidate',
      });

    expect(res.status).toBe(201);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe('alex@example.com');
    expect(res.body.user.passwordHash).toBeUndefined(); // Never leak password hash
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
  });

  it('rejects duplicate email registrations', async () => {
    await request(app).post('/api/v1/auth/register').send({
      email: 'duplicate@example.com',
      password: 'Password123!',
      name: 'User One',
    });

    const res = await request(app).post('/api/v1/auth/register').send({
      email: 'duplicate@example.com',
      password: 'Password123!',
      name: 'User Two',
    });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('authenticates user and returns tokens on valid login', async () => {
    await request(app).post('/api/v1/auth/register').send({
      email: 'login@example.com',
      password: 'CorrectPassword!',
      name: 'Login User',
    });

    const res = await request(app).post('/api/v1/auth/login').send({
      email: 'login@example.com',
      password: 'CorrectPassword!',
    });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
  });

  it('rejects login with invalid password', async () => {
    await request(app).post('/api/v1/auth/register').send({
      email: 'wrongpass@example.com',
      password: 'RightPassword!',
      name: 'Wrong Pass User',
    });

    const res = await request(app).post('/api/v1/auth/login').send({
      email: 'wrongpass@example.com',
      password: 'IncorrectPassword',
    });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('refreshes token with valid refresh token', async () => {
    const regRes = await request(app).post('/api/v1/auth/register').send({
      email: 'refresh@example.com',
      password: 'Password123!',
      name: 'Refresh User',
    });

    const refreshRes = await request(app).post('/api/v1/auth/refresh').send({
      refreshToken: regRes.body.refreshToken,
    });

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.accessToken).toBeDefined();
    expect(refreshRes.body.refreshToken).toBeDefined();
    expect(refreshRes.body.refreshToken).not.toBe(regRes.body.refreshToken); // Rotated
  });

  it('returns current authenticated user on /auth/me', async () => {
    const regRes = await request(app).post('/api/v1/auth/register').send({
      email: 'me@example.com',
      password: 'Password123!',
      name: 'Me User',
    });

    const meRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${regRes.body.accessToken}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.email).toBe('me@example.com');
  });
});

