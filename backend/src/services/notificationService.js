import { notificationRepo } from '../repositories/index.js';
import { logger } from '../utils/logger.js';

export const notificationService = {
  /**
   * Dispatches a notification to a user.
   * @param {{ userId: string, type: string, payload: object }} data
   */
  async notify({ userId, type, payload }) {
    try {
      const notif = await notificationRepo.create({
        userId,
        type,
        payload,
      });
      logger.info({ userId, type, notifId: notif.id }, 'Notification created');
      return notif;
    } catch (err) {
      logger.error({ err, userId, type }, 'Failed to create notification');
    }
  },

  async list(userId, opts) {
    return notificationRepo.listByUserId(userId, opts);
  },

  async markRead(id, userId) {
    return notificationRepo.markRead(id, userId);
  },
};

