import { z } from 'zod';
import { sessionService } from '../services/sessionService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validate } from '../middleware/validate.js';

const createSchema = z.object({
  role: z.string().optional().default('Full-Stack Developer'),
  topic: z.string().min(1),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional().default('medium'),
  expectedDurationMin: z.number().int().positive().optional().default(30),
  status: z.enum(['draft', 'scheduled', 'in_progress', 'completed', 'cancelled']).default('scheduled'),
  config: z.record(z.unknown()).optional(),
});

const updateSchema = z.object({
  role: z.string().optional(),
  topic: z.string().optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
  expectedDurationMin: z.number().int().positive().optional(),
  status: z.enum([
    'draft',
    'scheduled',
    'in_progress',
    'processing',
    'feedback_ready',
    'processing_failed',
    'completed',
    'failed',
    'cancelled',
    'abandoned',
  ]).optional(),
  config: z.record(z.unknown()).optional(),
}).refine(d => Object.keys(d).length > 0, { message: 'At least one field required' });

export const sessionsController = {
  validateCreate: validate(createSchema),
  validateUpdate: validate(updateSchema),

  create: asyncHandler(async (req, res) => {
    const session = await sessionService.create(req.body, req.user.sub, req.ip);
    res.status(201).json(session);
  }),

  list: asyncHandler(async (req, res) => {
    const { page, limit, status } = req.query;
    const candidateId = req.user.role === 'candidate' ? req.user.sub : req.query.candidateId;
    const result = await sessionService.list({ candidateId, status, page: Number(page) || 1, limit: Number(limit) || 20 });
    res.json(result);
  }),

  getById: asyncHandler(async (req, res) => {
    const session = await sessionService.getById(req.params.id, req.user);
    res.json(session);
  }),

  update: asyncHandler(async (req, res) => {
    const session = await sessionService.update(req.params.id, req.body, req.user, req.ip);
    res.json(session);
  }),

  delete: asyncHandler(async (req, res) => {
    await sessionService.delete(req.params.id, req.user, req.ip);
    res.status(204).end();
  }),

  start: asyncHandler(async (req, res) => {
    const result = await sessionService.startSession(req.params.id, req.user, req.ip);
    res.json(result);
  }),

  nextQuestion: asyncHandler(async (req, res) => {
    const result = await sessionService.generateNextQuestion(req.params.id, req.body, req.user, req.ip);
    res.json(result);
  }),

  end: asyncHandler(async (req, res) => {
    const result = await sessionService.endSession(req.params.id, req.body, req.user, req.ip);
    res.json(result);
  }),

  getTranscript: asyncHandler(async (req, res) => {
    const chunks = await sessionService.getTranscript(req.params.id, req.user);
    res.json(chunks);
  }),

  retryEval: asyncHandler(async (req, res) => {
    const result = await sessionService.retryEval(req.params.id, req.user, req.ip);
    res.json(result);
  }),

  mintToken: asyncHandler(async (req, res) => {
    const result = await sessionService.mintInterviewToken(req.params.id, req.user, req.ip);
    res.json(result);
  }),
};
