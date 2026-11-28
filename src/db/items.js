const crypto = require('crypto');
const { query } = require('../config/db');
const { mapItem } = require('./mappers');

const ALL_STATUSES = ['pending', 'active', 'claim_requested', 'resolved', 'rejected', 'expired'];

const SORTS = {
  newest: 'i.created_at desc',
  oldest: 'i.created_at asc',
  date_desc: 'i.date_lost_or_found desc',
  date_asc: 'i.date_lost_or_found asc',
  title: 'lower(i.title) asc',
};

// the reporter fields returned to the client; email/phone only for owner/admin
const REPORTER_PUBLIC = 'u.id as reporter_id, u.name as reporter_name';
const REPORTER_PRIVATE = `${REPORTER_PUBLIC}, u.email as reporter_email, u.department as reporter_department, u.phone as reporter_phone`;

/** Builds "a = $n and b in ($n, $n)" while pushing values in order. */
function buildWhere({ search, category, location, type, statuses, from, to, reporter, excludeId }) {
  const clauses = [];
  const params = [];
  const add = (sql, value) => {
    params.push(value);
    return sql.replace(/\?/g, `$${params.length}`);
  };

  if (category) clauses.push(add('i.category = ?', category));
  if (location) clauses.push(add('i.location = ?', location));
  if (type) clauses.push(add('i.type = ?', type));
  if (reporter) clauses.push(add('i.reporter = ?', reporter));
  if (excludeId) clauses.push(add('i.id <> ?', excludeId));
  if (from) clauses.push(add('i.date_lost_or_found >= ?', from));
  if (to) clauses.push(add('i.date_lost_or_found <= ?', to));

  if (statuses && statuses.length) {
    const placeholders = statuses.map((s) => add('?', s));
    clauses.push(`i.status in (${placeholders.join(', ')})`);
  }

  if (search) {
    const like = `%${search}%`;
    params.push(like);
    const p = `$${params.length}`;
    clauses.push(`(i.title ilike ${p} or i.description ilike ${p} or i.location ilike ${p})`);
  }

  return { where: clauses.length ? `where ${clauses.join(' and ')}` : '', params };
}

/** GET /items — filters + pagination in two queries (count and page). */
async function findItems(filters = {}) {
  const { where, params } = buildWhere(filters);
  const sort = SORTS[filters.sort] || SORTS.newest;
  const limit = filters.limit || 9;
  const offset = ((filters.page || 1) - 1) * limit;

  const listParams = [...params, limit, offset];
  const listSql = `
    select i.*, ${REPORTER_PUBLIC}
    from items i join users u on u.id = i.reporter
    ${where}
    order by ${sort}
    limit $${listParams.length - 1} offset $${listParams.length}`;

  const countSql = `select count(*)::int as total from items i ${where}`;

  const [list, count] = await Promise.all([query(listSql, listParams), query(countSql, params)]);
  return { items: list.rows.map((r) => mapItem(r)), total: count.rows[0].total };
}

async function findItemById(id, { includePrivate = false } = {}) {
  const columns = includePrivate ? `i.*, ${REPORTER_PRIVATE}` : `i.*, ${REPORTER_PUBLIC}`;
  const { rows } = await query(
    `select ${columns} from items i join users u on u.id = i.reporter where i.id = $1`,
    [id]
  );
  return rows[0] ? mapItem(rows[0], { includePrivate }) : null;
}

async function incrementViews(id) {
  await query('update items set views = views + 1 where id = $1', [id]);
}

async function createItem(data) {
  const id = crypto.randomUUID();
  const reference = `LF-${String(new Date().getFullYear()).slice(-2)}-${id.slice(-6).toUpperCase()}`;

  const { rows } = await query(
    `insert into items
       (id, reference, title, description, description_private, category, type, location,
        date_lost_or_found, image_url, contact_info, status, reporter)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     returning id`,
    [
      id,
      reference,
      data.title,
      data.description,
      data.descriptionPrivate || '',
      data.category,
      data.type,
      data.location,
      data.dateLostOrFound,
      data.imageUrl || '',
      data.contactInfo || '',
      data.status || 'active',
      data.reporter,
    ]
  );
  return findItemById(rows[0].id, { includePrivate: true });
}

async function updateItem(id, fields) {
  const allowed = {
    title: 'title',
    description: 'description',
    descriptionPrivate: 'description_private',
    category: 'category',
    type: 'type',
    location: 'location',
    dateLostOrFound: 'date_lost_or_found',
    contactInfo: 'contact_info',
    imageUrl: 'image_url',
    status: 'status',
  };
  const sets = [];
  const params = [];
  Object.entries(fields).forEach(([key, value]) => {
    if (allowed[key] && value !== undefined) {
      params.push(value);
      sets.push(`${allowed[key]} = $${params.length}`);
    }
  });
  if (!sets.length) return findItemById(id, { includePrivate: true });

  params.push(id);
  await query(`update items set ${sets.join(', ')}, updated_at = now() where id = $${params.length}`, params);
  return findItemById(id, { includePrivate: true });
}

/** Status change plus the fields that travel with it. */
async function setStatus(id, { status, resolvedAt = null, moderationReason, moderatedBy, moderatedAt }) {
  const sets = ['status = $2', 'updated_at = now()'];
  const params = [id, status];

  // the timestamp always matches the status, so metrics can trust it
  sets.push(status === 'resolved' ? 'resolved_at = now()' : 'resolved_at = null');
  if (moderationReason !== undefined) {
    params.push(moderationReason);
    sets.push(`moderation_reason = $${params.length}`);
  }
  if (moderatedBy !== undefined) {
    params.push(moderatedBy);
    sets.push(`moderated_by = $${params.length}`);
  }
  if (moderatedAt !== undefined) {
    params.push(moderatedAt);
    sets.push(`moderated_at = $${params.length}`);
  }

  await query(`update items set ${sets.join(', ')} where id = $1`, params);
  return findItemById(id, { includePrivate: true });
}

async function deleteItem(id) {
  await query('delete from items where id = $1', [id]);
}

async function listByReporter(reporterId) {
  const { rows } = await query(
    `select i.*, ${REPORTER_PUBLIC} from items i join users u on u.id = i.reporter
     where i.reporter = $1 order by i.created_at desc`,
    [reporterId]
  );
  return rows.map((r) => mapItem(r, { includePrivate: true })); // owner-scoped endpoint
}

/** Claim counts per item for the dashboard table. */
async function claimCountsForItems(itemIds) {
  if (!itemIds.length) return {};
  const params = [...itemIds];
  const placeholders = itemIds.map((_, i) => `$${i + 1}`).join(', ');
  const { rows } = await query(
    `select item, count(*)::int as total,
            sum(case when status = 'pending' then 1 else 0 end)::int as pending
     from claims where item in (${placeholders}) group by item`,
    params
  );
  return Object.fromEntries(rows.map((r) => [r.item, { total: r.total, pending: r.pending }]));
}

async function statusCountsForReporter(reporterId) {
  const { rows } = await query(
    'select status, count(*)::int as count from items where reporter = $1 group by status',
    [reporterId]
  );
  const counts = Object.fromEntries(ALL_STATUSES.map((s) => [s, 0]));
  rows.forEach((r) => {
    counts[r.status] = r.count;
  });
  return counts;
}

/* --------------------------- admin statistics --------------------------- */
async function countItems() {
  const { rows } = await query('select count(*)::int as count from items');
  return rows[0].count;
}

async function countBy(column) {
  const { rows } = await query(
    `select ${column} as key, count(*)::int as count from items group by ${column} order by count desc`
  );
  return rows.map((r) => ({ _id: r.key, count: r.count }));
}

async function countByDay(days = 7) {
  // one narrow query, bucketed in JS: no date functions in SQL, and the chart
  // always receives all seven days (including the empty ones).
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - (days - 1));

  const { rows } = await query('select created_at from items where created_at >= $1', [since]);

  const buckets = new Map();
  for (let i = 0; i < days; i += 1) {
    const d = new Date(since);
    d.setDate(since.getDate() + i);
    buckets.set(d.toISOString().slice(0, 10), 0);
  }
  rows.forEach((row) => {
    const key = new Date(row.created_at).toISOString().slice(0, 10);
    if (buckets.has(key)) buckets.set(key, buckets.get(key) + 1);
  });

  return [...buckets.entries()].map(([day, count]) => ({ _id: day, count }));
}

async function recentItems(limit = 5) {
  const { rows } = await query(
    `select i.*, ${REPORTER_PUBLIC} from items i join users u on u.id = i.reporter
     order by i.created_at desc limit $1`,
    [limit]
  );
  return rows.map((r) => mapItem(r));
}

/**
 * Custom feature: candidate matches for a new report.
 * Same category, opposite type, open status, and at least one shared keyword.
 */
async function findMatches({ title, description = '', category, type, excludeId, limit = 10 }) {
  const stop = new Set(['with','from','that','this','have','been','near','lost','found','item','please','black','white']);
  const words = `${title} ${description}`
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 3 && !stop.has(w))
    .slice(0, 6);

  if (!words.length) return [];

  const params = [category, type === 'lost' ? 'found' : 'lost'];
  const keywordClauses = [];
  words.forEach((word) => {
    params.push(`%${word}%`);
    const p = `$${params.length}`;
    keywordClauses.push(`i.title ilike ${p} or i.description ilike ${p}`);
  });

  let sql = `select i.*, ${REPORTER_PUBLIC} from items i join users u on u.id = i.reporter
             where i.category = $1 and i.type = $2 and i.status in ('active','claim_requested')
             and (${keywordClauses.join(' or ')})`;
  if (excludeId) {
    params.push(excludeId);
    sql += ` and i.id <> $${params.length}`;
  }
  params.push(limit);
  sql += ` limit $${params.length}`;

  const { rows } = await query(sql, params);

  return rows
    .map((row) => {
      const haystack = `${row.title} ${row.description}`.toLowerCase();
      const hits = words.filter((w) => haystack.includes(w)).length;
      return { ...mapItem(row), matchScore: Math.round((hits / words.length) * 100) };
    })
    .filter((item) => item.matchScore >= 30)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 5);
}

module.exports = {
  ALL_STATUSES,
  findItems,
  findItemById,
  incrementViews,
  createItem,
  updateItem,
  setStatus,
  deleteItem,
  listByReporter,
  claimCountsForItems,
  statusCountsForReporter,
  countItems,
  countBy,
  countByDay,
  recentItems,
  findMatches,
};
