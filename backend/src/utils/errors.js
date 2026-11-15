export class AppError extends Error {
  constructor(code, message, statusCode = 400, details = null) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export const Errors = {
  UNAUTHORIZED:    () => new AppError('UNAUTHORIZED',    'Authentication required', 401),
  FORBIDDEN:       () => new AppError('FORBIDDEN',       'Insufficient permissions', 403),
  NOT_FOUND:       (r) => new AppError('NOT_FOUND',      `${r} not found`, 404),
  CONFLICT:        (m) => new AppError('CONFLICT',       m, 409),
  VALIDATION:  (d) => new AppError('VALIDATION_ERROR', 'Validation failed', 422, d),
  INTERNAL:        () => new AppError('INTERNAL_ERROR',  'Internal server error', 500),
};
