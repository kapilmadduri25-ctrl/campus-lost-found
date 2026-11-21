const express = require('express');
const { getMyNotifications, markRead, markAllRead } = require('../controllers/notificationController');
const { validateParamId } = require('../middleware/validate');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.param('id', validateParamId);

router.use(protect);
router.get('/', getMyNotifications);
router.patch('/read-all', markAllRead);
router.patch('/:id/read', markRead);

module.exports = router;
