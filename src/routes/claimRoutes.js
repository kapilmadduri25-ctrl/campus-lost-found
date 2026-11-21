const express = require('express');
const rateLimit = require('express-rate-limit');
const {
  createClaim,
  getMyClaims,
  getReceivedClaims,
  decideClaim,
  replyToInfoRequest,
  withdrawClaim,
} = require('../controllers/claimController');
const { validateParamId } = require('../middleware/validate');
const { protect } = require('../middleware/auth');
const { validateClaim } = require('../middleware/validate');

const router = express.Router();

router.param('id', validateParamId);

// and 40 claims per hour, which is far more than a genuine student needs
const claimLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many claims from this address, please try again later' } },
});

router.post('/', protect, claimLimiter, validateClaim, createClaim);
router.get('/mine', protect, getMyClaims);
router.get('/received', protect, getReceivedClaims);
router.patch('/:id/reply', protect, replyToInfoRequest); // claimant answers an info request
router.patch('/:id', protect, decideClaim);
router.delete('/:id', protect, withdrawClaim);

module.exports = router;
