/**
 * @collection overrides
 * Append-only audit trail of human reviewer score / field overrides.
 */

import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const overrideSchema = new Schema(
  {
    sessionId: {
      type: Schema.Types.Mixed,
      required: true,
    },
    evaluationId: {
      type: Schema.Types.Mixed,
      default: null,
    },
    reviewerId: {
      type: Schema.Types.Mixed,
      default: null,
    },
    field: {
      type: String,
      default: null,
    },
    originalValue: {
      type: Schema.Types.Mixed,
      default: null,
    },
    newValue: {
      type: Schema.Types.Mixed,
      default: null,
    },
    originalScore: {
      type: Schema.Types.Mixed,
      default: null,
    },
    overrideScore: {
      type: Schema.Types.Mixed,
      default: null,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    collection: 'overrides',
    timestamps: { createdAt: true, updatedAt: false },
  }
);

overrideSchema.index({ sessionId: 1 });

const Override = model('Override', overrideSchema);
export default Override;
