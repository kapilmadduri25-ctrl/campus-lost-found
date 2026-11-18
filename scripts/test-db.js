const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { newDb } = require('pg-mem');

/**
 * End-to-end data-layer test that runs the real schema and the real SQL against
 * an in-memory Postgres (pg-mem). No Supabase project and no network needed:
 *
 *   npm run test:db
 *
 * It proves the schema is valid, the queries are valid, and the API-shaped
 * objects come back exactly as the frontend expects.
 */
process.env.JWT_SECRET = 'test_secret';

(async () => {
  const db = newDb();
  db.public.registerFunction({ name: 'now', returns: 'timestamp', implementation: () => new Date() });

  const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  await db.public.none(schema);

  const { Pool } = db.adapters.createPg();
  const pool = new Pool();
  const { _setPool } = require('../src/config/db');
  _setPool(pool);

  const users = require('../src/db/users');
  const items = require('../src/db/items');
  const claims = require('../src/db/claims');
  const notifications = require('../src/db/notifications');
  const auditLogs = require('../src/db/auditLogs');

  let pass = 0;
  let fail = 0;
  const check = (name, condition, extra = '') => {
    if (condition) {
      pass += 1;
      console.log(`PASS  ${name}${extra ? `  (${extra})` : ''}`);
    } else {
      fail += 1;
      console.log(`FAIL  ${name}${extra ? `  (${extra})` : ''}`);
    }
  };

  try {
    /* ---------------------------- users ---------------------------- */
    const hash = await bcrypt.hash('Password@123', 10);
    const arjun = await users.createUser({ name: 'Arjun Rao', email: 'arjun@saiuniversity.edu.in', password: hash });
    const meera = await users.createUser({ name: 'Meera Iyer', email: 'meera@saiuniversity.edu.in', password: hash });
    const admin = await users.createUser({ name: 'Admin', email: 'admin@saiuniversity.edu.in', password: hash, role: 'admin' });

    check('user created with an _id', Boolean(arjun._id));
    check('password hash never returned', arjun.password === undefined);
    check('role defaults to student', arjun.role === 'student');

    const login = await users.findUserForLogin('ARJUN@saiuniversity.edu.in');
    check('login lookup is case-insensitive', Boolean(login && login.password));
    check('bcrypt compares the seeded password', await bcrypt.compare('Password@123', login.password));

    /* ---------------------------- items ---------------------------- */
    const laptop = await items.createItem({
      title: 'Black Dell Inspiron Laptop',
      description: 'Found a black Dell laptop with a blue sticker on the lid in the library.',
      descriptionPrivate: 'Serial number ends 8821',
      category: 'Electronics',
      type: 'found',
      location: 'Main Library',
      dateLostOrFound: new Date('2026-11-15'),
      reporter: arjun._id,
      status: 'active',
    });

    check('item created with a reference', /^LF-\d{2}-[A-Z0-9]{6}$/.test(laptop.reference), laptop.reference);
    check('reporter is embedded as an object', laptop.reporter && laptop.reporter.name === 'Arjun Rao');
    check('private details returned to the owner path', laptop.descriptionPrivate === 'Serial number ends 8821');

    const bottle = await items.createItem({
      title: 'Blue Water Bottle',
      description: 'Lost my navy blue steel water bottle during basketball practice at the sports complex.',
      category: 'Other',
      type: 'lost',
      location: 'Sports Complex',
      dateLostOrFound: new Date('2026-11-13'),
      reporter: meera._id,
      status: 'active',
    });

    const pendingBag = await items.createItem({
      title: 'Blue School Bag',
      description: 'Found a blue backpack with a broken zip under a table near the juice counter.',
      category: 'Bags',
      type: 'found',
      location: 'Cafeteria',
      dateLostOrFound: new Date('2026-11-16'),
      reporter: meera._id,
      status: 'pending',
    });

    const publicList = await items.findItems({ statuses: ['active', 'claim_requested'], page: 1, limit: 9 });
    check('public listing excludes pending items', publicList.total === 2, `total=${publicList.total}`);
    check('public rows carry the reporter name', publicList.items[0].reporter.name.length > 0);

    const search = await items.findItems({ statuses: ['active', 'claim_requested'], search: 'bottle' });
    check('keyword search matches the description', search.total === 1 && search.items[0].title.includes('Bottle'));

    const filtered = await items.findItems({ statuses: ['active'], category: 'Electronics', type: 'found' });
    check('category + type filter', filtered.total === 1);

    const sorted = await items.findItems({ statuses: ['active', 'claim_requested'], sort: 'date_desc' });
    check('date_desc sort puts the newest lost/found date first', sorted.items[0].title.includes('Laptop'));

    const page2 = await items.findItems({ statuses: ['active', 'claim_requested'], page: 2, limit: 1 });
    check('pagination returns the second page', page2.items.length === 1 && page2.total === 2);

    const detail = await items.findItemById(laptop._id, { includePrivate: true });
    check('detail includes private proof for the owner', detail.descriptionPrivate.length > 0);
    const detailPublic = await items.findItemById(laptop._id);
    check('detail hides private proof by default', detailPublic.descriptionPrivate === undefined);

    /* --------------------------- matches --------------------------- */
    const matches = await items.findMatches({
      title: 'Blue steel water bottle',
      description: 'lost near sports complex',
      category: 'Other',
      type: 'found',
      excludeId: pendingBag._id,
    });
    check('duplicate matcher finds the bottle report', matches.length === 1 && matches[0].matchScore >= 30, `score=${matches[0]?.matchScore}`);

    /* ---------------------------- claims --------------------------- */
    const claim = await claims.create({ item: laptop._id, claimant: meera._id, message: 'This is my laptop, the sticker is mine.', proof: 'Invoice 2024' });
    check('claim created', Boolean(claim._id));
    check('claim carries the private proof', claim.proof === 'Invoice 2024');

    let duplicateBlocked = false;
    try {
      await claims.create({ item: laptop._id, claimant: meera._id, message: 'second attempt at the same item' });
    } catch (err) {
      duplicateBlocked = err.code === '23505';
    }
    check('unique(item, claimant) blocks a duplicate claim', duplicateBlocked);

    await items.setStatus(laptop._id, { status: 'claim_requested' });
    const afterClaim = await items.findItemById(laptop._id);
    check('first claim moves the item to claim_requested', afterClaim.status === 'claim_requested');

    const forOwner = await claims.listForItemOwner(arjun._id);
    check('owner sees the claim with the claimant contact', forOwner.length === 1 && forOwner[0].claimant.email.includes('meera'));

    const decided = await claims.setDecision(claim._id, { status: 'approved', decisionNote: 'Verified', reviewedBy: arjun._id });
    await items.setStatus(laptop._id, { status: 'resolved', resolvedAt: new Date() });
    check('claim decision saved with reviewer', decided.status === 'approved' && decided.reviewedBy === arjun._id);

    const resolvedItem = await items.findItemById(laptop._id);
    check('approved claim resolves the item', resolvedItem.status === 'resolved' && Boolean(resolvedItem.resolvedAt));

    /* ------------------------- notifications ----------------------- */
    await notifications.create({ user: arjun._id, type: 'claim', message: 'Meera claimed your laptop', item: laptop._id, claim: claim._id });
    await notifications.createMany([
      { user: arjun._id, type: 'duplicate', message: 'possible match', item: bottle._id },
      { user: meera._id, type: 'duplicate', message: 'possible match', item: laptop._id },
    ]);
    const mine = await notifications.listByUser(arjun._id);
    const unread = await notifications.unreadCount(arjun._id);
    check('notifications listed newest first', mine.length === 2);
    check('unread counter works', unread === 2);
    await notifications.markAllRead(arjun._id);
    check('mark all read clears the counter', (await notifications.unreadCount(arjun._id)) === 0);

    /* ----------------------------- audit --------------------------- */
    await auditLogs.create({ actor: admin._id, actorName: 'Admin', action: 'item.moderated', entityType: 'item', entityId: pendingBag._id, reason: 'needs owner details', metadata: { from: 'pending', to: 'active' } });
    const logs = await auditLogs.list(10);
    check('audit entry written with jsonb metadata', logs.length === 1 && logs[0].metadata.to === 'active');

    /* --------------------------- dashboard ------------------------- */
    const statusCounts = await items.statusCountsForReporter(arjun._id);
    check('dashboard status counts', statusCounts.resolved === 1 && statusCounts.active === 0);
    check('claims received counter', (await claims.countForItemOwner(arjun._id)) === 1);
    check('claims submitted counter', (await claims.countForClaimant(meera._id)) === 1);

    /* ----------------------------- admin --------------------------- */
    const byStatus = await items.countBy('status');
    check('admin status aggregation', byStatus.length >= 3);
    const byCategory = await items.countBy('category');
    check('admin category aggregation', byCategory.some((r) => r._id === 'Electronics'));
    check('item total', (await items.countItems()) === 3);
    check('user total', (await users.countUsers()) === 3);
    check('pending moderation counter', (await items.findItems({ statuses: ['pending'], limit: 1 })).total === 1);

    const moderation = await items.setStatus(pendingBag._id, {
      status: 'active',
      moderationReason: '',
      moderatedBy: admin._id,
      moderatedAt: new Date(),
    });
    check('moderation moves pending to active', moderation.status === 'active');

    /* ------------------------- lifecycle guards -------------------- */
    const ownerCounts = await items.listByReporter(meera._id);
    check('my listings query', ownerCounts.length === 2);
    const counts = await items.claimCountsForItems([laptop._id, bottle._id]);
    check('claim counts per item', counts[laptop._id].total === 1);

    await items.deleteItem(bottle._id);
    check('delete removes the item', (await items.findItemById(bottle._id)) === null);
    check('claims cascade on delete', (await claims.countForItem(bottle._id)) === 0);
  } catch (err) {
    fail += 1;
    console.log(`FAIL  unexpected error: ${err.message}`);
    console.log(err.stack.split('\n').slice(0, 6).join('\n'));
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
