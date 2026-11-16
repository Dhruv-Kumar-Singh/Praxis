/**
 * Redis key patterns, TTLs, and invalidation rules.
 *
 * This file is the single source of truth for all Redis key structures used
 * across the application. Import the builder functions wherever you need to
 * construct or delete a Redis key so the shape never drifts between services.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Key Pattern                        | TTL            | Purpose
 * ─────────────────────────────────────────────────────────────────────────────
 * sess:{id}:state                    | duration+15min | Session status mirror
 * sess:{id}:ctx                      | 2 h            | LLM context (last N turns)
 * sess:{id}:lock                     | 30 s (renewed) | Orchestrator distributed lock
 * sess:{id}:partial                  | 5 min          | Live partial transcript
 * rl:{actor}:{route}                 | window length  | Sliding-window rate limit
 * auth:deny:{jti}                    | token lifetime | Revoked access token
 * dash:{userId}:{filtersHash}        | 60 s           | Dashboard aggregates
 * rag:{corpusVersion}:{queryHash}    | 24 h           | RAG retrieval cache
 * qbank:{topic}:{difficulty}         | 1 h            | Question bank candidates
 * idem:{key}                         | 24 h           | POST idempotency results
 * job:{sessionId}:eval               | 1 h            | Evaluation job progress
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── TTL constants (in seconds) ────────────────────────────────────────────────

export const TTL = {
  /** Added on top of session's expectedDurationMin when caching state. */
  SESSION_STATE_PADDING_S: 15 * 60,         // 15 minutes

  /** LLM context window cache. Rebuilt from MongoDB on a miss. */
  SESSION_CTX_S: 2 * 60 * 60,              // 2 hours

  /** Distributed orchestrator lock — renewed by heartbeat. */
  SESSION_LOCK_S: 30,                        // 30 seconds

  /** Live partial transcript shown to the UI. Ephemeral. */
  SESSION_PARTIAL_S: 5 * 60,               // 5 minutes

  /** Revoked access token denylist — matches the access token lifetime. */
  AUTH_DENY_S: 15 * 60,                    // 15 minutes (adjust to match JWT exp)

  /** Dashboard aggregate cache. Invalidated on FEEDBACK_READY and override. */
  DASHBOARD_S: 60,                           // 60 seconds

  /** RAG retrieval cache. Keyed by corpusVersion so stale on corpus update. */
  RAG_S: 24 * 60 * 60,                     // 24 hours

  /** Question bank candidates per topic/difficulty. */
  QBANK_S: 60 * 60,                        // 1 hour

  /** POST idempotency result storage. */
  IDEMPOTENCY_S: 24 * 60 * 60,            // 24 hours

  /** Evaluation job progress for the UI. */
  JOB_EVAL_S: 60 * 60,                    // 1 hour
};

// ── Key builder functions ─────────────────────────────────────────────────────

/**
 * Mirror of a session's status for fast reads.
 * Source of truth: MongoDB sessions collection.
 * Invalidation: rewritten on every status transition.
 * TTL: session expectedDurationMin * 60 + SESSION_STATE_PADDING_S
 *
 * @param {string} sessionId
 * @returns {string}
 */
export const sessionStateKey = (sessionId) => `sess:${sessionId}:state`;

/**
 * Last N turns used as LLM context window for a session.
 * Source of truth: interview_chunks collection.
 * Invalidation: rebuilt from MongoDB on a cache miss.
 *
 * @param {string} sessionId
 * @returns {string}
 */
export const sessionCtxKey = (sessionId) => `sess:${sessionId}:ctx`;

/**
 * Distributed lease ensuring only one orchestrator drives a session at a time.
 * No external source of truth — lease expiry (30 s) frees it automatically.
 * Renewed by heartbeat while the connection is healthy.
 *
 * @param {string} sessionId
 * @returns {string}
 */
export const sessionLockKey = (sessionId) => `sess:${sessionId}:lock`;

/**
 * Live partial transcript fragment for the UI.
 * Ephemeral — not backed by MongoDB.
 *
 * @param {string} sessionId
 * @returns {string}
 */
export const sessionPartialKey = (sessionId) => `sess:${sessionId}:partial`;

/**
 * Sliding-window rate-limit counter for a user or IP on a specific route.
 * Ephemeral. TTL equals the window length.
 *
 * @param {string} actor  - userId or IP address
 * @param {string} route  - Route identifier, e.g. 'POST:/sessions'
 * @returns {string}
 */
export const rateLimitKey = (actor, route) => `rl:${actor}:${route}`;

/**
 * Denylist entry for a revoked access token.
 * Source of truth: refresh_tokens collection in MongoDB (revokedAt field).
 * TTL matches the access token's remaining lifetime.
 *
 * @param {string} jti  - JWT ID claim of the access token
 * @returns {string}
 */
export const authDenyKey = (jti) => `auth:deny:${jti}`;

/**
 * Cached dashboard aggregates for a user with a specific filter set.
 * Invalidated on FEEDBACK_READY events and when an override is applied.
 *
 * @param {string} userId
 * @param {string} filtersHash  - Stable hash of the query filters
 * @returns {string}
 */
export const dashboardKey = (userId, filtersHash) => `dash:${userId}:${filtersHash}`;

/**
 * RAG retrieval result cache.
 * Keyed by corpusVersion so a new corpus automatically avoids stale hits —
 * no explicit invalidation needed; old keys age out via TTL.
 *
 * @param {string} corpusVersion  - e.g. '1.0.0'
 * @param {string} queryHash      - Stable hash of the retrieval query
 * @returns {string}
 */
export const ragKey = (corpusVersion, queryHash) => `rag:${corpusVersion}:${queryHash}`;

/**
 * Question bank candidate list for a given topic and difficulty.
 * Source of truth: kb_documents collection.
 * Invalidated implicitly when corpusVersion changes (different RAG keys used).
 *
 * @param {string} topic       - e.g. 'system-design'
 * @param {string} difficulty  - 'easy' | 'medium' | 'hard'
 * @returns {string}
 */
export const qbankKey = (topic, difficulty) => `qbank:${topic}:${difficulty}`;

/**
 * Idempotency result for a POST request (e.g. POST /sessions, enqueue eval).
 * Ephemeral — not backed by MongoDB.
 *
 * @param {string} key  - Idempotency key provided by the client
 * @returns {string}
 */
export const idempotencyKey = (key) => `idem:${key}`;

/**
 * Evaluation job progress for a session, consumed by the UI via polling/SSE.
 *
 * @param {string} sessionId
 * @returns {string}
 */
export const jobEvalKey = (sessionId) => `job:${sessionId}:eval`;
