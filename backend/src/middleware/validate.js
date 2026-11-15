import { Errors } from '../utils/errors.js';
export const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) return next(Errors.VALIDATION(result.error.flatten().fieldErrors));
  req.body = result.data;
  next();
};
