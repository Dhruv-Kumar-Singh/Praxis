import { randomUUID } from 'crypto';
export const requestId = (req, res, next) => {
  req.id = randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
};
