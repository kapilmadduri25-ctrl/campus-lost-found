const crypto = require('crypto');

/** Adds a correlation id to every request and echoes it in the response header. */
function requestId(req, res, next) {
  req.id = req.headers['x-request-id'] || crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
}

module.exports = requestId;
