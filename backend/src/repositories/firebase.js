/**
 * FIREBASE REALTIME DATABASE ADAPTER
 *
 * Implements the same interface as memory.js, backed by
 * Firebase Realtime Database at:
 *   https://praxis-b8ea5-default-rtdb.firebaseio.com/
 *
 * Collection paths mirror the MongoDB collection names defined in src/models/:
 *   /users/{id}
 *   /sessions/{id}
 *   /reports/{id}
 *   /overrides/{id}         (append-only)
 *   /audit_logs/{id}        (append-only)
 *   /notifications/{id}
 *   /interview_chunks/{id}
 *   /refresh_tokens/{token}
 *
 * Selected when REPO_DRIVER=firebase in .env.
 *
 * Notes:
 *  - Firebase RTDB pushes generate a time-sortable key (server-side); we use
 *    those as IDs for new records to avoid a separate UUID dependency.
 *  - Queries use Firebase REST orderBy / equalTo where possible; complex filters
 *    (multi-field) are done client-side after a shallow fetch.
 *  - Timestamps are stored as ISO-8601 strings for interoperability.
 */

import { db } from '../config/firebase.js';
import { ServerValue } from 'firebase-admin/database';

// ── Helpers ───────────────────────────────────────────────────────────────────

const now = () => new Date().toISOString();

/**
 * Push data to a collection ref and return the full record with its new id.
 * @param {string} path   - e.g. 'users'
 * @param {object} data   - Object to push
 * @returns {Promise<object>}
 */
async function pushRecord(path, data) {
  const ref = db.ref(path).push();
  const id = ref.key;
  const record = { id, ...data };
  await ref.set(record);
  return { ...record };
}

/**
 * Set data at a deterministic path (upsert).
 * @param {string} path   - Full path including id segment, e.g. 'users/abc123'
 * @param {object} data   - Object to set
 * @returns {Promise<object>}
 */
async function setRecord(path, data) {
  await db.ref(path).set(data);
  return { ...data };
}

/**
 * Fetch a single record by its full path.
 * Returns null if not found.
 * @param {string} path
 * @returns {Promise<object|null>}
 */
async function getRecord(path) {
  const snap = await db.ref(path).get();
  return snap.exists() ? snap.val() : null;
}

/**
 * Update (merge) fields in an existing record.
 * @param {string} path
 * @param {object} data   - Partial update; existing fields are preserved.
 * @returns {Promise<object>}
 */
async function updateRecord(path, data) {
  await db.ref(path).update(data);
  const updated = await getRecord(path);
  if (!updated) throw new Error('NOT_FOUND');
  return updated;
}

/**
 * Delete a record at the given path.
 * @param {string} path
 */
async function deleteRecord(path) {
  await db.ref(path).remove();
}

/**
 * Fetch all children under a path as an array.
 * @param {string} path
 * @returns {Promise<object[]>}
 */
async function listAll(path) {
  const snap = await db.ref(path).get();
  if (!snap.exists()) return [];
  return Object.values(snap.val());
}

/**
 * Simple client-side paginator.
 * @param {object[]} arr
 * @param {number} page
 * @param {number} limit
 * @returns {{ items: object[], total: number }}
 */
function paginate(arr, page = 1, limit = 20) {
  const start = (page - 1) * limit;
  return { items: arr.slice(start, start + limit), total: arr.length };
}

// ── userRepo ─────────────────────────────────────────────────────────────────
//   /users/{pushId}
//   Firebase index: .indexOn: ['email'] — add to RTDB rules for fast lookups

export const userRepo = {
  async create({ email, passwordHash, role = 'candidate', name }) {
    const ts = now();
    return pushRecord('users', {
      email: email.toLowerCase().trim(),
      passwordHash,
      role,
      name: name || null,
      prefs: { emailNotifications: true },
      createdAt: ts,
      updatedAt: ts,
    });
  },

  async findById(id) {
    return getRecord(`users/${id}`);
  },

  async findByEmail(email) {
    // Requires .indexOn: ["email"] in RTDB security rules for efficiency.
    const snap = await db
      .ref('users')
      .orderByChild('email')
      .equalTo(email.toLowerCase().trim())
      .limitToFirst(1)
      .get();
    if (!snap.exists()) return null;
    const vals = Object.values(snap.val());
    return vals.length ? vals[0] : null;
  },

  async update(id, data) {
    const existing = await getRecord(`users/${id}`);
    if (!existing) throw new Error('NOT_FOUND');
    return updateRecord(`users/${id}`, { ...data, updatedAt: now() });
  },

  async list({ page = 1, limit = 20 } = {}) {
    const all = await listAll('users');
    return paginate(all, page, limit);
  },
};

// ── sessionRepo ───────────────────────────────────────────────────────────────
//   /sessions/{pushId}
//   Firebase indexes: candidateId, status

export const sessionRepo = {
  async create(data) {
    const ts = now();
    return pushRecord('sessions', {
      status: 'scheduled',
      statusHistory: [],
      ...data,
      createdAt: ts,
      updatedAt: ts,
    });
  },

  async findById(id) {
    return getRecord(`sessions/${id}`);
  },

  async list({ candidateId, status, page = 1, limit = 20 } = {}) {
    let snap;

    if (candidateId) {
      // Requires .indexOn: ["candidateId"] in RTDB rules
      snap = await db
        .ref('sessions')
        .orderByChild('candidateId')
        .equalTo(candidateId)
        .get();
    } else if (status) {
      // Requires .indexOn: ["status"] in RTDB rules
      snap = await db
        .ref('sessions')
        .orderByChild('status')
        .equalTo(status)
        .get();
    } else {
      snap = await db.ref('sessions').get();
    }

    if (!snap.exists()) return { items: [], total: 0 };
    let arr = Object.values(snap.val());

    // Client-side filter when both fields are queried
    if (candidateId && status) arr = arr.filter((s) => s.status === status);

    // Sort newest-first
    arr.sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1));
    return paginate(arr, page, limit);
  },

  async update(id, data) {
    const existing = await getRecord(`sessions/${id}`);
    if (!existing) throw new Error('NOT_FOUND');
    const updated = { ...existing, ...data, updatedAt: now() };
    return setRecord(`sessions/${id}`, updated);
  },

  async delete(id) {
    await deleteRecord(`sessions/${id}`);
  },
};

// ── reportRepo ────────────────────────────────────────────────────────────────
//   /reports/{pushId}
//   Firebase index: sessionId

export const reportRepo = {
  async create(data) {
    const ts = now();
    return pushRecord('reports', {
      status: 'pending',
      ...data,
      createdAt: ts,
      updatedAt: ts,
    });
  },

  async findBySessionId(sessionId) {
    // Requires .indexOn: ["sessionId"] in RTDB rules
    const snap = await db
      .ref('reports')
      .orderByChild('sessionId')
      .equalTo(sessionId)
      .limitToFirst(1)
      .get();
    if (!snap.exists()) return null;
    const vals = Object.values(snap.val());
    return vals.length ? vals[0] : null;
  },

  async update(id, data) {
    const existing = await getRecord(`reports/${id}`);
    if (!existing) throw new Error('NOT_FOUND');
    return updateRecord(`reports/${id}`, { ...data, updatedAt: now() });
  },
};

// ── overrideRepo ─────────────────────────────────────────────────────────────
//   /overrides/{pushId}   — append-only; never mutated after creation

export const overrideRepo = {
  async create(data) {
    return pushRecord('overrides', {
      ...data,
      createdAt: now(),
    });
  },

  async listBySessionId(sessionId) {
    // Requires .indexOn: ["sessionId"] in RTDB rules
    const snap = await db
      .ref('overrides')
      .orderByChild('sessionId')
      .equalTo(sessionId)
      .get();
    if (!snap.exists()) return [];
    return Object.values(snap.val());
  },
};

// ── auditRepo ─────────────────────────────────────────────────────────────────
//   /audit_logs/{pushId}  — append-only; never mutated after creation

export const auditRepo = {
  async create(data) {
    return pushRecord('audit_logs', {
      ts: now(),
      ...data,
    });
  },

  async list({ page = 1, limit = 20, actorId, action } = {}) {
    let arr = await listAll('audit_logs');
    if (actorId) arr = arr.filter((a) => a.actorId === actorId);
    if (action) arr = arr.filter((a) => a.action === action);
    // Most-recent first
    arr.sort((a, b) => (a.ts > b.ts ? -1 : 1));
    return paginate(arr, page, limit);
  },
};

// ── notificationRepo ──────────────────────────────────────────────────────────
//   /notifications/{pushId}
//   Firebase index: userId, status+nextAttemptAt

export const notificationRepo = {
  async create(data) {
    const ts = now();
    return pushRecord('notifications', {
      read: false,
      status: 'pending',
      attempts: 0,
      nextAttemptAt: ts,
      ...data,
      createdAt: ts,
    });
  },

  async listByUserId(userId, { page = 1, limit = 20 } = {}) {
    // Requires .indexOn: ["userId"] in RTDB rules
    const snap = await db
      .ref('notifications')
      .orderByChild('userId')
      .equalTo(userId)
      .get();
    if (!snap.exists()) return { items: [], total: 0 };
    const arr = Object.values(snap.val()).sort(
      (a, b) => (a.createdAt > b.createdAt ? -1 : 1)
    );
    return paginate(arr, page, limit);
  },

  async markRead(id, userId) {
    const n = await getRecord(`notifications/${id}`);
    if (!n || n.userId !== userId) throw new Error('NOT_FOUND');
    return updateRecord(`notifications/${id}`, { read: true });
  },
};

// ── chunkRepo ─────────────────────────────────────────────────────────────────
//   /interview_chunks/{pushId}
//   Firebase index: sessionId

export const chunkRepo = {
  async create(data) {
    return pushRecord('interview_chunks', {
      ...data,
      createdAt: now(),
    });
  },

  async listBySessionId(sessionId) {
    // Requires .indexOn: ["sessionId"] in RTDB rules
    const snap = await db
      .ref('interview_chunks')
      .orderByChild('sessionId')
      .equalTo(sessionId)
      .get();
    if (!snap.exists()) return [];
    return Object.values(snap.val()).sort((a, b) => a.index - b.index);
  },

  async findLastIndex(sessionId) {
    const chunks = await chunkRepo.listBySessionId(sessionId);
    if (!chunks.length) return -1;
    return Math.max(...chunks.map((c) => c.index));
  },
};

// ── refreshTokenRepo ──────────────────────────────────────────────────────────
//   /refresh_tokens/{token}
//   Stored by token value as key for O(1) lookup.
//   Firebase does not natively support TTL; expired tokens are pruned by a
//   Cloud Function or on each `find()` call below.

export const refreshTokenRepo = {
  async create({ userId, token, expiresAt }) {
    const record = {
      id: token,
      userId,
      token,
      expiresAt,
      revokedAt: null,
      createdAt: now(),
    };
    // Use token as the RTDB key (URL-safe base64 characters only — Firebase
    // disallows '.', '#', '$', '[', ']'; encode if needed in production)
    await db.ref(`refresh_tokens/${encodeURIComponent(token)}`).set(record);
    return { ...record };
  },

  async find(token) {
    const record = await getRecord(
      `refresh_tokens/${encodeURIComponent(token)}`
    );
    if (!record) return null;
    // Treat expired or revoked tokens as not-found
    if (record.revokedAt || new Date(record.expiresAt) < new Date()) return null;
    return record;
  },

  async revoke(token) {
    const path = `refresh_tokens/${encodeURIComponent(token)}`;
    const record = await getRecord(path);
    if (record) {
      await db.ref(path).update({ revokedAt: now() });
    }
  },

  async revokeAllForUser(userId) {
    // Requires .indexOn: ["userId"] in RTDB rules
    const snap = await db
      .ref('refresh_tokens')
      .orderByChild('userId')
      .equalTo(userId)
      .get();
    if (!snap.exists()) return;

    const updates = {};
    snap.forEach((child) => {
      updates[`${child.key}/revokedAt`] = now();
    });
    await db.ref('refresh_tokens').update(updates);
  },
};

/** No-op for Firebase (data is persistent) — kept for interface compatibility with tests */
export const __resetStore = () => {
  console.warn(
    '[firebase.js] __resetStore() is a no-op for the Firebase adapter. ' +
    'Use the Firebase console or Admin SDK to clear test data.'
  );
};
