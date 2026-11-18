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

  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation failed';
    details = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
  }

  if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyPattern || { field: 1 })[0];
    message = `A record with that ${field} already exists`;
  }

  if (err.name === 'CastError') {
    statusCode = 400;
    message = `Invalid value for ${err.path}`;
  }

  if (err.code === 'LIMIT_FILE_SIZE') {
    statusCode = 413;
    message = 'Image is too large (maximum 2 MB)';
  }

  if (process.env.NODE_ENV !== 'production' && statusCode >= 500) {
    console.error('[error]', err);
  }

  res.status(statusCode).json({
    success: false,
    error: {
      code: statusCode === 400 ? 'VALIDATION_ERROR' : statusCode === 401 ? 'UNAUTHENTICATED' : statusCode === 403 ? 'FORBIDDEN' : statusCode === 404 ? 'NOT_FOUND' : statusCode === 409 ? 'CONFLICT' : statusCode === 429 ? 'RATE_LIMITED' : 'SERVER_ERROR',
      message,
      ...(details ? { details } : {}),
    },
    // kept for backwards compatibility with the earlier response shape
    message,
    ...(details ? { details } : {}),
    requestId: req.id || null,
    ...(process.env.NODE_ENV === 'production' ? {} : { stack: err.stack }),
  });
}

module.exports = { notFound, errorHandler };
