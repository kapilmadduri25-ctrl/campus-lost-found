const crypto = require('crypto');
const { query } = require('../config/db');
const { mapClaim } = require('./mappers');

const CLAIM_SELECT = 'c.id, c.item, c.claimant, c.message, c.proof, c.status, c.decision_note, c.reviewed_by, c.reviewed_at, c.created_at, c.updated_at';

async function create({ item, claimant, message, proof = '' }) {
  const { rows } = await query(
    `insert into claims (id, item, claimant, message, proof)
     values ($1, $2, $3, $4, $5)
     returning id`,
    [crypto.randomUUID(), item, claimant, message, proof]
  );
  return findById(rows[0].id);
}

async function findById(id) {
  const { rows } = await query(`select ${CLAIM_SELECT} from claims c where c.id = $1`, [id]);
  return rows[0] ? mapClaim(rows[0]) : null;
}

async function findByItemAndClaimant(item, claimant) {
  const { rows } = await query('select id from claims where item = $1 and claimant = $2', [item, claimant]);
  return rows[0] || null;
}

/** Claims I submitted, with the item summary the dashboard shows. */
async function listByClaimant(claimantId) {
  const { rows } = await query(
    `select ${CLAIM_SELECT},
            i.title as item_title, i.category as item_category, i.type as item_type,
            i.status as item_status, i.location as item_location, i.reference as item_reference,
            i.image_url as item_image_url
     from claims c left join items i on i.id = c.item
     where c.claimant = $1 order by c.created_at desc`,
    [claimantId]
  );
  return rows.map((r) => mapClaim(r));
}

/** Claims on my listings, with the claimant's contact details. */
async function listForItemOwner(ownerId) {
  const { rows } = await query(
    `select ${CLAIM_SELECT},
            u.name as claimant_name, u.email as claimant_email,
            u.department as claimant_department, u.phone as claimant_phone,
            i.title as item_title, i.category as item_category, i.type as item_type,
            i.status as item_status, i.reference as item_reference
     from claims c
     join items i on i.id = c.item
     join users u on u.id = c.claimant
     where i.reporter = $1 order by c.created_at desc`,
    [ownerId]
  );
  return rows.map((r) => mapClaim(r));
}

/** One claim plus the item row needed for the ownership check. */
async function findWithItem(id) {
  const { rows } = await query(
    `select ${CLAIM_SELECT}, i.reporter as item_reporter, i.title as item_title, i.id as item_id
     from claims c join items i on i.id = c.item where c.id = $1`,
    [id]
  );
  if (!rows[0]) return null;
  const row = rows[0];
  return {
    claim: mapClaim(row),
    item: { id: row.item_id, reporter: row.item_reporter, title: row.item_title },
  };
}

async function setDecision(id, { status, decisionNote = '', reviewedBy }) {
  await query(
    `update claims set status = $2, decision_note = $3, reviewed_by = $4,
            reviewed_at = now(), updated_at = now()
     where id = $1`,
    [id, status, decisionNote, reviewedBy]
  );
  return findById(id);
}

async function rejectOthers(itemId, exceptId, reviewedBy, note) {
  await query(
    `update claims set status = 'rejected', decision_note = $3, reviewed_by = $4,
            reviewed_at = now(), updated_at = now()
     where item = $1 and id <> $2 and status = 'pending'`,
    [itemId, exceptId, note, reviewedBy]
  );
}

async function remove(id) {
  await query('delete from claims where id = $1', [id]);
}

/* ------------------------------- counters ------------------------------- */
async function countForItem(itemId) {
  const { rows } = await query('select count(*)::int as count from claims where item = $1', [itemId]);
  return rows[0].count;
}

async function countAll() {
  const { rows } = await query('select count(*)::int as count from claims');
  return rows[0].count;
}

async function countByStatus(status) {
  const { rows } = await query('select count(*)::int as count from claims where status = $1', [status]);
  return rows[0].count;
}

async function countForItemOwner(ownerId, status) {
  const params = [ownerId];
  let sql = 'select count(*)::int as count from claims c join items i on i.id = c.item where i.reporter = $1';
  if (status) {
    params.push(status);
    sql += ' and c.status = $2';
  }
  const { rows } = await query(sql, params);
  return rows[0].count;
}

async function countForClaimant(claimantId) {
  const { rows } = await query('select count(*)::int as count from claims where claimant = $1', [claimantId]);
  return rows[0].count;
}

async function listAll({ status } = {}) {
  const params = [];
  let where = '';
  if (status) {
    params.push(status);
    where = 'where c.status = $1';
  }
  const { rows } = await query(
    `select ${CLAIM_SELECT},
            u.name as claimant_name, u.email as claimant_email,
            i.title as item_title, i.category as item_category, i.type as item_type,
            i.status as item_status, i.reference as item_reference
     from claims c
     join items i on i.id = c.item
     join users u on u.id = c.claimant
     ${where}
     order by c.created_at desc limit 100`,
    params
  );
  return rows.map((r) => mapClaim(r));
}

module.exports = {
  create,
  findById,
  findByItemAndClaimant,
  listByClaimant,
  listForItemOwner,
  findWithItem,
  setDecision,
  rejectOthers,
  remove,
  countAll,
  countForItem,
  countByStatus,
  countForItemOwner,
  countForClaimant,
  listAll,
};
