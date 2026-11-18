const notifications = require('../db/notifications');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

/** GET /api/v1/notifications */
const getMyNotifications = asyncHandler(async (req, res) => {
  const [rows, unread] = await Promise.all([
    notifications.listByUser(req.user._id),
    notifications.unreadCount(req.user._id),
  ]);
  res.json({ success: true, count: rows.length, unread, notifications: rows });
});

/** PATCH /api/v1/notifications/:id/read */
const markRead = asyncHandler(async (req, res) => {
  const notification = await notifications.markRead(req.params.id, req.user._id);
  if (!notification) throw new ApiError(404, 'Notification not found');
  res.json({ success: true, notification });
});

/** PATCH /api/v1/notifications/read-all */
const markAllRead = asyncHandler(async (req, res) => {
  await notifications.markAllRead(req.user._id);
  res.json({ success: true, message: 'All notifications marked as read' });
});

module.exports = { getMyNotifications, markRead, markAllRead };
