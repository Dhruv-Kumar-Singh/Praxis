/** Wraps an async route handler to forward errors to Express error middleware */
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
