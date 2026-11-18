const express = require('express');
const {
  createClaim,
  getMyClaims,
  getReceivedClaims,
  decideClaim,
  withdrawClaim,
} = require('../controllers/claimController');
const { protect } = require('../middleware/auth');
const { validateClaim } = require('../middleware/validate');

const router = express.Router();

router.post('/', protect, validateClaim, createClaim);
router.get('/mine', protect, getMyClaims);
router.get('/received', protect, getReceivedClaims);
router.patch('/:id', protect, decideClaim);
router.delete('/:id', protect, withdrawClaim);

module.exports = router;
