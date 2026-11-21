const express = require('express');
const {
  createClaim,
  getMyClaims,
  getReceivedClaims,
  decideClaim,
  replyToInfoRequest,
  withdrawClaim,
} = require('../controllers/claimController');
const { protect } = require('../middleware/auth');
const { validateClaim } = require('../middleware/validate');

const router = express.Router();

router.post('/', protect, validateClaim, createClaim);
router.get('/mine', protect, getMyClaims);
router.get('/received', protect, getReceivedClaims);
router.patch('/:id/reply', protect, replyToInfoRequest); // claimant answers an info request
router.patch('/:id', protect, decideClaim);
router.delete('/:id', protect, withdrawClaim);

module.exports = router;
