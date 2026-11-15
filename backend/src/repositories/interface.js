/**
 * Repository interfaces for Praxis.
 * Each method throws NOT_IMPLEMENTED by default.
 * A real DB adapter overrides these methods.
 *
 * Data shapes (all ids are UUIDs, all timestamps are ISO strings):
 *
 * User:    { id, email, passwordHash, role, name, createdAt, updatedAt }
 * Session: { id, candidateId, role, topic, status, config, createdAt, updatedAt }
 * Report:  { id, sessionId, scores, strengths, weaknesses, summary, verdict, createdAt }
 * Override:{ id, sessionId, field, originalValue, newValue, reason, authorId, createdAt }
 * Audit:   { id, action, actorId, targetId, metadata, ip, createdAt }
 * Notification: { id, userId, type, payload, read, createdAt }
 * Chunk:   { id, sessionId, index, type, transcript, audioMeta, createdAt }
 * RefreshToken: { id, userId, token, expiresAt, createdAt }
 */

const ni = (name) => { throw new Error(`NOT_IMPLEMENTED: ${name}`); };

/** @type {UserRepo} */
export const userRepo = {
  /** @param {{email,passwordHash,role,name}} data @returns {Promise<User>} */
  async create(data)                    { ni('userRepo.create'); },
  /** @param {string} id @returns {Promise<User|null>} */
  async findById(id)                    { ni('userRepo.findById'); },
  /** @param {string} email @returns {Promise<User|null>} */
  async findByEmail(email)              { ni('userRepo.findByEmail'); },
  /** @param {string} id @param {object} data @returns {Promise<User>} */
  async update(id, data)                { ni('userRepo.update'); },
  /** @param {{page,limit}} opts @returns {Promise<{items:User[],total:number}>} */
  async list(opts)                      { ni('userRepo.list'); },
};

/** @type {SessionRepo} */
export const sessionRepo = {
  async create(data)                    { ni('sessionRepo.create'); },
  async findById(id)                    { ni('sessionRepo.findById'); },
  /** @param {{candidateId,status,page,limit}} filters @returns {Promise<{items,total}>} */
  async list(filters)                   { ni('sessionRepo.list'); },
  async update(id, data)                { ni('sessionRepo.update'); },
  async delete(id)                      { ni('sessionRepo.delete'); },
};

/** @type {ReportRepo} */
export const reportRepo = {
  async create(data)                    { ni('reportRepo.create'); },
  async findBySessionId(sessionId)      { ni('reportRepo.findBySessionId'); },
  async update(id, data)                { ni('reportRepo.update'); },
};

/** @type {OverrideRepo} */
export const overrideRepo = {
  /** Original values NEVER overwritten. New entry per override. */
  async create(data)                    { ni('overrideRepo.create'); },
  async listBySessionId(sessionId)      { ni('overrideRepo.listBySessionId'); },
};

/** @type {AuditRepo} */
export const auditRepo = {
  async create(data)                    { ni('auditRepo.create'); },
  /** @param {{page,limit,actorId,action}} filters */
  async list(filters)                   { ni('auditRepo.list'); },
};

/** @type {NotificationRepo} */
export const notificationRepo = {
  async create(data)                    { ni('notificationRepo.create'); },
  async listByUserId(userId, opts)      { ni('notificationRepo.listByUserId'); },
  async markRead(id, userId)            { ni('notificationRepo.markRead'); },
};

/** @type {ChunkRepo} */
export const chunkRepo = {
  async create(data)                    { ni('chunkRepo.create'); },
  async listBySessionId(sessionId)      { ni('chunkRepo.listBySessionId'); },
  async findLastIndex(sessionId)        { ni('chunkRepo.findLastIndex'); },
};

/** @type {RefreshTokenRepo} */
export const refreshTokenRepo = {
  async create(data)                    { ni('refreshTokenRepo.create'); },
  async find(token)                     { ni('refreshTokenRepo.find'); },
  async revoke(token)                   { ni('refreshTokenRepo.revoke'); },
  async revokeAllForUser(userId)        { ni('refreshTokenRepo.revokeAllForUser'); },
};
