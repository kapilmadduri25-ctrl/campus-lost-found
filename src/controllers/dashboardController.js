const items = require('../db/items');
const claims = require('../db/claims');
const notifications = require('../db/notifications');
const asyncHandler = require('../utils/asyncHandler');

/** GET /api/v1/dashboard/summary — one call for the whole dashboard header. */
const getSummary = asyncHandler(async (req, res) => {
  const [byStatus, claimsReceived, claimsSubmitted, awaiting, unread] = await Promise.all([
    items.statusCountsForReporter(req.user._id),
    claims.countForItemOwner(req.user._id),
    claims.countForClaimant(req.user._id),
    claims.countForItemOwner(req.user._id, 'pending'),
    notifications.unreadCount(req.user._id),
  ]);

  res.json({
    success: true,
    summary: {
      myListings: Object.values(byStatus).reduce((a, b) => a + b, 0),
      byStatus,
      claimsReceived,
      claimsSubmitted,
      claimsAwaitingMyDecision: awaiting,
      unreadNotifications: unread,
    },
  });
});

module.exports = { getSummary };
