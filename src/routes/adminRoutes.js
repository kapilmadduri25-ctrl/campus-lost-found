const express = require('express');
const {
  getStats,
  getAllItems,
  getModerationQueue,
  moderateItem,
  getAllClaims,
  getAllUsers,
  setUserRole,
  setUserStatus,
  getAuditLogs,
  adminDeleteItem,
} = require('../controllers/adminController');
const { protect, adminOnly } = require('../middleware/auth');

const router = express.Router();

router.use(protect, adminOnly); // every admin route needs a logged-in admin

router.get('/stats', getStats);
router.get('/items', getAllItems);
router.get('/reports', getModerationQueue);      // moderation queue
router.patch('/reports/:id', moderateItem);      // approve / hide / reject with a reason
router.get('/claims', getAllClaims);
router.get('/users', getAllUsers);
router.patch('/users/:id/role', setUserRole);
router.patch('/users/:id/status', setUserStatus); // suspend / reactivate
router.get('/audit', getAuditLogs);
router.delete('/items/:id', adminDeleteItem);

module.exports = router;
