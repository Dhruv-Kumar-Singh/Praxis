import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { Errors } from '../utils/errors.js';

export const auth = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next(Errors.UNAUTHORIZED());
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    if (payload.type !== 'access') return next(Errors.UNAUTHORIZED());
    req.user = payload;
    next();
  } catch {
    next(Errors.UNAUTHORIZED());
  }
};

export const roleGuard = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user?.role)) return next(Errors.FORBIDDEN());
  next();
};
