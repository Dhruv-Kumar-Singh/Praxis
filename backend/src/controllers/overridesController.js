import { z } from 'zod';
import { overrideService } from '../services/overrideService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validate } from '../middleware/validate.js';

const createOverrideSchema = z.object({
  field: z.string().min(1),
  newValue: z.union([z.string(), z.number()]),
  reason: z.string().min(3, 'A descriptive reason of at least 3 characters is required'),
});

export const overridesController = {
  validateCreate: validate(createOverrideSchema),

  create: asyncHandler(async (req, res) => {
    const override = await overrideService.create(
      {
        sessionId: req.params.id,
        field: req.body.field,
        newValue: req.body.newValue,
        reason: req.body.reason,
      },
      req.user,
      req.ip
    );
    res.status(201).json(override);
  }),

  list: asyncHandler(async (req, res) => {
    const overrides = await overrideService.list(req.params.id, req.user);
    res.json(overrides);
  }),
};

