import { notificationService } from '../services/notificationService.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const notificationsController = {
  list: asyncHandler(async (req, res) => {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const result = await notificationService.list(req.user.sub, { page, limit });
    res.json(result);
  }),

  markRead: asyncHandler(async (req, res) => {
    const updated = await notificationService.markRead(req.params.id, req.user.sub);
    res.json(updated);
  }),
};

