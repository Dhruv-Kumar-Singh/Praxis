/**
 * @collection kb_documents
 * Knowledge-base documents used for question storage and RAG retrieval.
 * Each document belongs to a topic and can carry question text, model answers,
 * rubric criteria, or reference material for the interviewer and evaluator.
 *
 * Key fields:
 *   topic         - Domain / category (e.g. 'system-design', 'algorithms')
 *   title         - Short human-readable title for the document
 *   text          - Full text content (question body, model answer, context, etc.)
 *   corpusVersion - Semantic version of the corpus this document belongs to.
 *                   Incrementing this version busts Redis RAG and qbank caches.
 *
 * Indexes:
 *   { topic }     - Retrieve all documents for a topic (question bank building)
 */

import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const kbDocumentSchema = new Schema(
  {
    topic: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    text: {
      type: String,
      required: true,
    },
    corpusVersion: {
      type: String,
      required: true,
      trim: true,
      // Convention: semver string, e.g. '1.0.0', '2.3.1'
      // Changing this version causes Redis keys rag:{corpusVersion}:* and
      // qbank:{topic}:{difficulty} to be treated as stale automatically.
    },
  },
  {
    collection: 'kb_documents',
    timestamps: true,
  }
);

const KbDocument = model('KbDocument', kbDocumentSchema);
export default KbDocument;
