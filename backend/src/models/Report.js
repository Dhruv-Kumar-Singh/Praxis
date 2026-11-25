/**
 * @collection reports
 * Final interview report generated after all evaluations are complete.
 */

import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const reportItemSchema = new Schema(
  {
    text: { type: String, default: '' },
    evidenceRefs: {
      type: [Schema.Types.Mixed],
      default: [],
    },
  },
  { _id: false }
);

const verifierSchema = new Schema(
  {
    passed: { type: Boolean, default: true },
    droppedItems: {
      type: [Number],
      default: [],
    },
  },
  { _id: false }
);

const reportSchema = new Schema(
  {
    sessionId: {
      type: Schema.Types.Mixed,
      required: true,
      unique: true,
    },
    overall: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    scores: {
      type: Schema.Types.Mixed,
      default: () => ({ overall: 0 }),
    },
    strengths: {
      type: [String],
      default: [],
    },
    weaknesses: {
      type: [String],
      default: [],
    },
    verdict: {
      type: String,
      default: null,
    },
    questionsDetail: {
      type: [
        {
          questionId: { type: String, default: '' },
          title:      { type: String, default: '' },
          score:      { type: Number, default: 0 },
          feedback:   { type: String, default: '' },
          scores: {
            correctness:   { type: Number, default: 0 },
            communication: { type: Number, default: 0 },
            depth:         { type: Number, default: 0 },
          },
        },
      ],
      default: [],
    },
    items: {
      type: [reportItemSchema],
      default: [],
    },
    summary: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['pending', 'generated', 'verified', 'failed'],
      default: 'pending',
      required: true,
    },
    verifier: {
      type: verifierSchema,
      default: null,
    },
    generatedAt: {
      type: Date,
      default: () => new Date(),
    },
    modelId: {
      type: String,
      default: 'gpt-6-luna',
    },
  },
  {
    collection: 'reports',
    timestamps: true,
  }
);

const Report = model('Report', reportSchema);
export default Report;
