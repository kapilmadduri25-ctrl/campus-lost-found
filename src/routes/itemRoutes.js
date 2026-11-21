const express = require('express');
const {
  getItems,
  getItemById,
  createItem,
  updateItem,
  updateStatus,
  deleteItem,
  getMyItems,
} = require('../controllers/itemController');
const { protect } = require('../middleware/auth');
const optionalAuth = require('../middleware/optionalAuth');
const { validateItem, validateItemUpdate, validateParamId } = require('../middleware/validate');
const upload = require('../middleware/upload');

const router = express.Router();

router.param('id', validateParamId); // malformed uuid -> 404, never a 500

router.get('/', optionalAuth, getItems);
router.get('/user/mine', protect, getMyItems); // must stay above '/:id'
router.get('/:id', optionalAuth, getItemById);

router.post('/', protect, upload.single('image'), validateItem, createItem);
router.patch('/:id', protect, upload.single('image'), validateItemUpdate, updateItem);
router.patch('/:id/status', protect, updateStatus);
router.delete('/:id', protect, deleteItem);

module.exports = router;
