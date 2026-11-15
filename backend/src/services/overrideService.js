import { overrideRepo, reportRepo, sessionRepo, auditRepo } from '../repositories/index.js';
import { notificationService } from './notificationService.js';
import { Errors } from '../utils/errors.js';

export const overrideService = {
  async create({ sessionId, field, newValue, reason }, user, ip) {
    if (!reason || !reason.trim()) {
      throw Errors.VALIDATION({ reason: ['Mandatory reason is required for override'] });
    }

    const session = await sessionRepo.findById(sessionId);
    if (!session) throw Errors.NOT_FOUND('Session');

    const report = await reportRepo.findBySessionId(sessionId);
    if (!report) throw Errors.NOT_FOUND('Report');

    // Retrieve original value
    let originalValue;
    if (field === 'verdict') {
      originalValue = report.verdict;
    } else if (report.scores && field in report.scores) {
      originalValue = report.scores[field];
    } else if (field === 'overall') {
      originalValue = report.scores?.overall;
    } else {
      originalValue = null;
    }

    // Original report is PRESERVED, never overwritten.
    // The override is recorded in overrideRepo.
    const override = await overrideRepo.create({
      sessionId,
      field,
      originalValue,
      newValue,
      reason,
      authorId: user.sub,
    });

    await auditRepo.create({
      action: 'report.override',
      actorId: user.sub,
      targetId: override.id,
      ip,
      metadata: { sessionId, field, originalValue, newValue, reason },
    });

    await notificationService.notify({
      userId: session.candidateId,
      type: 'report_overridden',
      payload: { sessionId, overrideId: override.id, field, newValue },
    });

    return override;
  },

  async list(sessionId, user) {
    const session = await sessionRepo.findById(sessionId);
    if (!session) throw Errors.NOT_FOUND('Session');

    if (user.role === 'candidate' && session.candidateId !== user.sub) {
      throw Errors.FORBIDDEN();
    }

    return overrideRepo.listBySessionId(sessionId);
  },
};

