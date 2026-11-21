const ApiError = require('../utils/ApiError');

/** Any request under /api that reached here matched no route. */
function notFound(req, res, next) {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

/** Central error handler - every error becomes a consistent JSON shape. */
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Something went wrong';
  let details = err.details;

  // ---- PostgreSQL error codes -------------------------------------------
  // 23505 unique violation, 23503 foreign key, 23514 check, 22P02 bad uuid, 22007/22008 bad date
  const PG = {
    '23505': [409, 'CONFLICT', 'That record already exists'],
    '23503': [409, 'CONFLICT', 'A related record is missing'],
    '23514': [400, 'VALIDATION_ERROR', 'A value is not allowed'],
    '22P02': [400, 'VALIDATION_ERROR', 'Invalid identifier'],
    '22007': [400, 'VALIDATION_ERROR', 'Invalid date'],
    '22008': [400, 'VALIDATION_ERROR', 'Invalid date'],
  };
  if (err.code && PG[err.code]) {
    const [code, errorCode, text] = PG[err.code];
    statusCode = code;
    message = text;
    err.errorCode = errorCode;
  }

  if (err.code === 'LIMIT_FILE_SIZE') {
    statusCode = 413;
    message = 'Image is too large (maximum 2 MB)';
  }

  // never leak internals for a server-side failure
  if (statusCode >= 500) {
    if (process.env.NODE_ENV !== 'production') console.error('[error]', err);
    message = 'Something went wrong on the server';
  }

  const code =
    err.errorCode ||
    (statusCode === 400 ? 'VALIDATION_ERROR'
      : statusCode === 401 ? 'UNAUTHENTICATED'
        : statusCode === 403 ? 'FORBIDDEN'
          : statusCode === 404 ? 'NOT_FOUND'
            : statusCode === 409 ? 'CONFLICT'
              : statusCode === 413 ? 'PAYLOAD_TOO_LARGE'
                : statusCode === 429 ? 'RATE_LIMITED'
                  : 'SERVER_ERROR');

  res.status(statusCode).json({
    success: false,
    error: { code, message, ...(details ? { details } : {}) },
    // kept for backwards compatibility with the earlier response shape
    message,
    ...(details ? { details } : {}),
    requestId: req.id || null,
    ...(process.env.NODE_ENV === 'development' ? { stack: err.stack } : {}),
  });
}

module.exports = { notFound, errorHandler };
