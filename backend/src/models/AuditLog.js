/**
 * @collection audit_logs
 * Immutable, append-only record of every significant action taken in the system.
 */

import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const auditLogSchema = new Schema(
  {
    ts: {
      type: Date,
      required: true,
      default: Date.now,
    },
    actorId: {
      type: Schema.Types.Mixed,
      required: true,
    },
    actorType: {
      type: String,
      enum: ['user', 'service', 'system'],
      default: 'user',
      required: true,
    },
    action: {
      type: String,
      required: true,
      trim: true,
    },
    entity: {
      type: String,
      default: 'system',
      trim: true,
    },
    entityId: {
      type: Schema.Types.Mixed,
      default: null,
    },
    before: {
      type: Schema.Types.Mixed,
      default: null,
    },
    after: {
      type: Schema.Types.Mixed,
      default: null,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
    ip: {
      type: String,
      default: null,
    },
    requestId: {
      type: String,
      default: null,
      trim: true,
    },
  },
  {
    collection: 'audit_logs',
    timestamps: false,
  }
);

auditLogSchema.index({ entity: 1, ts: -1 });

const AuditLog = model('AuditLog', auditLogSchema);
export default AuditLog;
