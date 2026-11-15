import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { userRepo, sessionRepo, __resetStore } from '../src/repositories/index.js';
import jwt from 'jsonwebtoken';
import { env } from '../src/config/env.js';

describe('Sessions & Token Minting API', () => {
  let candidateUser;
  let candidateToken;
  let otherUser;
  let otherToken;

  beforeEach(async () => {
    __resetStore();

    candidateUser = await userRepo.create({
      email: 'cand@test.com',
      passwordHash: 'hash',
      role: 'candidate',
      name: 'Candidate User',
    });
    candidateToken = jwt.sign(
      { sub: candidateUser.id, email: candidateUser.email, role: 'candidate', type: 'access' },
      env.JWT_SECRET
    );

    otherUser = await userRepo.create({
      email: 'other@test.com',
      passwordHash: 'hash',
      role: 'candidate',
      name: 'Other Candidate',
    });
    otherToken = jwt.sign(
      { sub: otherUser.id, email: otherUser.email, role: 'candidate', type: 'access' },
      env.JWT_SECRET
    );
  });

  it('creates a new interview session', async () => {
    const res = await request(app)
      .post('/api/v1/sessions')
      .set('Authorization', `Bearer ${candidateToken}`)
      .send({
        role: 'Distributed Systems Engineer',
        topic: 'Raft Consensus',
        config: { seniority: 'Senior' },
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.candidateId).toBe(candidateUser.id);
    expect(res.body.status).toBe('scheduled');
  });

  it('mints an interview-scoped token', async () => {
    const session = await sessionRepo.create({
      candidateId: candidateUser.id,
      role: 'Backend Engineer',
      topic: 'API Design',
    });

    const res = await request(app)
      .post(`/api/v1/sessions/${session.id}/interview-token`)
      .set('Authorization', `Bearer ${candidateToken}`);

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();

    const decoded = jwt.verify(res.body.token, env.JWT_SECRET);
    expect(decoded.type).toBe('interview');
    expect(decoded.sessionId).toBe(session.id);
    expect(decoded.sub).toBe(candidateUser.id);
  });

  it('ensures interview tokens cannot be used as standard API tokens', async () => {
    const session = await sessionRepo.create({
      candidateId: candidateUser.id,
      role: 'Backend Engineer',
      topic: 'API Design',
    });

    const mintRes = await request(app)
      .post(`/api/v1/sessions/${session.id}/interview-token`)
      .set('Authorization', `Bearer ${candidateToken}`);

    const interviewToken = mintRes.body.token;

    // Attempt to use interviewToken on a normal API endpoint requiring access token
    const testRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${interviewToken}`);

    expect(testRes.status).toBe(401);
    expect(testRes.body.error.code).toBe('UNAUTHORIZED');
  });

  it('forbids candidates from minting tokens for other candidates sessions', async () => {
    const session = await sessionRepo.create({
      candidateId: candidateUser.id,
      role: 'Backend Engineer',
      topic: 'API Design',
    });

    const res = await request(app)
      .post(`/api/v1/sessions/${session.id}/interview-token`)
      .set('Authorization', `Bearer ${otherToken}`);

    expect(res.status).toBe(403);
  });
});

