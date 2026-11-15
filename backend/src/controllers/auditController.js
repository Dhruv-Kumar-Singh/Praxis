import { auditRepo } from '../repositories/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const auditController = {
  list: asyncHandler(async (req, res) => {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const { actorId, action } = req.query;

    const result = await auditRepo.list({
      page,
      limit,
      actorId,
      action,
    });
    res.json(result);
  }),
};

