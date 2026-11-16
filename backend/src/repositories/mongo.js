import mongoose from 'mongoose';
import { randomUUID } from 'crypto';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import {
  User,
  RefreshToken,
  Session,
  InterviewChunk,
  Report,
  Override,
  AuditLog,
  Notification
} from '../models/index.js';

let isConnected = false;

export async function initMongo() {
  if (isConnected && mongoose.connection.readyState === 1) return;
  try {
    await mongoose.connect(env.MONGODB_URI);
    isConnected = true;
    logger.info(`MongoDB connected to ${env.MONGODB_URI}`);
  } catch (err) {
    logger.error(`MongoDB connection error: ${err.message}`);
    throw err;
  }
}

// ── Helpers ────────────────────────────────────────────────────────
const toObj = (doc) => {
  if (!doc) return null;
  const obj = doc.toObject ? doc.toObject() : { ...doc };
  if (obj._id && !obj.id) obj.id = obj._id.toString();
  return obj;
};

const paginate = (items, total) => ({ items: items.map(toObj), total });

// ── userRepo ───────────────────────────────────────────────────────
export const userRepo = {
  async create({ email, passwordHash, role = 'candidate', name }) {
    await initMongo();
    const doc = await User.create({
      email,
      passwordHash,
      role,
      name,
      prefs: { emailNotifications: true }
    });
    return toObj(doc);
  },

  async findById(id) {
    await initMongo();
    let doc = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      doc = await User.findById(id);
    }
    if (!doc) {
      doc = await User.findOne({ $or: [{ _id: id }, { id }] });
    }
    return toObj(doc);
  },

  async findByEmail(email) {
    await initMongo();
    const doc = await User.findOne({ email: email.toLowerCase().trim() });
    return toObj(doc);
  },

  async update(id, data) {
    await initMongo();
    const query = mongoose.Types.ObjectId.isValid(id) ? { _id: id } : { $or: [{ _id: id }, { id }] };
    const doc = await User.findOneAndUpdate(query, { $set: data }, { returnDocument: 'after' });
    if (!doc) throw new Error('NOT_FOUND');
    return toObj(doc);
  },

  async list({ page = 1, limit = 20 } = {}) {
    await initMongo();
    const skip = (page - 1) * limit;
    const [docs, total] = await Promise.all([
      User.find().skip(skip).limit(limit).sort({ createdAt: -1 }),
      User.countDocuments()
    ]);
    return paginate(docs, total);
  }
};

// ── sessionRepo ────────────────────────────────────────────────────
export const sessionRepo = {
  async create(data) {
    await initMongo();
    const sessionData = {
      ...data,
      status: data.status || 'scheduled',
      statusHistory: [{ status: data.status || 'scheduled', at: new Date() }]
    };
    if (data.candidateId && !data.userId) {
      sessionData.userId = data.candidateId;
    }
    if (data.userId && !data.candidateId) {
      sessionData.candidateId = data.userId;
    }
    const doc = await Session.create(sessionData);
    const obj = toObj(doc);
    obj.candidateId = obj.userId ? obj.userId.toString() : obj.candidateId;
    return obj;
  },

  async findById(id) {
    await initMongo();
    let doc = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      doc = await Session.findById(id);
    }
    if (!doc) {
      doc = await Session.findOne({ $or: [{ _id: id }, { id }] });
    }
    if (!doc) return null;
    const obj = toObj(doc);
    obj.candidateId = obj.userId ? obj.userId.toString() : obj.candidateId;
    return obj;
  },

  async list({ candidateId, status, page = 1, limit = 20 } = {}) {
    await initMongo();
    const query = {};
    if (candidateId) {
      query.$or = [{ userId: candidateId }, { candidateId }];
    }
    if (status) query.status = status;

    const skip = (page - 1) * limit;
    const [docs, total] = await Promise.all([
      Session.find(query).skip(skip).limit(limit).sort({ createdAt: -1 }),
      Session.countDocuments(query)
    ]);
    return {
      items: docs.map((d) => {
        const o = toObj(d);
        o.candidateId = o.userId ? o.userId.toString() : o.candidateId;
        return o;
      }),
      total
    };
  },

  async update(id, data) {
    await initMongo();
    const query = mongoose.Types.ObjectId.isValid(id) ? { _id: id } : { $or: [{ _id: id }, { id }] };
    const doc = await Session.findOneAndUpdate(query, { $set: data }, { returnDocument: 'after' });
    if (!doc) throw new Error('NOT_FOUND');
    const obj = toObj(doc);
    obj.candidateId = obj.userId ? obj.userId.toString() : obj.candidateId;
    return obj;
  },

  async delete(id) {
    await initMongo();
    const query = mongoose.Types.ObjectId.isValid(id) ? { _id: id } : { $or: [{ _id: id }, { id }] };
    await Session.deleteOne(query);
  }
};

// ── reportRepo ─────────────────────────────────────────────────────
export const reportRepo = {
  async create(data) {
    await initMongo();
    const doc = await Report.create({
      ...data,
      overall: data.overall ?? data.scores?.overall ?? 0,
    });
    return toObj(doc);
  },

  async findBySessionId(sessionId) {
    await initMongo();
    const doc = await Report.findOne({ sessionId });
    return toObj(doc);
  },

  async update(id, data) {
    await initMongo();
    const query = mongoose.Types.ObjectId.isValid(id) ? { _id: id } : { $or: [{ _id: id }, { id }] };
    const doc = await Report.findOneAndUpdate(query, { $set: data }, { returnDocument: 'after' });
    if (!doc) throw new Error('NOT_FOUND');
    return toObj(doc);
  }
};

// ── overrideRepo ───────────────────────────────────────────────────
export const overrideRepo = {
  async create(data) {
    await initMongo();
    const doc = await Override.create(data);
    return toObj(doc);
  },

  async listBySessionId(sessionId) {
    await initMongo();
    const docs = await Override.find({ sessionId }).sort({ createdAt: -1 });
    return docs.map(toObj);
  }
};

// ── auditRepo ──────────────────────────────────────────────────────
export const auditRepo = {
  async create(data) {
    await initMongo();
    const doc = await AuditLog.create({
      ts: new Date(),
      actorId: data.actorId || new mongoose.Types.ObjectId(),
      actorType: data.actorType || 'user',
      action: data.action,
      entity: data.entity || 'system',
      entityId: data.targetId || data.entityId || new mongoose.Types.ObjectId(),
      metadata: data.metadata,
      ip: data.ip
    });
    return toObj(doc);
  },

  async list({ page = 1, limit = 20, actorId, action } = {}) {
    await initMongo();
    const query = {};
    if (actorId) query.actorId = actorId;
    if (action) query.action = action;

    const skip = (page - 1) * limit;
    const [docs, total] = await Promise.all([
      AuditLog.find(query).skip(skip).limit(limit).sort({ ts: -1 }),
      AuditLog.countDocuments(query)
    ]);
    return paginate(docs, total);
  }
};

// ── notificationRepo ───────────────────────────────────────────────
export const notificationRepo = {
  async create(data) {
    await initMongo();
    const doc = await Notification.create({
      ...data,
      status: 'pending'
    });
    return toObj(doc);
  },

  async listByUserId(userId, { page = 1, limit = 20 } = {}) {
    await initMongo();
    const skip = (page - 1) * limit;
    const [docs, total] = await Promise.all([
      Notification.find({ userId }).skip(skip).limit(limit).sort({ createdAt: -1 }),
      Notification.countDocuments({ userId })
    ]);
    return paginate(docs, total);
  },

  async markRead(id, userId) {
    await initMongo();
    const query = mongoose.Types.ObjectId.isValid(id) ? { _id: id, userId } : { id, userId };
    const doc = await Notification.findOneAndUpdate(query, { $set: { read: true } }, { returnDocument: 'after' });
    if (!doc) throw new Error('NOT_FOUND');
    return toObj(doc);
  }
};

// ── chunkRepo ──────────────────────────────────────────────────────
export const chunkRepo = {
  async create(data) {
    await initMongo();
    const doc = await InterviewChunk.create(data);
    return toObj(doc);
  },

  async listBySessionId(sessionId) {
    await initMongo();
    const docs = await InterviewChunk.find({ sessionId }).sort({ seq: 1 });
    return docs.map(toObj);
  },

  async findLastIndex(sessionId) {
    await initMongo();
    const doc = await InterviewChunk.findOne({ sessionId }).sort({ seq: -1 });
    return doc ? (doc.seq ?? -1) : -1;
  }
};

// ── refreshTokenRepo ───────────────────────────────────────────────
export const refreshTokenRepo = {
  async create({ userId, token, expiresAt }) {
    await initMongo();
    const doc = await RefreshToken.create({
      userId,
      familyId: randomUUID(),
      tokenHash: token,
      expiresAt: new Date(expiresAt)
    });
    return toObj(doc);
  },

  async find(token) {
    await initMongo();
    const doc = await RefreshToken.findOne({ tokenHash: token, revokedAt: null });
    return toObj(doc);
  },

  async revoke(token) {
    await initMongo();
    await RefreshToken.updateOne({ tokenHash: token }, { $set: { revokedAt: new Date() } });
  },

  async revokeAllForUser(userId) {
    await initMongo();
    await RefreshToken.updateMany({ userId }, { $set: { revokedAt: new Date() } });
  }
};

export const __resetStore = async () => {
  if (process.env.NODE_ENV === 'test') {
    await initMongo();
    await Promise.all([
      User.deleteMany({}),
      Session.deleteMany({}),
      Report.deleteMany({}),
      InterviewChunk.deleteMany({}),
      RefreshToken.deleteMany({}),
      AuditLog.deleteMany({}),
      Override.deleteMany({}),
      Notification.deleteMany({}),
    ]);
  }
};
