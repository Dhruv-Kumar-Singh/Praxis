import { z } from 'zod';
import { userRepo, auditRepo } from '../repositories/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validate } from '../middleware/validate.js';
import { Errors } from '../utils/errors.js';

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.enum(['candidate', 'interviewer', 'admin']).optional(),
}).refine(d => Object.keys(d).length > 0, { message: 'At least one field required' });

export const usersController = {
  validateUpdate: validate(updateSchema),

  list: asyncHandler(async (req, res) => {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const result = await userRepo.list({ page, limit });
    res.json(result);
  }),

  getById: asyncHandler(async (req, res) => {
    const user = await userRepo.findById(req.params.id);
    if (!user) throw Errors.NOT_FOUND('User');
    if (req.user.role !== 'admin' && req.user.sub !== req.params.id) throw Errors.FORBIDDEN();
    const { passwordHash: _, ...safe } = user;
    res.json(safe);
  }),

  update: asyncHandler(async (req, res) => {
    const user = await userRepo.findById(req.params.id);
    if (!user) throw Errors.NOT_FOUND('User');
    if (req.user.role !== 'admin' && req.user.sub !== req.params.id) throw Errors.FORBIDDEN();
    if (req.body.role && req.user.role !== 'admin') throw Errors.FORBIDDEN();
    const updated = await userRepo.update(req.params.id, req.body);
    if (req.body.role) {
      await auditRepo.create({ action: 'user.role_change', actorId: req.user.sub, targetId: req.params.id, ip: req.ip, metadata: { newRole: req.body.role } });
    }
    const { passwordHash: _, ...safe } = updated;
    res.json(safe);
  }),
};
