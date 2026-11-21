const fs = require('fs');
const path = require('path');
const items = require('../db/items');
const claims = require('../db/claims');
const notifications = require('../db/notifications');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { findPossibleMatches } = require('../utils/findMatches');
const { withTransaction } = require('../config/db');
const { mapItem } = require('../db/mappers');
const flags = require('../db/flags');
const { record } = require('../utils/audit');

// what an anonymous visitor may see in search results
const PUBLIC_STATUSES = ['active', 'claim_requested'];
const PUBLIC_DETAIL_STATUSES = [...PUBLIC_STATUSES, 'resolved'];
const ALL_STATUSES = items.ALL_STATUSES;

/** Parses a date query param, rejecting anything that is not a real date. */
function parseDate(value, field) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new ApiError(400, `${field} must be a valid date`);
  return date;
}

/** The private proof field must never travel in a response body. */
function withoutPrivate(item) {
  const { descriptionPrivate, ...rest } = item;
  return rest;
}

/** GET /api/v1/items — public search, filters, sort and pagination. */
const getItems = asyncHandler(async (req, res) => {
  const { search, category, location, type, status, sort = 'newest', from, to } = req.query;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 9));

  const isAdmin = req.user?.role === 'admin';
  let statuses = PUBLIC_STATUSES;

  if (status) {
    const allowed = isAdmin ? ALL_STATUSES : PUBLIC_DETAIL_STATUSES;
    statuses = allowed.includes(status) ? [status] : PUBLIC_STATUSES;
  }

  const { items: rows, total } = await items.findItems({
    search: search ? String(search).trim() : undefined,
    category,
    location,
    type,
    statuses,
    from: parseDate(from, 'from'),
    to: parseDate(to, 'to'),
    sort,
    page,
    limit,
  });

  res.json({
    success: true,
    count: rows.length,
    total,
    page,
    pages: Math.ceil(total / limit) || 1,
    items: rows,
  });
});

/** GET /api/v1/items/:id — public, with private fields for the owner and admins. */
const getItemById = asyncHandler(async (req, res) => {
  const base = await items.findItemById(req.params.id);
  if (!base) throw new ApiError(404, 'Item not found');

  const isOwner = req.user && String(req.user._id) === String(base.reporter?._id);
  const isAdmin = req.user?.role === 'admin';
  const privileged = Boolean(isOwner || isAdmin);

  if (!PUBLIC_DETAIL_STATUSES.includes(base.status) && !privileged) {
    throw new ApiError(404, 'Item not found');
  }

  await items.incrementViews(base._id);

  const item = privileged ? await items.findItemById(base._id, { includePrivate: true }) : base;
  item.views = (item.views || 0) + 1;

  const claimsCount = await claims.countForItem(item._id);

  res.json({
    success: true,
    item: { ...item, claimsCount, isOwner: Boolean(isOwner), canClaim: Boolean(req.user) && !isOwner },
  });
});

/** POST /api/v1/items — protected, multipart/form-data with an optional image. */
const createItem = asyncHandler(async (req, res) => {
  const { title, description, descriptionPrivate, category, type, location, dateLostOrFound, contactInfo } = req.body;
  const needsModeration = process.env.REQUIRE_MODERATION === 'true';

  const item = await items.createItem({
    title,
    description,
    descriptionPrivate,
    category,
    type,
    location,
    dateLostOrFound: new Date(dateLostOrFound),
    contactInfo,
    reporter: req.user._id,
    status: needsModeration ? 'pending' : 'active',
    imageUrl: req.file ? `/uploads/${req.file.filename}` : '',
  });

  await record(req, {
    action: 'item.created',
    entityType: 'item',
    entityId: item._id,
    metadata: { title: item.title, type: item.type, status: item.status },
  });

  // ---- custom feature: possible matches + notifications -------------------
  let matches = [];
  if (item.status === 'active') {
    matches = await findPossibleMatches({ title, description, category, type, excludeId: item._id });
  }

  if (matches.length) {
    await notifications.create({
      user: req.user._id,
      type: 'duplicate',
      message: `${matches.length} possible match${matches.length > 1 ? 'es' : ''} found for "${item.title}"`,
      item: item._id,
    });

    const others = [...new Set(matches.map((m) => String(m.reporter?._id)).filter((id) => id && id !== String(req.user._id)))];
    if (others.length) {
      await notifications.createMany(
        others.map((userId) => ({
          user: userId,
          type: 'duplicate',
          message: `A new ${type} report "${item.title}" may match your listing in ${category}`,
          item: item._id,
        }))
      );
    }
  }

  res.status(201).json({
    success: true,
    message: needsModeration ? 'Report submitted and queued for review' : 'Report submitted successfully',
    reference: item.reference,
    item: withoutPrivate(item),
    possibleMatches: matches,
  });
});

/** PATCH /api/v1/items/:id — owner or admin. */
const updateItem = asyncHandler(async (req, res) => {
  const existing = await items.findItemById(req.params.id, { includePrivate: true });
  if (!existing) throw new ApiError(404, 'Item not found');

  const isOwner = String(existing.reporter?._id) === String(req.user._id);
  if (!isOwner && req.user.role !== 'admin') throw new ApiError(403, 'You can only edit your own listings');

  let imageUrl;
  if (req.file) {
    if (existing.imageUrl) {
      const oldPath = path.join(__dirname, '..', '..', 'public', existing.imageUrl.replace(/^\//, ''));
      fs.promises.unlink(oldPath).catch(() => {});
    }
    imageUrl = `/uploads/${req.file.filename}`;
  }

  const item = await items.updateItem(req.params.id, {
    title: req.body.title,
    description: req.body.description,
    descriptionPrivate: req.body.descriptionPrivate,
    category: req.body.category,
    type: req.body.type,
    location: req.body.location,
    dateLostOrFound: req.body.dateLostOrFound ? new Date(req.body.dateLostOrFound) : undefined,
    contactInfo: req.body.contactInfo,
    imageUrl,
  });

  await record(req, {
    action: 'item.updated',
    entityType: 'item',
    entityId: item._id,
    metadata: { fields: Object.keys(req.body) },
  });

  res.json({ success: true, message: 'Listing updated', item: withoutPrivate(item) });
});

/** PATCH /api/v1/items/:id/status — owner resolves; admin may set anything. */
const updateStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!ALL_STATUSES.includes(status)) throw new ApiError(400, `status must be one of: ${ALL_STATUSES.join(', ')}`);

  const existing = await items.findItemById(req.params.id);
  if (!existing) throw new ApiError(404, 'Item not found');

  const isOwner = String(existing.reporter?._id) === String(req.user._id);
  const isAdmin = req.user.role === 'admin';
  if (!isOwner && !isAdmin) throw new ApiError(403, 'Not allowed to change this listing');

  if (!isAdmin) {
    const ownerTransitions = { active: ['resolved'], claim_requested: ['resolved'], resolved: ['active'] };
    const allowed = ownerTransitions[existing.status] || [];
    if (!allowed.includes(status)) {
      throw new ApiError(403, `You cannot move a listing from ${existing.status} to ${status}`);
    }
  }

  let item;
  if (status === 'resolved') {
    // closing a listing must also close the claims still hanging off it, in one step
    item = await withTransaction(async (client) => {
      const updated = await client.query(
        `update items set status = 'resolved', resolved_at = now(), updated_at = now()
         where id = $1 returning *`,
        [existing._id]
      );
      await client.query(
        `update claims set status = 'rejected', decision_note = $2, reviewed_by = $3,
                reviewed_at = now(), updated_at = now()
         where item = $1 and status in ('pending', 'info_requested')`,
        [existing._id, 'The listing was closed by its owner', req.user._id]
      );
      return mapItem(updated.rows[0], { includePrivate: true });
    });
  } else {
    item = await items.setStatus(existing._id, { status });
  }

  await record(req, {
    action: 'item.status_changed',
    entityType: 'item',
    entityId: item._id,
    reason: req.body.reason || '',
    metadata: { from: existing.status, to: status },
  });

  await notifications.create({
    user: item.reporter._id,
    type: 'status',
    message: `Your listing "${item.title}" is now marked as ${status.replace('_', ' ')}`,
    item: item._id,
  });

  res.json({ success: true, message: `Status updated to ${status}`, item: withoutPrivate(item) });
});

/**
 * POST /api/v1/items/:id/flag  { reason }
 * A student reports a listing as wrong, abusive or a duplicate. Flags never change the
 * listing themselves - an admin reviews them from the moderation queue.
 */
const flagItem = asyncHandler(async (req, res) => {
  const reason = String(req.body.reason || '').trim();
  if (reason.length < 5) throw new ApiError(400, 'Please say briefly what is wrong with this listing');

  const item = await items.findItemById(req.params.id);
  if (!item) throw new ApiError(404, 'Item not found');
  if (String(item.reporter?._id) === String(req.user._id)) {
    throw new ApiError(400, 'You cannot report your own listing');
  }

  await flags.create({ itemId: item._id, userId: req.user._id, reason });
  await record(req, {
    action: 'item.flagged',
    entityType: 'item',
    entityId: item._id,
    reason,
    metadata: { itemTitle: item.title },
  });

  res.status(201).json({ success: true, message: 'Thank you - an administrator will review this listing.' });
});

/** DELETE /api/v1/items/:id — owner or admin. Claims and notifications cascade. */
const deleteItem = asyncHandler(async (req, res) => {
  const item = await items.findItemById(req.params.id);
  if (!item) throw new ApiError(404, 'Item not found');

  const isOwner = String(item.reporter?._id) === String(req.user._id);
  if (!isOwner && req.user.role !== 'admin') throw new ApiError(403, 'You can only delete your own listings');

  if (item.imageUrl) {
    const imgPath = path.join(__dirname, '..', '..', 'public', item.imageUrl.replace(/^\//, ''));
    fs.promises.unlink(imgPath).catch(() => {});
  }

  await record(req, {
    action: 'item.deleted',
    entityType: 'item',
    entityId: item._id,
    metadata: { title: item.title, status: item.status, by: isOwner ? 'owner' : 'admin' },
  });

  await items.deleteItem(item._id);
  res.json({ success: true, message: 'Listing deleted' });
});

/** GET /api/v1/items/user/mine — protected. */
const getMyItems = asyncHandler(async (req, res) => {
  const rows = await items.listByReporter(req.user._id);
  const counts = await items.claimCountsForItems(rows.map((r) => r._id));
  const statusCounts = await items.statusCountsForReporter(req.user._id);

  res.json({
    success: true,
    count: rows.length,
    statusCounts,
    items: rows.map((item) => ({
      ...item,
      claimCount: counts[item._id]?.total || 0,
      pendingClaims: counts[item._id]?.pending || 0,
    })),
  });
});

module.exports = {
  flagItem, getItems, getItemById, createItem, updateItem, updateStatus, deleteItem, getMyItems };
