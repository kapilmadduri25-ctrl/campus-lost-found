const items = require('../db/items');
const claims = require('../db/claims');
const users = require('../db/users');
const notifications = require('../db/notifications');
const auditLogs = require('../db/auditLogs');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { record } = require('../utils/audit');

/** GET /api/v1/admin/stats */
const getStats = asyncHandler(async (req, res) => {
  const [totalItems, totalUsers, totalClaims, pendingClaims, pendingModeration, byStatus, byCategory, byType, byDay, recent] =
    await Promise.all([
      items.countItems(),
      users.countUsers(),
      claims.countAll(),
      claims.countByStatus('pending'),
      items.findItems({ statuses: ['pending'], limit: 1 }).then((r) => r.total),
      items.countBy('status'),
      items.countBy('category'),
      items.countBy('type'),
      items.countByDay(7),
      items.recentItems(5),
    ]);

  const resolved = byStatus.find((s) => s._id === 'resolved')?.count || 0;

  res.json({
    success: true,
    stats: {
      totals: { items: totalItems, users: totalUsers, claims: totalClaims, pendingClaims, pendingModeration },
      byStatus,
      byCategory,
      byType,
      last7Days: byDay,
      recoveryRate: totalItems ? Math.round((resolved / totalItems) * 100) : 0,
    },
    recentItems: recent,
  });
});

/** GET /api/v1/admin/items — every listing, any status. */
const getAllItems = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));

  const statuses = req.query.status ? [req.query.status] : items.ALL_STATUSES;
  const { items: rows, total } = await items.findItems({ statuses, type: req.query.type, page, limit, sort: 'newest' });

  res.json({ success: true, total, page, pages: Math.ceil(total / limit) || 1, items: rows });
});

/** GET /api/v1/admin/reports?status=pending — the moderation queue. */
const getModerationQueue = asyncHandler(async (req, res) => {
  const status = req.query.status || 'pending';
  const { items: rows } = await items.findItems({ statuses: [status], limit: 100, sort: 'oldest' });
  res.json({ success: true, status, count: rows.length, items: rows });
});

/**
 * PATCH /api/v1/admin/reports/:id
 * Body: { action: 'approve' | 'restore' | 'hide' | 'reject' | 'expire', reason }
 */
const moderateItem = asyncHandler(async (req, res) => {
  const { action, reason } = req.body;
  const map = { approve: 'active', restore: 'active', hide: 'rejected', reject: 'rejected', expire: 'expired' };

  if (!map[action]) throw new ApiError(400, 'action must be one of: approve, restore, hide, reject, expire');
  if (['hide', 'reject', 'expire'].includes(action) && !String(reason || '').trim()) {
    throw new ApiError(400, 'A reason is required when hiding, rejecting or expiring a listing');
  }

  const existing = await items.findItemById(req.params.id);
  if (!existing) throw new ApiError(404, 'Item not found');

  const item = await items.setStatus(existing._id, {
    status: map[action],
    moderationReason: action === 'approve' || action === 'restore' ? '' : String(reason).trim(),
    moderatedBy: req.user._id,
    moderatedAt: new Date(),
  });

  await record(req, {
    action: 'item.moderated',
    entityType: 'item',
    entityId: item._id,
    reason: item.moderationReason,
    metadata: { moderation: action, from: existing.status, to: item.status, title: item.title },
  });

  await notifications.create({
    user: existing.reporter._id,
    type: 'status',
    message:
      action === 'approve' || action === 'restore'
        ? `Your listing "${item.title}" is now live`
        : `Your listing "${item.title}" was ${action === 'expire' ? 'archived' : 'hidden'}${item.moderationReason ? `: ${item.moderationReason}` : ''}`,
    item: item._id,
  });

  res.json({ success: true, message: `Listing ${action}d`, item });
});

/** GET /api/v1/admin/claims */
const getAllClaims = asyncHandler(async (req, res) => {
  const rows = await claims.listAll({ status: req.query.status });
  res.json({ success: true, count: rows.length, claims: rows });
});

/** GET /api/v1/admin/users */
const getAllUsers = asyncHandler(async (req, res) => {
  const rows = await users.listUsers();
  res.json({ success: true, count: rows.length, users: rows });
});

/** PATCH /api/v1/admin/users/:id/role */
const setUserRole = asyncHandler(async (req, res) => {
  const { role } = req.body;
  if (!['student', 'admin'].includes(role)) throw new ApiError(400, "role must be 'student' or 'admin'");
  if (String(req.params.id) === String(req.user._id)) throw new ApiError(400, 'You cannot change your own role');

  const user = await users.setRole(req.params.id, role);
  if (!user) throw new ApiError(404, 'User not found');

  await record(req, {
    action: 'user.role_changed',
    entityType: 'user',
    entityId: user._id,
    metadata: { to: role, email: user.email },
  });

  res.json({ success: true, message: `Role updated to ${role}`, user });
});

/** PATCH /api/v1/admin/users/:id/status — suspend or reactivate an account. */
const setUserStatus = asyncHandler(async (req, res) => {
  const { isActive } = req.body;
  if (typeof isActive !== 'boolean') throw new ApiError(400, 'isActive must be true or false');
  if (String(req.params.id) === String(req.user._id)) throw new ApiError(400, 'You cannot suspend your own account');

  const user = await users.setActive(req.params.id, isActive);
  if (!user) throw new ApiError(404, 'User not found');

  await record(req, {
    action: isActive ? 'user.reactivated' : 'user.suspended',
    entityType: 'user',
    entityId: user._id,
    reason: req.body.reason || '',
    metadata: { email: user.email },
  });

  res.json({ success: true, message: isActive ? 'Account reactivated' : 'Account suspended', user });
});

/** GET /api/v1/admin/audit */
const getAuditLogs = asyncHandler(async (req, res) => {
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 60));
  const logs = await auditLogs.list(limit);
  res.json({ success: true, count: logs.length, logs });
});

/** DELETE /api/v1/admin/items/:id */
const adminDeleteItem = asyncHandler(async (req, res) => {
  const item = await items.findItemById(req.params.id);
  if (!item) throw new ApiError(404, 'Item not found');

  await record(req, {
    action: 'item.deleted',
    entityType: 'item',
    entityId: item._id,
    reason: req.body.reason || 'admin delete',
    metadata: { title: item.title, by: 'admin' },
  });

  await items.deleteItem(item._id);
  res.json({ success: true, message: 'Listing removed by admin' });
});

module.exports = {
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
};
