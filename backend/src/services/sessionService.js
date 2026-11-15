import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { sessionRepo, auditRepo } from '../repositories/index.js';
import { Errors } from '../utils/errors.js';

export const sessionService = {
  async create(data, userId, ip) {
    const session = await sessionRepo.create({ ...data, candidateId: userId });
    await auditRepo.create({ action: 'session.create', actorId: userId, targetId: session.id, ip, metadata: {} });
    return session;
  },

  async list(filters) {
    return sessionRepo.list(filters);
  },

  async getById(id, user) {
    const session = await sessionRepo.findById(id);
    if (!session) throw Errors.NOT_FOUND('Session');
    if (user.role === 'candidate' && session.candidateId !== user.sub) throw Errors.FORBIDDEN();
    return session;
  },

  async update(id, data, user, ip) {
    const session = await sessionRepo.findById(id);
    if (!session) throw Errors.NOT_FOUND('Session');
    if (user.role === 'candidate' && session.candidateId !== user.sub) throw Errors.FORBIDDEN();
    return sessionRepo.update(id, data);
  },

  async delete(id, user, ip) {
    const session = await sessionRepo.findById(id);
    if (!session) throw Errors.NOT_FOUND('Session');
    if (user.role !== 'admin') throw Errors.FORBIDDEN();
    await sessionRepo.delete(id);
    await auditRepo.create({ action: 'session.delete', actorId: user.sub, targetId: id, ip, metadata: {} });
  },

  /**
   * Mint a short-lived interview token scoped to one session.
   * NOT usable as a normal API access token (type: 'interview').
   */
  async mintInterviewToken(sessionId, user, ip) {
    const session = await sessionRepo.findById(sessionId);
    if (!session) throw Errors.NOT_FOUND('Session');
    if (user.role === 'candidate' && session.candidateId !== user.sub) throw Errors.FORBIDDEN();
    if (!['scheduled', 'in_progress'].includes(session.status)) {
      throw Errors.CONFLICT('Session not in a startable state');
    }
    const token = jwt.sign(
      { sub: user.sub, role: user.role, sessionId, type: 'interview' },
      env.JWT_SECRET,
      { expiresIn: env.JWT_INTERVIEW_EXPIRES }
    );
    await auditRepo.create({ action: 'token.mint', actorId: user.sub, targetId: sessionId, ip, metadata: {} });
    return { token, expiresIn: env.JWT_INTERVIEW_EXPIRES };
  },
};
