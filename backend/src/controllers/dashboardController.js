import { dashboardService } from '../services/dashboardService.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const dashboardController = {
  summary: asyncHandler(async (req, res) => {
    const summary = await dashboardService.getSummary(req.user);
    res.json(summary);
  }),
};

