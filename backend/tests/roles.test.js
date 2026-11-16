import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { userRepo, __resetStore } from '../src/repositories/index.js';
import jwt from 'jsonwebtoken';
import { env } from '../src/config/env.js';

describe('Role Guards & User Management', () => {
  let adminToken;
  let candidateToken;
  let candidateUser;

  beforeEach(async () => {
    await __resetStore();

    // Create an admin
    const admin = await userRepo.create({
      email: 'admin@praxis.internal',
      passwordHash: 'hash',
      role: 'admin',
      name: 'System Admin',
    });
    adminToken = jwt.sign(
      { sub: admin.id, email: admin.email, role: 'admin', type: 'access' },
      env.JWT_SECRET
    );

    // Create a candidate
    candidateUser = await userRepo.create({
      email: 'candidate@praxis.internal',
      passwordHash: 'hash',
      role: 'candidate',
      name: 'Test Candidate',
    });
    candidateToken = jwt.sign(
      { sub: candidateUser.id, email: candidateUser.email, role: 'candidate', type: 'access' },
      env.JWT_SECRET
    );
  });

  it('allows admin to list users', async () => {
    const res = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
  });

  it('forbids candidate from listing users', async () => {
    const res = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${candidateToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('forbids candidate from escalating their own role', async () => {
    const res = await request(app)
      .patch(`/api/v1/users/${candidateUser.id}`)
      .set('Authorization', `Bearer ${candidateToken}`)
      .send({ role: 'admin' });

    expect(res.status).toBe(403);
  });

  it('allows admin to change user role', async () => {
    const res = await request(app)
      .patch(`/api/v1/users/${candidateUser.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'interviewer' });

    expect(res.status).toBe(200);
    expect(res.body.role).toBe('interviewer');
  });
});

