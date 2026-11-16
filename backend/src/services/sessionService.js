import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import { AccessToken } from 'livekit-server-sdk';
import { env } from '../config/env.js';
import { sessionRepo, auditRepo, chunkRepo } from '../repositories/index.js';
import { Errors } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export const sessionService = {
  async create(data, userId, ip) {
    const topic = data.topic || 'DSA';
    const difficulty = data.difficulty || 'medium';
    const expectedDurationMin = data.expectedDurationMin || 30;
    const role = data.role || 'Full-Stack Developer';

    let plan = [];
    try {
      const planRes = await fetch(`${env.ORCHESTRATOR_URL}/internal/sessions/plan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Secret': env.ORCHESTRATOR_INTERNAL_SECRET,
        },
        body: JSON.stringify({
          topic,
          difficulty,
          expected_duration_min: expectedDurationMin,
        }),
      });
      if (planRes.ok) {
        const body = await planRes.json();
        plan = body.plan || [];
      } else {
        logger.warn(`Orchestrator returned ${planRes.status} for plan generation`);
      }
    } catch (err) {
      logger.warn(`Failed to contact orchestrator for plan: ${err.message}`);
    }

    // Default plan if orchestrator is not yet booted or returned empty
    if (!plan.length) {
      plan = [
        {
          id: 'q1',
          question_text: `Let's start with a foundational ${topic} question. Can you walk me through your experience and an architectural challenge you solved?`,
          target_competencies: ['Communication', 'System Design'],
          difficulty,
          estimated_min: 5,
        },
        {
          id: 'q2',
          question_text: `Next, how would you optimize data access and handle high concurrency in this domain?`,
          target_competencies: ['Optimization', 'Technical Depth'],
          difficulty,
          estimated_min: 10,
        },
      ];
    }

    const sessionPayload = {
      ...data,
      topic,
      difficulty,
      expectedDurationMin,
      role,
      candidateId: userId,
      userId,
      status: data.status || 'scheduled',
      plan,
      modelId: 'gpt-6-luna',
      promptVersion: '1.0.0',
      rubricVersion: '1.0.0',
    };

    const session = await sessionRepo.create(sessionPayload);
    await auditRepo.create({
      action: 'session.create',
      actorId: userId,
      targetId: session.id,
      ip,
      metadata: { topic, difficulty, planCount: plan.length },
    });
    return session;
  },

  async list(filters) {
    return sessionRepo.list(filters);
  },

  async getById(id, user) {
    const session = await sessionRepo.findById(id);
    if (!session) throw Errors.NOT_FOUND('Session');
    if (user.role === 'candidate' && session.candidateId !== user.sub && session.userId !== user.sub) {
      throw Errors.FORBIDDEN();
    }
    return session;
  },

  async update(id, data, user, ip) {
    const session = await sessionRepo.findById(id);
    if (!session) throw Errors.NOT_FOUND('Session');
    if (user.role === 'candidate' && session.candidateId !== user.sub && session.userId !== user.sub) {
      throw Errors.FORBIDDEN();
    }
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
   * Start a session and mint a LiveKit participant token.
   */
  async startSession(sessionId, user, ip) {
    const session = await sessionRepo.findById(sessionId);
    if (!session) throw Errors.NOT_FOUND('Session');
    if (user.role === 'candidate' && session.candidateId !== user.sub && session.userId !== user.sub) {
      throw Errors.FORBIDDEN();
    }
    if (!['draft', 'scheduled', 'in_progress'].includes(session.status)) {
      throw Errors.CONFLICT(`Session cannot be started from status '${session.status}'`);
    }

    const roomName = `interview-${sessionId}`;
    const at = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
      identity: user.sub,
      name: user.name || (user.role === 'candidate' ? 'Candidate' : 'Interviewer'),
      ttl: '2h',
      metadata: JSON.stringify({
        sessionId,
        role: user.role,
        topic: session.topic,
        difficulty: session.difficulty,
      }),
    });

    at.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    const participantToken = await at.toJwt();

    const updated = await sessionRepo.update(sessionId, {
      status: 'in_progress',
      startedAt: session.startedAt || new Date(),
    });

    await auditRepo.create({
      action: 'session.start',
      actorId: user.sub,
      targetId: sessionId,
      ip,
      metadata: { roomName, status: updated.status },
    });

    return {
      serverUrl: env.LIVEKIT_URL,
      participantToken,
      roomName,
      sessionId,
      session: updated,
    };
  },

  /**
   * Get the chronological interview transcript chunks.
   */
  async getTranscript(sessionId, user) {
    const session = await sessionRepo.findById(sessionId);
    if (!session) throw Errors.NOT_FOUND('Session');
    if (user.role === 'candidate' && session.candidateId !== user.sub && session.userId !== user.sub) {
      throw Errors.FORBIDDEN();
    }
    return chunkRepo.listBySessionId(sessionId);
  },

  /**
   * Request adaptive next question from OpenAI LLM via orchestrator.
   */
  async generateNextQuestion(sessionId, data, user, ip) {
    const session = await sessionRepo.findById(sessionId);
    if (!session) throw Errors.NOT_FOUND('Session');
    if (user.role === 'candidate' && session.candidateId !== user.sub && session.userId !== user.sub) {
      throw Errors.FORBIDDEN();
    }

    try {
      const res = await fetch(`${env.ORCHESTRATOR_URL}/internal/sessions/${sessionId}/next-question`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Secret': env.ORCHESTRATOR_INTERNAL_SECRET,
        },
        body: JSON.stringify({
          sessionId,
          topic: session.topic || data.topic || 'DSA',
          difficulty: session.difficulty || data.difficulty || 'medium',
          previousQuestion: data.previousQuestion || '',
          candidateAnswer: data.candidateAnswer || '',
          history: data.history || [],
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Orchestrator returned ${res.status}: ${errorText}`);
      }

      const body = await res.json();
      await auditRepo.create({
        action: 'session.next_question',
        actorId: user.sub,
        targetId: sessionId,
        ip,
        metadata: { title: body.title, intent: body.intent },
      });
      return body;
    } catch (err) {
      logger.error(`generateNextQuestion error: ${err.message}`);
      throw Errors.INTERNAL(`Failed to generate next question: ${err.message}`);
    }
  },

  /**
   * Request retry of evaluation from the AI orchestrator.
   */
  async retryEval(sessionId, user, ip) {
    const session = await sessionRepo.findById(sessionId);
    if (!session) throw Errors.NOT_FOUND('Session');
    if (user.role === 'candidate' && session.candidateId !== user.sub && session.userId !== user.sub) {
      throw Errors.FORBIDDEN();
    }

    try {
      const res = await fetch(`${env.ORCHESTRATOR_URL}/internal/sessions/${sessionId}/retry-eval`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Secret': env.ORCHESTRATOR_INTERNAL_SECRET,
        },
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Orchestrator returned ${res.status}: ${errorText}`);
      }

      const body = await res.json();
      await auditRepo.create({
        action: 'session.retry_eval',
        actorId: user.sub,
        targetId: sessionId,
        ip,
        metadata: body,
      });
      return body;
    } catch (err) {
      logger.error(`retryEval error: ${err.message}`);
      throw Errors.INTERNAL(`Failed to retry evaluation: ${err.message}`);
    }
  },

  /**
   * Mint a short-lived interview token scoped to one session (legacy auth token).
   */
  async mintInterviewToken(sessionId, user, ip) {
    const session = await sessionRepo.findById(sessionId);
    if (!session) throw Errors.NOT_FOUND('Session');
    if (user.role === 'candidate' && session.candidateId !== user.sub && session.userId !== user.sub) {
      throw Errors.FORBIDDEN();
    }
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
