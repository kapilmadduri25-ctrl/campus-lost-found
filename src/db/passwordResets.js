const crypto = require('crypto');
const { query } = require('../config/db');

const TTL_MINUTES = 30;

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

/** Creates a token for a user and returns the RAW token (only ever sent once). */
async function issue(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + TTL_MINUTES * 60 * 1000);

  // any earlier token for this user becomes invalid
  await query('delete from password_resets where user_id = $1 and used_at is null', [userId]);
  await query(
    `insert into password_resets (id, user_id, token_hash, expires_at)
     values ($1, $2, $3, $4)`,
    [crypto.randomUUID(), userId, hashToken(token), expiresAt]
  );

  return { token, expiresAt };
}

/** Returns the unused, unexpired row for a token, or null. */
async function findValid(token) {
  const { rows } = await query(
    `select id, user_id, expires_at
       from password_resets
      where token_hash = $1 and used_at is null and expires_at > now()
      limit 1`,
    [hashToken(token)]
  );
  return rows[0] || null;
}

async function markUsed(id) {
  await query('update password_resets set used_at = now() where id = $1', [id]);
}

module.exports = { issue, findValid, markUsed, hashToken, TTL_MINUTES };
