const auditLogs = require('../db/auditLogs');

/**
 * Writes an audit entry. Never throws — a logging failure must not break the
 * user's request.
 */
async function record(req, { action, entityType, entityId = null, reason = '', metadata = {} }) {
  try {
    await auditLogs.create({
      actor: req.user?._id || null,
      actorName: req.user?.name || 'guest',
      action,
      entityType,
      entityId,
      reason,
      metadata,
      ip: (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim(),
    });
  } catch (err) {
    console.warn('[audit] failed to write entry:', err.message);
  }
}

module.exports = { record };
