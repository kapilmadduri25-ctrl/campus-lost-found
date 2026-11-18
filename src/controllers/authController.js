const bcrypt = require('bcryptjs');
const users = require('../db/users');
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

/** POST /api/v1/auth/logout - protected (stateless JWT: the client drops the token) */
const logout = asyncHandler(async (req, res) => {
  res.json({ success: true, message: 'Logged out successfully' });
});

module.exports = { register, login, getMe, updateMe, logout };
