/**
 * @collection interview_chunks
 * Stores every turn of an interview as an ordered sequence of chunks.
 * Both interviewer (AI) and candidate turns are recorded here.
 *
 * Key fields:
 *   sessionId     - Parent session (ref: sessions)
 *   seq           - Monotonically increasing sequence number within the session
 *   role          - 'interviewer' | 'candidate'
 *   text          - Transcript text for this turn
 *   startMs       - Turn start offset in milliseconds from session start
 *   endMs         - Turn end offset in milliseconds from session start
 *   sttConfidence - STT confidence score for candidate turns (0.0 – 1.0)
 *   questionId    - Which question from the plan this turn belongs to
 *   audioRef      - Pointer to the stored audio blob (e.g. S3 key)
 *   modelId       - LLM model that generated this turn (interviewer turns only)
 *   truncated     - True if the turn was cut short (e.g. time limit hit)
 *
 * Indexes:
 *   { sessionId, seq } (unique) - Enforce ordering and prevent duplicates
 */

import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const interviewChunkSchema = new Schema(
  {
    sessionId: {
      type: Schema.Types.Mixed,
      required: true,
    },
    seq: {
      type: Number,
      required: true,
      min: 0,
    },
    role: {
      type: String,
      enum: ['interviewer', 'candidate'],
      required: true,
    },
    text: {
      type: String,
      required: true,
    },
    startMs: {
      type: Number,
      default: 0,
    },
    endMs: {
      type: Number,
      default: 0,
    },
    sttConfidence: {
      type: Number,
      min: 0,
      max: 1,
      default: null,
    },
    questionId: {
      type: Schema.Types.Mixed,
      default: null,
    },
    audioRef: {
      type: String,
      default: null, // e.g. 'sessions/{sessionId}/chunks/{seq}.webm'
    },
    modelId: {
      type: String,
      default: null, // Populated only on interviewer turns
    },
    truncated: {
      type: Boolean,
      default: false,
    },
  },
  {
    collection: 'interview_chunks',
    timestamps: { createdAt: true, updatedAt: false },
  }
);

// ── Indexes ───────────────────────────────────────────────────────────────────

interviewChunkSchema.index({ sessionId: 1, seq: 1 }, { unique: true });

const InterviewChunk = model('InterviewChunk', interviewChunkSchema);
export default InterviewChunk;
