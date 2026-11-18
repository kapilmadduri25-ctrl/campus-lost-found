const jwt = require('jsonwebtoken');
const users = require('../db/users');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

/** Requires a valid `Authorization: Bearer <token>` header. */
const protect = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    throw new ApiError(401, 'Not authorised: please log in first');
  }

  const token = header.split(' ')[1];
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    throw new ApiError(401, 'Session expired or token invalid, please log in again');
  }

  const user = await users.findUserById(payload.id);
  if (!user || !user.isActive) throw new ApiError(401, 'User no longer exists or is disabled');

  req.user = user;
  next();
});

/** Requires req.user.role === 'admin'. Use after protect. */
function adminOnly(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return next(new ApiError(403, 'Admin access only'));
  }
  next();
}

module.exports = { protect, adminOnly };
