const express = require('express');
const rateLimit = require('express-rate-limit');
const {
  getItems,
  getItemById,
  createItem,
  updateItem,
  updateStatus,
  deleteItem,
  getMyItems,
  flagItem,
} = require('../controllers/itemController');
const { protect } = require('../middleware/auth');
const optionalAuth = require('../middleware/optionalAuth');
const { validateItem, validateItemUpdate, validateParamId } = require('../middleware/validate');
const upload = require('../middleware/upload');

const router = express.Router();

router.param('id', validateParamId);

// a student cannot flood the board: 30 new listings per hour per IP
const writeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many listings from this address, please try again later' } },
}); // malformed uuid -> 404, never a 500

router.get('/', optionalAuth, getItems);
router.get('/user/mine', protect, getMyItems); // must stay above '/:id'
router.get('/:id', optionalAuth, getItemById);

router.post('/', protect, writeLimiter, upload.single('image'), upload.cleanupOnFailure, validateItem, createItem);
router.patch('/:id', protect, upload.single('image'), upload.cleanupOnFailure, validateItemUpdate, updateItem);
router.post('/:id/flag', protect, flagItem);
router.patch('/:id/status', protect, updateStatus);
router.delete('/:id', protect, deleteItem);

module.exports = router;
