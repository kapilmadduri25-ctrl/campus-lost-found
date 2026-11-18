const crypto = require('crypto');
const { query } = require('../config/db');
const { mapAudit } = require('./mappers');

async function create({ actor = null, actorName = 'system', action, entityType, entityId = null, reason = '', metadata = {}, ip = '' }) {
  const { rows } = await query(
    `insert into audit_logs (id, actor, actor_name, action, entity_type, entity_id, reason, metadata, ip)
     values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
     returning *`,
    [crypto.randomUUID(), actor, actorName, action, entityType, entityId, reason, JSON.stringify(metadata), ip]
  );
  return mapAudit(rows[0]);
}

async function list(limit = 60) {
  const { rows } = await query('select * from audit_logs order by created_at desc limit $1', [limit]);
  return rows.map((r) => mapAudit(r));
}

module.exports = { create, list };
