/**
 * @collection notifications
 * Outbox-pattern table for delivering notifications (email, push, webhook).
 * Workers poll for documents where status is 'pending' and nextAttemptAt <= now.
 *
 * Key fields:
 *   userId         - Recipient user (ref: users)
 *   type           - Notification type, e.g. 'report_ready', 'session_failed'
 *   payload        - Type-specific data (email body, push payload, etc.)
 *   status         - 'pending' | 'delivered' | 'failed'
 *   attempts       - Number of delivery attempts so far
 *   nextAttemptAt  - Earliest time the worker should retry (exponential backoff)
 *
 * Indexes:
 *   { status, nextAttemptAt } - Outbox worker polling query
 */

import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const notificationSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    type: {
      type: String,
      required: true,
      trim: true,
      // Examples: 'report_ready', 'session_failed', 'override_applied'
    },
    payload: {
      type: Schema.Types.Mixed,
      required: true,
      // Shape depends on `type`; validated at the application layer.
    },
    status: {
      type: String,
      enum: ['pending', 'delivered', 'failed'],
      default: 'pending',
      required: true,
    },
    attempts: {
      type: Number,
      default: 0,
      min: 0,
    },
    nextAttemptAt: {
      type: Date,
      default: Date.now, // Immediately eligible for first attempt
    },
  },
  {
    collection: 'notifications',
    timestamps: true,
  }
);

// ── Indexes ───────────────────────────────────────────────────────────────────

// Outbox worker query: find pending notifications whose next attempt time has passed.
notificationSchema.index({ status: 1, nextAttemptAt: 1 });

const Notification = model('Notification', notificationSchema);
export default Notification;
