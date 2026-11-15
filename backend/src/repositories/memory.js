/**
 * IN-MEMORY ADAPTER — for development and tests only.
 * Selected when REPO_DRIVER=memory (default).
 * Data is lost on process restart.
 */
import { randomUUID } from 'crypto';

const now = () => new Date().toISOString();

// ── stores ────────────────────────────────────────────────────────
const store = {
  users: new Map(),
  sessions: new Map(),
  reports: new Map(),
  overrides: [],
  audits: [],
  notifications: [],
  chunks: [],
  refreshTokens: new Map(),
};

// ── helpers ───────────────────────────────────────────────────────
const paginate = (arr, page = 1, limit = 20) => {
  const start = (page - 1) * limit;
  return { items: arr.slice(start, start + limit), total: arr.length };
};

// ── userRepo ──────────────────────────────────────────────────────
export const userRepo = {
  async create({ email, passwordHash, role = 'candidate', name }) {
    const user = { id: randomUUID(), email, passwordHash, role, name, createdAt: now(), updatedAt: now() };
    store.users.set(user.id, user);
    return { ...user };
  },
  async findById(id) { return store.users.get(id) ? { ...store.users.get(id) } : null; },
  async findByEmail(email) {
    for (const u of store.users.values()) if (u.email === email) return { ...u };
    return null;
  },
  async update(id, data) {
    const u = store.users.get(id);
    if (!u) throw new Error('NOT_FOUND');
    const updated = { ...u, ...data, updatedAt: now() };
    store.users.set(id, updated);
    return { ...updated };
  },
  async list({ page = 1, limit = 20 } = {}) {
    return paginate([...store.users.values()], page, limit);
  },
};

// ── sessionRepo ───────────────────────────────────────────────────
export const sessionRepo = {
  async create(data) {
    const s = { id: randomUUID(), status: 'scheduled', ...data, createdAt: now(), updatedAt: now() };
    store.sessions.set(s.id, s);
    return { ...s };
  },
  async findById(id) { return store.sessions.get(id) ? { ...store.sessions.get(id) } : null; },
  async list({ candidateId, status, page = 1, limit = 20 } = {}) {
    let arr = [...store.sessions.values()];
    if (candidateId) arr = arr.filter(s => s.candidateId === candidateId);
    if (status) arr = arr.filter(s => s.status === status);
    return paginate(arr, page, limit);
  },
  async update(id, data) {
    const s = store.sessions.get(id);
    if (!s) throw new Error('NOT_FOUND');
    const updated = { ...s, ...data, updatedAt: now() };
    store.sessions.set(id, updated);
    return { ...updated };
  },
  async delete(id) { store.sessions.delete(id); },
};

// ── reportRepo ────────────────────────────────────────────────────
export const reportRepo = {
  async create(data) {
    const r = { id: randomUUID(), ...data, createdAt: now() };
    store.reports.set(r.id, r);
    return { ...r };
  },
  async findBySessionId(sessionId) {
    for (const r of store.reports.values()) if (r.sessionId === sessionId) return { ...r };
    return null;
  },
  async update(id, data) {
    const r = store.reports.get(id);
    if (!r) throw new Error('NOT_FOUND');
    const updated = { ...r, ...data };
    store.reports.set(id, updated);
    return { ...updated };
  },
};

// ── overrideRepo ──────────────────────────────────────────────────
export const overrideRepo = {
  async create(data) {
    const o = { id: randomUUID(), ...data, createdAt: now() };
    store.overrides.push(o);
    return { ...o };
  },
  async listBySessionId(sessionId) {
    return store.overrides.filter(o => o.sessionId === sessionId).map(o => ({ ...o }));
  },
};

// ── auditRepo ─────────────────────────────────────────────────────
export const auditRepo = {
  async create(data) {
    const a = { id: randomUUID(), ...data, createdAt: now() };
    store.audits.push(a);
    return { ...a };
  },
  async list({ page = 1, limit = 20, actorId, action } = {}) {
    let arr = [...store.audits];
    if (actorId) arr = arr.filter(a => a.actorId === actorId);
    if (action) arr = arr.filter(a => a.action === action);
    return paginate(arr.reverse(), page, limit);
  },
};

// ── notificationRepo ──────────────────────────────────────────────
export const notificationRepo = {
  async create(data) {
    const n = { id: randomUUID(), read: false, ...data, createdAt: now() };
    store.notifications.push(n);
    return { ...n };
  },
  async listByUserId(userId, { page = 1, limit = 20 } = {}) {
    const arr = store.notifications.filter(n => n.userId === userId);
    return paginate(arr.reverse(), page, limit);
  },
  async markRead(id, userId) {
    const n = store.notifications.find(n => n.id === id && n.userId === userId);
    if (!n) throw new Error('NOT_FOUND');
    n.read = true;
    return { ...n };
  },
};

// ── chunkRepo ─────────────────────────────────────────────────────
export const chunkRepo = {
  async create(data) {
    const c = { id: randomUUID(), ...data, createdAt: now() };
    store.chunks.push(c);
    return { ...c };
  },
  async listBySessionId(sessionId) {
    return store.chunks.filter(c => c.sessionId === sessionId).map(c => ({ ...c }));
  },
  async findLastIndex(sessionId) {
    const chunks = store.chunks.filter(c => c.sessionId === sessionId);
    if (!chunks.length) return -1;
    return Math.max(...chunks.map(c => c.index));
  },
};

// ── refreshTokenRepo ──────────────────────────────────────────────
export const refreshTokenRepo = {
  async create({ userId, token, expiresAt }) {
    const rt = { id: randomUUID(), userId, token, expiresAt, createdAt: now() };
    store.refreshTokens.set(token, rt);
    return { ...rt };
  },
  async find(token) {
    const rt = store.refreshTokens.get(token);
    return rt ? { ...rt } : null;
  },
  async revoke(token) { store.refreshTokens.delete(token); },
  async revokeAllForUser(userId) {
    for (const [k, v] of store.refreshTokens.entries()) {
      if (v.userId === userId) store.refreshTokens.delete(k);
    }
  },
};

/** Call this in tests to wipe all data between test runs */
export const __resetStore = () => {
  store.users.clear();
  store.sessions.clear();
  store.reports.clear();
  store.refreshTokens.clear();
  store.overrides.length = 0;
  store.audits.length = 0;
  store.notifications.length = 0;
  store.chunks.length = 0;
};
