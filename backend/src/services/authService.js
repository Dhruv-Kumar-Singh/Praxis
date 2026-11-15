import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { env } from '../config/env.js';
import { Errors } from '../utils/errors.js';
import { userRepo, refreshTokenRepo, auditRepo } from '../repositories/index.js';

const signAccess = (user) =>
  jwt.sign(
    { sub: user.id, email: user.email, role: user.role, type: 'access' },
    env.JWT_SECRET,
    { expiresIn: env.JWT_ACCESS_EXPIRES }
  );

const signRefresh = (userId) => {
  const token = randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  return { token, expiresAt };
};

export const authService = {
  async register({ email, password, name, role = 'candidate' }, ip) {
    const existing = await userRepo.findByEmail(email);
    if (existing) throw Errors.CONFLICT('Email already registered');
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await userRepo.create({ email, passwordHash, role, name });
    await auditRepo.create({ action: 'user.register', actorId: user.id, targetId: user.id, ip, metadata: { email } });
    const accessToken = signAccess(user);
    const { token: refreshToken, expiresAt } = signRefresh(user.id);
    await refreshTokenRepo.create({ userId: user.id, token: refreshToken, expiresAt });
    const { passwordHash: _, ...safeUser } = user;
    return { user: safeUser, accessToken, refreshToken };
  },

  async login({ email, password }, ip) {
    const user = await userRepo.findByEmail(email);
    if (!user) throw Errors.UNAUTHORIZED();
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      await auditRepo.create({ action: 'auth.login.fail', actorId: null, targetId: null, ip, metadata: { email } });
      throw Errors.UNAUTHORIZED();
    }
    await auditRepo.create({ action: 'auth.login', actorId: user.id, targetId: user.id, ip, metadata: {} });
    const accessToken = signAccess(user);
    const { token: refreshToken, expiresAt } = signRefresh(user.id);
    await refreshTokenRepo.create({ userId: user.id, token: refreshToken, expiresAt });
    const { passwordHash: _, ...safeUser } = user;
    return { user: safeUser, accessToken, refreshToken };
  },

  async refresh(token, ip) {
    const rt = await refreshTokenRepo.find(token);
    if (!rt || new Date(rt.expiresAt) < new Date()) throw Errors.UNAUTHORIZED();
    await refreshTokenRepo.revoke(token);
    const user = await userRepo.findById(rt.userId);
    if (!user) throw Errors.UNAUTHORIZED();
    const accessToken = signAccess(user);
    const { token: newRefresh, expiresAt } = signRefresh(user.id);
    await refreshTokenRepo.create({ userId: user.id, token: newRefresh, expiresAt });
    return { accessToken, refreshToken: newRefresh };
  },

  async logout(token, userId, ip) {
    await refreshTokenRepo.revokeAllForUser(userId);
    await auditRepo.create({ action: 'auth.logout', actorId: userId, targetId: userId, ip, metadata: {} });
  },
};
