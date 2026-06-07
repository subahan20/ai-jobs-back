/**
 * Centralized global error handling middleware.
 */
export const errorHandler = (err, req, res, next) => {
  console.error('[Unhandled Server Error]:', err);

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  res.status(statusCode).json({
    success: false,
    status: statusCode,
    message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
};
