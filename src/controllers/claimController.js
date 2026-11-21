const claims = require('../db/claims');
const items = require('../db/items');
const notifications = require('../db/notifications');
const { withTransaction } = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { record } = require('../utils/audit');
const { mapClaim } = require('../db/mappers');

/** POST /api/v1/claims — protected. Private message + optional private proof. */
const createClaim = asyncHandler(async (req, res) => {
  const { itemId, message, proof } = req.body;

  const item = await items.findItemById(itemId);
  if (!item) throw new ApiError(404, 'Item not found');

  if (String(item.reporter?._id) === String(req.user._id)) {
    throw new ApiError(400, 'You cannot claim your own listing');
  }
  if (!['active', 'claim_requested'].includes(item.status)) {
    throw new ApiError(400, `This item is already ${item.status.replace('_', ' ')} and cannot be claimed`);
  }

  const existing = await claims.findByItemAndClaimant(item._id, req.user._id);
  if (existing) throw new ApiError(409, 'You have already submitted a claim for this item');

  let claim;
  try {
    claim = await claims.create({ item: item._id, claimant: req.user._id, message, proof });
  } catch (err) {
    if (err.code === '23505') throw new ApiError(409, 'You have already submitted a claim for this item');
    throw err;
  }

  // the first claim moves the listing to "claim requested"
  if (item.status === 'active') {
    await items.setStatus(item._id, { status: 'claim_requested' });
  }

  await record(req, {
    action: 'claim.created',
    entityType: 'claim',
    entityId: claim._id,
    metadata: { item: item._id, itemTitle: item.title },
  });

  await notifications.create({
    user: item.reporter._id,
    type: 'claim',
    message: `${req.user.name} submitted a claim on your listing "${item.title}"`,
    item: item._id,
    claim: claim._id,
  });

  res.status(201).json({ success: true, message: 'Claim submitted, the finder will review it', claim });
});

/** GET /api/v1/claims/mine */
const getMyClaims = asyncHandler(async (req, res) => {
  const rows = await claims.listByClaimant(req.user._id);
  res.json({ success: true, count: rows.length, claims: rows });
});

/** GET /api/v1/claims/received */
const getReceivedClaims = asyncHandler(async (req, res) => {
  const rows = await claims.listForItemOwner(req.user._id);
  res.json({ success: true, count: rows.length, claims: rows });
});

/**
 * PATCH /api/v1/claims/:id — the item owner (or an admin) approves, rejects or
 * asks for more information. Runs in a transaction: the claim, the item status
 * and the rival claims all move together.
 */
const decideClaim = asyncHandler(async (req, res) => {
  const { status, decisionNote } = req.body;
  if (!['approved', 'rejected', 'info_requested'].includes(status)) {
    throw new ApiError(400, "status must be 'approved', 'rejected' or 'info_requested'");
  }

  const found = await claims.findWithItem(req.params.id);
  if (!found) throw new ApiError(404, 'Claim not found');

  const { claim, item } = found;
  const isItemOwner = String(item.reporter) === String(req.user._id);
  if (!isItemOwner && req.user.role !== 'admin') {
    throw new ApiError(403, 'Only the person who posted the item (or an admin) can decide this claim');
  }

  if (!['pending', 'info_requested'].includes(claim.status)) {
    throw new ApiError(409, `This claim has already been ${claim.status}`);
  }

  const decided = await withTransaction(async (client) => {
    // 1. the claim must still be undecided (guards against a double decision)
    const claimUpdate = await client.query(
      `update claims set status = $2, decision_note = $3, reviewed_by = $4,
              reviewed_at = now(), updated_at = now()
       where id = $1 and status in ('pending', 'info_requested')
       returning *`,
      [claim._id, status, decisionNote || '', req.user._id]
    );
    if (claimUpdate.rowCount === 0) {
      throw new ApiError(409, 'This claim has already been decided');
    }

    if (status === 'approved') {
      // 2. the item must still be open — a rejected/expired listing cannot be
      //    resurrected by approving a claim on it
      const itemUpdate = await client.query(
        `update items set status = 'resolved', resolved_at = now(), updated_at = now()
         where id = $1 and status in ('active', 'claim_requested')
         returning id`,
        [item.id]
      );
      if (itemUpdate.rowCount === 0) {
        throw new ApiError(409, 'This listing is no longer open for claims');
      }

      // 3. every rival claim is closed out
      await client.query(
        `update claims set status = 'rejected', decision_note = $3, reviewed_by = $4,
                reviewed_at = now(), updated_at = now()
         where item = $1 and id <> $2 and status in ('pending', 'info_requested')`,
        [item.id, claim._id, 'Another claim was approved', req.user._id]
      );
    }

    // 4. read back on the SAME connection so the committed values are returned
    return mapClaim(claimUpdate.rows[0]);
  });

  await record(req, {
    action: 'claim.decided',
    entityType: 'claim',
    entityId: claim._id,
    reason: decisionNote || '',
    metadata: { from: claim.status, to: status, item: item.id, itemTitle: item.title },
  });

  await notifications.create({
    user: claim.claimant._id || claim.claimant,
    type: 'decision',
    message:
      status === 'info_requested'
        ? `The owner of "${item.title}" asked for more details on your claim`
        : `Your claim on "${item.title}" was ${status}`,
    item: item.id,
    claim: claim._id,
  });

  res.json({ success: true, message: `Claim ${status.replace('_', ' ')}`, claim: decided });
});

/**
 * PATCH /api/v1/claims/:id/reply — the claimant answers a request for more
 * information. Only valid while the owner has asked (status info_requested);
 * the claim returns to pending so the owner can decide again.
 */
const replyToInfoRequest = asyncHandler(async (req, res) => {
  const { message, proof } = req.body;
  if (!message || String(message).trim().length < 10) {
    throw new ApiError(400, 'Please give at least 10 characters explaining the claim');
  }

  const claim = await claims.findById(req.params.id);
  if (!claim) throw new ApiError(404, 'Claim not found');
  if (String(claim.claimant) !== String(req.user._id)) {
    throw new ApiError(403, 'Only the claimant can reply to this request');
  }
  if (claim.status !== 'info_requested') {
    throw new ApiError(400, 'This claim is not waiting for more information');
  }

  const updated = await claims.reviseMessage(claim._id, { message, proof });
  const found = await claims.findWithItem(claim._id);

  await record(req, {
    action: 'claim.replied',
    entityType: 'claim',
    entityId: claim._id,
    metadata: { item: found.item.id, itemTitle: found.item.title },
  });

  await notifications.create({
    user: found.item.reporter,
    type: 'claim',
    message: `${req.user.name} answered your request for details on "${found.item.title}"`,
    item: found.item.id,
    claim: claim._id,
  });

  res.json({ success: true, message: 'Reply sent to the finder', claim: updated });
});

/** DELETE /api/v1/claims/:id — the claimant withdraws a pending claim. */
const withdrawClaim = asyncHandler(async (req, res) => {
  const claim = await claims.findById(req.params.id);
  if (!claim) throw new ApiError(404, 'Claim not found');

  const isClaimant = String(claim.claimant) === String(req.user._id);
  if (!isClaimant && req.user.role !== 'admin') throw new ApiError(403, 'Not allowed');

  if (claim.status === 'approved' && req.user.role !== 'admin') {
    throw new ApiError(400, 'An approved claim cannot be withdrawn');
  }

  await record(req, { action: 'claim.withdrawn', entityType: 'claim', entityId: claim._id });
  await claims.remove(claim._id);

  res.json({ success: true, message: 'Claim withdrawn' });
});

module.exports = { createClaim, getMyClaims, getReceivedClaims, decideClaim, replyToInfoRequest, withdrawClaim };
