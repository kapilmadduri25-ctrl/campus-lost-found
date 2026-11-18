const crypto = require('crypto');
const { query } = require('../config/db');
const { mapNotification } = require('./mappers');

async function create({ user, type = 'status', message, item = null, claim = null }) {
  const { rows } = await query(
    `insert into notifications (id, user_id, type, message, item, claim)
     values ($1, $2, $3, $4, $5, $6) returning *`,
    [crypto.randomUUID(), user, type, message, item, claim]
  );
  return mapNotification(rows[0]);
}

async function createMany(list) {
  if (!list.length) return [];
  const values = [];
  const params = [];
  list.forEach((n) => {
    const base = params.length;
    params.push(crypto.randomUUID(), n.user, n.type || 'duplicate', n.message, n.item || null, n.claim || null);
    values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`);
  });
  const { rows } = await query(
    `insert into notifications (id, user_id, type, message, item, claim) values ${values.join(', ')} returning *`,
    params
  );
  return rows.map((r) => mapNotification(r));
}

async function listByUser(userId, limit = 50) {
  const { rows } = await query(
    'select * from notifications where user_id = $1 order by created_at desc limit $2',
    [userId, limit]
  );
  return rows.map((r) => mapNotification(r));
}

async function unreadCount(userId) {
  const { rows } = await query(
    'select count(*)::int as count from notifications where user_id = $1 and read = false',
    [userId]
  );
  return rows[0].count;
}

async function markRead(id, userId) {
  const { rows } = await query(
    'update notifications set read = true where id = $1 and user_id = $2 returning *',
    [id, userId]
  );
  return rows[0] ? mapNotification(rows[0]) : null;
}

async function markAllRead(userId) {
  await query('update notifications set read = true where user_id = $1 and read = false', [userId]);
}

async function removeForItem(itemId) {
  await query('delete from notifications where item = $1', [itemId]);
}

module.exports = { create, createMany, listByUser, unreadCount, markRead, markAllRead, removeForItem };
