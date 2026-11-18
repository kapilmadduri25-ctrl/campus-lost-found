const express = require('express');
const rateLimit = require('express-rate-limit');
const { register, login, getMe, updateMe, logout } = require('../controllers/authController');
const { validateRegister, validateLogin } = require('../middleware/validate');
const { protect } = require('../middleware/auth');

const router = express.Router();

// basic brute-force protection on the auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts, please try again in 15 minutes' },
});

router.post('/register', authLimiter, validateRegister, register);
router.post('/login', authLimiter, validateLogin, login);
router.get('/me', protect, getMe);
router.patch('/me', protect, updateMe);
router.post('/logout', protect, logout);

module.exports = router;
