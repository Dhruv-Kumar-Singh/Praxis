import { reportService } from '../services/reportService.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const reportsController = {
  getReport: asyncHandler(async (req, res) => {
    const report = await reportService.getBySessionId(req.params.id, req.user);
    res.json(report);
  }),

  generateReport: asyncHandler(async (req, res) => {
    const report = await reportService.generate(req.params.id, req.user, req.ip);
    res.status(201).json(report);
  }),
};

