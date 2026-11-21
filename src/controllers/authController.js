const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const users = require('../db/users');
const resets = require('../db/passwordResets');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { signToken } = require('../utils/token');

/** POST /api/v1/auth/register - public */
const register = asyncHandler(async (req, res) => {
  const { name, email, password, department, phone } = req.body;

  const exists = await users.findUserForLogin(email);
  if (exists) throw new ApiError(409, 'An account with this email already exists');

  const hash = await bcrypt.hash(password, 10);
  // role is intentionally NOT taken from the request body (no self-promotion to admin)
  const user = await users.createUser({ name, email, password: hash, role: 'student', department, phone });

  const token = signToken(user);
  res.status(201).json({ success: true, message: 'Registration successful', token, user });
});

/** POST /api/v1/auth/login - public */
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const row = await users.findUserForLogin(email);
  if (!row) throw new ApiError(401, 'Invalid email or password');
  if (!row.is_active) throw new ApiError(403, 'This account has been disabled');

  const ok = await bcrypt.compare(password, row.password);
  if (!ok) throw new ApiError(401, 'Invalid email or password');

  const user = (await users.findUserById(row.id));
  const token = signToken(user);
  res.json({ success: true, message: 'Login successful', token, user });
});

/** GET /api/v1/auth/me - protected */
const getMe = asyncHandler(async (req, res) => {
  res.json({ success: true, user: req.user });
});

/** PATCH /api/v1/auth/me - protected */
const updateMe = asyncHandler(async (req, res) => {
  const user = await users.updateUser(req.user._id, {
    name: req.body.name,
    department: req.body.department,
    phone: req.body.phone,
  });
  res.json({ success: true, message: 'Profile updated', user });
});

/**
 * POST /api/v1/auth/forgot-password
 * Always answers the same way, so the endpoint cannot be used to discover which
 * addresses have accounts. In development the token is returned in the response so the
 * flow is testable without an email server; in production it is only written to the log.
 */
const forgotPassword = asyncHandler(async (req, res) => {
  const email = String(req.body.email || '').trim();
  if (!email) throw new ApiError(400, 'Email is required');

  const row = await users.findUserForLogin(email);
  let devToken;

  if (row && row.is_active) {
    const { token, expiresAt } = await resets.issue(row.id);
    console.log(`[auth] password reset requested for ${email}; link expires ${expiresAt.toISOString()}`);
    if (process.env.NODE_ENV !== 'production') devToken = token;
  }

  res.json({
    success: true,
    message: 'If that address has an account, a reset link is on its way. It expires in 30 minutes.',
    ...(devToken ? { devToken } : {}),
  });
});

/** POST /api/v1/auth/reset-password  { token, password } */
const resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) throw new ApiError(400, 'The reset token and a new password are required');
  if (String(password).length < 8) throw new ApiError(400, 'Password must be at least 8 characters');

  const row = await resets.findValid(token);
  if (!row) throw new ApiError(400, 'This reset link is invalid or has expired. Please request a new one.');

  const hash = await bcrypt.hash(String(password), 10);
  await users.updatePassword(row.user_id, hash);
  await resets.markUsed(row.id);

  res.json({ success: true, message: 'Password updated. You can sign in now.' });
});

/** POST /api/v1/auth/logout - protected (stateless JWT: the client drops the token) */
const logout = asyncHandler(async (req, res) => {
  res.json({ success: true, message: 'Logged out successfully' });
});

module.exports = { register, login, getMe, updateMe, logout, forgotPassword, resetPassword };
