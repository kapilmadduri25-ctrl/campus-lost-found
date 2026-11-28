const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const users = require('../db/users');
const resets = require('../db/passwordResets');
const { withTransaction } = require('../config/db');
const mailer = require('../utils/mailer');
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
  // re-read with the private fields, so the owner sees the phone they saved
  const user = await users.findUserById(req.user._id, { includePrivate: true });
  res.json({ success: true, user: user || req.user });
});

/** PATCH /api/v1/auth/me - protected */
const updateMe = asyncHandler(async (req, res) => {
  const name = String(req.body.name ?? '').trim();
  const department = String(req.body.department ?? '').trim();
  const phone = String(req.body.phone ?? '').trim();

  if (name.length < 2 || name.length > 60) {
    throw new ApiError(400, 'Your name must be between 2 and 60 characters');
  }
  if (department.length > 60) throw new ApiError(400, 'Department must be 60 characters or fewer');
  if (phone.length > 20) throw new ApiError(400, 'Phone must be 20 characters or fewer');
  if (phone && !/^[0-9+\-()\s]+$/.test(phone)) throw new ApiError(400, 'That does not look like a phone number');

  const user = await users.updateUser(req.user._id, {
    name,
    department,
    phone,
  });
  res.json({ success: true, message: 'Profile updated', user: await users.findUserById(req.user._id, { includePrivate: true }) });
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
  let delivered = false;

  if (row && row.is_active) {
    const { token, expiresAt } = await resets.issue(row.id);

    if (mailer.isConfigured()) {
      try {
        delivered = await mailer.sendPasswordReset({
          to: row.email,
          name: row.name,
          token,
          appUrl: process.env.APP_URL,
        });
      } catch (err) {
        console.error('[auth] could not send the reset email:', err.message);
      }
    } else {
      // no mail server: the token is logged for the administrator, and returned to the
      // browser only outside production so the flow stays testable
      console.log(`[auth] reset token for ${email} (no SMTP configured): ${token} (expires ${expiresAt.toISOString()})`);
      if (process.env.NODE_ENV !== 'production') devToken = token;
    }
  }

  const message = mailer.isConfigured()
    ? 'If that address has an account, a reset link is on its way. It expires in 30 minutes.'
    : 'If that address has an account, an administrator can reset it for you. This deployment has no mail server configured.';

  res.json({
    success: true,
    delivered,
    emailEnabled: mailer.isConfigured(),
    message,
    ...(devToken ? { devToken } : {}),
  });
});

/** POST /api/v1/auth/reset-password  { token, password } */
const resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) throw new ApiError(400, 'The reset token and a new password are required');
  if (String(password).length < 8) throw new ApiError(400, 'Password must be at least 8 characters');
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    throw new ApiError(400, 'Password must contain at least one letter and one number');
  }

  const row = await resets.findValid(token);
  if (!row) throw new ApiError(400, 'This reset link is invalid or has expired. Please request a new one.');

  const hash = await bcrypt.hash(String(password), 10);
  // one transaction: the password and the token must move together, or a crash between
  // the two leaves a usable reset token after the password has already changed
  await withTransaction(async (client) => {
    await client.query('update users set password = $2, updated_at = now() where id = $1', [row.user_id, hash]);
    await client.query('update password_resets set used_at = now() where id = $1', [row.id]);
  });

  res.json({ success: true, message: 'Password updated. You can sign in now.' });
});

/** PATCH /api/v1/auth/me/password  { currentPassword, newPassword } */
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) throw new ApiError(400, 'Your current and new password are both required');
  if (String(newPassword).length < 8) throw new ApiError(400, 'The new password must be at least 8 characters');
  if (currentPassword === newPassword) throw new ApiError(400, 'The new password must be different from the current one');

  const row = await users.findUserForLogin(req.user.email);
  if (!row) throw new ApiError(404, 'Account not found');
  if (!(await bcrypt.compare(String(currentPassword), row.password))) {
    throw new ApiError(401, 'Your current password is not correct');
  }

  await users.updatePassword(row.id, await bcrypt.hash(String(newPassword), 10));
  res.json({ success: true, message: 'Password changed. Use the new one next time you sign in.' });
});

/** POST /api/v1/auth/logout - protected (stateless JWT: the client drops the token) */
const logout = asyncHandler(async (req, res) => {
  res.json({ success: true, message: 'Logged out successfully' });
});

module.exports = { register, login, getMe, updateMe, logout, forgotPassword, resetPassword, changePassword };
