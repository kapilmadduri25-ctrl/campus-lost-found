const crypto = require('crypto');
const { query } = require('../config/db');

/** Records a flag; the unique index makes a second flag by the same user a 409. */
async function create({ itemId, userId, reason }) {
  const { rows } = await query(
    `insert into item_flags (id, item_id, user_id, reason) values ($1, $2, $3, $4)
     returning id, item_id, user_id, reason, created_at`,
    [crypto.randomUUID(), itemId, userId, reason]
  );
  return rows[0];
}

async function countForItem(itemId) {
  const { rows } = await query('select count(*)::int as count from item_flags where item_id = $1', [itemId]);
  return rows[0].count;
}

/** { itemId: count } for a page of listings, in one query. */
async function countsForItems(itemIds) {
  if (!itemIds.length) return {};
  const placeholders = itemIds.map((_, i) => `$${i + 1}`).join(', ');
  const { rows } = await query(
    `select item_id, count(*)::int as count from item_flags
      where item_id in (${placeholders}) group by item_id`,
    itemIds
  );
  return Object.fromEntries(rows.map((r) => [r.item_id, r.count]));
}

module.exports = { create, countForItem, countsForItems };
