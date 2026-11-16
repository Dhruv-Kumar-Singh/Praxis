/**
 * @collection evaluations
 * Per-question evaluation produced by the AI grading pipeline.
 * One document per (session, question) pair.
 *
 * Key fields:
 *   sessionId     - Parent session (ref: sessions)
 *   questionId    - The specific question being evaluated
 *   chunkSeqs     - Sequence numbers of interview_chunks that cover this question
 *   scores        - Rubric sub-scores: correctness, communication, depth (0–100)
 *   confidence    - Model confidence in this evaluation (0.0 – 1.0)
 *   flags         - Array of warning/anomaly tags (e.g. 'low_stt_confidence')
 *   evidence      - Quotes from chunks that support the scores
 *   retrieved     - RAG documents retrieved during evaluation, with relevance scores
 *   modelId       - LLM model that produced this evaluation
 *   promptVersion - Version of the evaluation prompt template used
 *   rubricVersion - Version of the rubric used to produce scores
 *
 * Indexes:
 *   { sessionId, questionId } (unique) - One evaluation per question per session
 */

import mongoose from 'mongoose';

const { Schema, model } = mongoose;

// ── Sub-schemas ───────────────────────────────────────────────────────────────

const scoresSchema = new Schema(
  {
    correctness: { type: Number, min: 0, max: 100, required: true },
    communication: { type: Number, min: 0, max: 100, required: true },
    depth: { type: Number, min: 0, max: 100, required: true },
  },
  { _id: false }
);

const evidenceSchema = new Schema(
  {
    chunkSeq: { type: Number, required: true },
    quote: { type: String, required: true },
  },
  { _id: false }
);

const retrievedDocSchema = new Schema(
  {
    docId: { type: Schema.Types.ObjectId, required: true }, // ref: kb_documents
    score: { type: Number, required: true, min: 0, max: 1 },
  },
  { _id: false }
);

// ── Root schema ───────────────────────────────────────────────────────────────

const evaluationSchema = new Schema(
  {
    sessionId: {
      type: Schema.Types.ObjectId,
      ref: 'Session',
      required: true,
    },
    questionId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    chunkSeqs: {
      type: [Number],
      default: [],
    },
    scores: {
      type: scoresSchema,
      required: true,
    },
    confidence: {
      type: Number,
      min: 0,
      max: 1,
      required: true,
    },
    flags: {
      type: [String],
      default: [],
    },
    evidence: {
      type: [evidenceSchema],
      default: [],
    },
    retrieved: {
      type: [retrievedDocSchema],
      default: [],
    },
    modelId: {
      type: String,
      required: true,
    },
    promptVersion: {
      type: String,
      required: true,
    },
    rubricVersion: {
      type: String,
      required: true,
    },
  },
  {
    collection: 'evaluations',
    timestamps: { createdAt: true, updatedAt: false },
  }
);

// ── Indexes ───────────────────────────────────────────────────────────────────

evaluationSchema.index({ sessionId: 1, questionId: 1 }, { unique: true });

const Evaluation = model('Evaluation', evaluationSchema);
export default Evaluation;
