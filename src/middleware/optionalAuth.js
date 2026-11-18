const jwt = require('jsonwebtoken');
const users = require('../db/users');

/**
 * Attaches req.user when a valid token is present, but never rejects the request.
 */
async function optionalAuth(req, res, next) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return next();

  try {
    const payload = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET);
    const user = await users.findUserById(payload.id);
    if (user && user.isActive) req.user = user;
  } catch {
    /* ignore an invalid token on a public route */
  }
  next();
}

module.exports = optionalAuth;
