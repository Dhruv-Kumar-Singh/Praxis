import { Router } from 'express';
import { sessionsController as c } from '../controllers/sessionsController.js';
import { reportsController as rc } from '../controllers/reportsController.js';
import { overridesController as oc } from '../controllers/overridesController.js';
import { auth, roleGuard } from '../middleware/auth.js';
import { reportService } from '../services/reportService.js';
import { sessionService } from '../services/sessionService.js';
import { generatePdfReport } from '../exports/pdfExport.js';
import { streamSessionsCsv } from '../exports/csvExport.js';
import { auditRepo } from '../repositories/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();
router.use(auth);

// ── Sessions CRUD ──────────────────────────────────────────────
router.post('/', c.validateCreate, c.create);
router.get('/', c.list);

// CSV Export (Must precede /:id)
router.get(
  '/export.csv',
  asyncHandler(async (req, res) => {
    const candidateId = req.user.role === 'candidate' ? req.user.sub : req.query.candidateId;
    const { items: sessions } = await sessionService.list({ candidateId, limit: 10000 });

    await auditRepo.create({
      action: 'session.export_csv',
      actorId: req.user.sub,
      targetId: null,
      ip: req.ip,
      metadata: { count: sessions.length },
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="praxis-sessions.csv"');
    streamSessionsCsv(sessions, res);
  })
);

router.get('/:id', c.getById);
router.patch('/:id', c.validateUpdate, c.update);
router.delete('/:id', roleGuard('admin'), c.delete);

// LiveKit & Realtime Interview Endpoints
router.post('/:id/start', c.start);
router.post('/:id/next-question', c.nextQuestion);
router.post('/:id/end', c.end);
router.get('/:id/transcript', c.getTranscript);
router.post('/:id/retry', c.retryEval);

// Interview Token Minting (legacy)
router.post('/:id/interview-token', roleGuard('candidate', 'interviewer', 'admin'), c.mintToken);

// Reports
router.get('/:id/report', rc.getReport);
router.post('/:id/report/generate', rc.generateReport);

// PDF Export
router.get(
  '/:id/report.pdf',
  asyncHandler(async (req, res) => {
    const session = await sessionService.getById(req.params.id, req.user);
    const report = await reportService.getBySessionId(req.params.id, req.user);

    await auditRepo.create({
      action: 'report.export_pdf',
      actorId: req.user.sub,
      targetId: req.params.id,
      ip: req.ip,
      metadata: { sessionId: req.params.id },
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="report-${req.params.id}.pdf"`);
    generatePdfReport(session, report, res);
  })
);

// Overrides
router.post('/:id/overrides', roleGuard('interviewer', 'admin'), oc.validateCreate, oc.create);
router.get('/:id/overrides', oc.list);

export default router;
