import { reportRepo, sessionRepo, chunkRepo, auditRepo } from '../repositories/index.js';
import { llmProvider } from '../providers/llm.js';
import { notificationService } from './notificationService.js';
import { Errors } from '../utils/errors.js';

export const reportService = {
  async getBySessionId(sessionId, user) {
    const session = await sessionRepo.findById(sessionId);
    if (!session) throw Errors.NOT_FOUND('Session');

    if (user.role === 'candidate' && session.candidateId !== user.sub) {
      throw Errors.FORBIDDEN();
    }

    const report = await reportRepo.findBySessionId(sessionId);
    if (!report) throw Errors.NOT_FOUND('Report');
    return report;
  },

  async generate(sessionId, user, ip) {
    const session = await sessionRepo.findById(sessionId);
    if (!session) throw Errors.NOT_FOUND('Session');

    if (user.role === 'candidate' && session.candidateId !== user.sub) {
      throw Errors.FORBIDDEN();
    }

    const chunks = await chunkRepo.listBySessionId(sessionId);
    const generated = await llmProvider.generateReport(chunks, session);

    let report = await reportRepo.findBySessionId(sessionId);
    if (report) {
      report = await reportRepo.update(report.id, {
        scores: generated.scores,
        strengths: generated.strengths,
        weaknesses: generated.weaknesses,
        summary: generated.summary,
        verdict: generated.verdict,
      });
    } else {
      report = await reportRepo.create({
        sessionId,
        scores: generated.scores,
        strengths: generated.strengths,
        weaknesses: generated.weaknesses,
        summary: generated.summary,
        verdict: generated.verdict,
      });
    }

    await auditRepo.create({
      action: 'report.generate',
      actorId: user.sub,
      targetId: report.id,
      ip,
      metadata: { sessionId, verdict: report.verdict },
    });

    await notificationService.notify({
      userId: session.candidateId,
      type: 'report_ready',
      payload: { sessionId, reportId: report.id, verdict: report.verdict },
    });

    return report;
  },
};

