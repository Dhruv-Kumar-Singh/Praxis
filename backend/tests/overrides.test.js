import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { userRepo, sessionRepo, reportRepo, __resetStore } from '../src/repositories/index.js';
import jwt from 'jsonwebtoken';
import { env } from '../src/config/env.js';

describe('Overrides & Original Value Preservation', () => {
  let interviewerToken;
  let candidateToken;
  let session;
  let report;

  beforeEach(async () => {
    __resetStore();

    const candidate = await userRepo.create({
      email: 'cand@test.com',
      passwordHash: 'hash',
      role: 'candidate',
      name: 'Candidate',
    });
    candidateToken = jwt.sign(
      { sub: candidate.id, email: candidate.email, role: 'candidate', type: 'access' },
      env.JWT_SECRET
    );

    const interviewer = await userRepo.create({
      email: 'interviewer@test.com',
      passwordHash: 'hash',
      role: 'interviewer',
      name: 'Interviewer',
    });
    interviewerToken = jwt.sign(
      { sub: interviewer.id, email: interviewer.email, role: 'interviewer', type: 'access' },
      env.JWT_SECRET
    );

    session = await sessionRepo.create({
      candidateId: candidate.id,
      role: 'Staff Engineer',
      topic: 'Distributed Transactions',
      status: 'completed',
    });

    report = await reportRepo.create({
      sessionId: session.id,
      scores: { overall: 85, systemDesign: 84 },
      strengths: ['Great communication'],
      weaknesses: ['Minor edge case'],
      summary: 'Solid performance',
      verdict: 'Hire',
    });
  });

  it('allows interviewer to submit an override with a mandatory reason', async () => {
    const res = await request(app)
      .post(`/api/v1/sessions/${session.id}/overrides`)
      .set('Authorization', `Bearer ${interviewerToken}`)
      .send({
        field: 'verdict',
        newValue: 'Strong Hire',
        reason: 'Candidate provided excellent distributed locking mitigation in follow-up discussion.',
      });

    expect(res.status).toBe(201);
    expect(res.body.field).toBe('verdict');
    expect(res.body.originalValue).toBe('Hire');
    expect(res.body.newValue).toBe('Strong Hire');
    expect(res.body.reason).toContain('distributed locking');

    // CRITICAL REQUIREMENT: Verify original report is PRESERVED, never overwritten
    const checkReport = await reportRepo.findBySessionId(session.id);
    expect(checkReport.verdict).toBe('Hire'); // Unchanged!
    expect(checkReport.scores.overall).toBe(85); // Unchanged!
  });

  it('requires a reason when creating an override', async () => {
    const res = await request(app)
      .post(`/api/v1/sessions/${session.id}/overrides`)
      .set('Authorization', `Bearer ${interviewerToken}`)
      .send({
        field: 'verdict',
        newValue: 'Strong Hire',
        reason: '',
      });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('forbids candidate from submitting overrides', async () => {
    const res = await request(app)
      .post(`/api/v1/sessions/${session.id}/overrides`)
      .set('Authorization', `Bearer ${candidateToken}`)
      .send({
        field: 'verdict',
        newValue: 'Strong Hire',
        reason: 'I think I did better',
      });

    expect(res.status).toBe(403);
  });
});

