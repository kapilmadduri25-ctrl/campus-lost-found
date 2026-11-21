const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { newDb } = require('pg-mem');

/**
 * Full-stack API test: boots the real Express app on top of an in-memory
 * Postgres (pg-mem) and exercises the HTTP surface the frontend and Postman use.
 *
 *   npm run test:api
 *
 * No Supabase project, no network, no credentials — but every route, middleware
 * and SQL statement runs for real.
 */
process.env.JWT_SECRET = 'api_test_secret';
process.env.REQUIRE_MODERATION = 'false';

(async () => {
  const db = newDb();
  const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  await db.public.none(schema);

  const { Pool } = db.adapters.createPg();
  const { _setPool } = require('../src/config/db');
  _setPool(new Pool());

  const users = require('../src/db/users');
  const app = require('../src/app');

  const hash = await bcrypt.hash('Password@123', 10);
  await users.createUser({ name: 'Arjun Rao', email: 'arjun@saiuniversity.edu.in', password: hash });
  await users.createUser({ name: 'Meera Iyer', email: 'meera@saiuniversity.edu.in', password: hash });
  await users.createUser({ name: 'Admin', email: 'admin@saiuniversity.edu.in', password: hash, role: 'admin' });

  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

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

  const call = async (method, url, { token, body, form } = {}) => {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    let payload;
    if (form) {
      payload = form;
    } else if (body) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const res = await fetch(base + url, { method, headers, body: payload });
    let json = null;
    const text = await res.text();
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text };
    }
    return { status: res.status, json, headers: res.headers };
  };

  try {
    /* ------------------------------ auth ------------------------------ */
    const studentLogin = await call('POST', '/api/v1/auth/login', { body: { email: 'arjun@saiuniversity.edu.in', password: 'Password@123' } });
    check('POST /auth/login returns a token', studentLogin.status === 200 && Boolean(studentLogin.json.token));
    const token = studentLogin.json.token;

    const adminLogin = await call('POST', '/api/v1/auth/login', { body: { email: 'admin@saiuniversity.edu.in', password: 'Password@123' } });
    const adminToken = adminLogin.json.token;
    check('admin login works', Boolean(adminToken));

    const meeraLogin = await call('POST', '/api/v1/auth/login', { body: { email: 'meera@saiuniversity.edu.in', password: 'Password@123' } });
    const meeraToken = meeraLogin.json.token;

    const badLogin = await call('POST', '/api/v1/auth/login', { body: { email: 'arjun@saiuniversity.edu.in', password: 'wrong' } });
    check('wrong password is rejected with 401', badLogin.status === 401 && badLogin.json.error.code === 'UNAUTHENTICATED');

    const me = await call('GET', '/api/v1/auth/me', { token });
    check('GET /auth/me returns the profile', me.status === 200 && me.json.user.email.includes('arjun'));

    const dupRegister = await call('POST', '/api/v1/auth/register', { body: { name: 'Copy Cat', email: 'arjun@saiuniversity.edu.in', password: 'Password@123' } });
    check('duplicate email is rejected with 409', dupRegister.status === 409);

    /* ----------------------------- items ------------------------------ */
    const created = await call('POST', '/api/v1/items', {
      token,
      form: (() => {
        const fd = new FormData();
        fd.set('title', 'Black Dell Inspiron Laptop');
        fd.set('description', 'Found a black Dell laptop with a blue sticker on the lid in the library.');
        fd.set('descriptionPrivate', 'Serial ends 8821');
        fd.set('category', 'Electronics');
        fd.set('type', 'found');
        fd.set('location', 'Main Library');
        fd.set('dateLostOrFound', '2026-11-15');
        return fd;
      })(),
    });
    check('POST /items creates a listing', created.status === 201 && /^LF-\d{2}-/.test(created.json.reference), created.json.reference);
    check('private details are not echoed back', created.json.item.descriptionPrivate === undefined);
    const itemId = created.json.item._id;

    const noToken = await call('POST', '/api/v1/items', { body: { title: 'x' } });
    check('POST /items without a token is 401', noToken.status === 401);

    const invalid = await call('POST', '/api/v1/items', { token, body: { title: 'ab', description: 'short', category: 'Spaceship', type: 'borrowed', location: 'Mars', dateLostOrFound: '2099-01-01' } });
    check('invalid item payload is 400 with details', invalid.status === 400 && Array.isArray(invalid.json.error.details));

    const list = await call('GET', '/api/v1/items?limit=5');
    check('GET /items is public and paginated', list.status === 200 && Array.isArray(list.json.items) && typeof list.json.total === 'number');
    check('public list hides reporter emails', !JSON.stringify(list.json.items).includes('@saiuniversity'));

    const search = await call('GET', '/api/v1/items?search=laptop&type=found');
    check('search + filter returns the laptop', search.json.total === 1);

    const ranged = await call('GET', '/api/v1/items?from=2026-11-01&to=2026-12-31&status=active');
    check('date range + status filters combine', ranged.status === 200 && ranged.json.items.every((i) => i.status === 'active'));

    const detail = await call('GET', `/api/v1/items/${itemId}`);
    check('GET /items/:id works for a guest', detail.status === 200 && detail.json.item.claimsCount === 0);

    const detailAsOwner = await call('GET', `/api/v1/items/${itemId}`, { token });
    check('owner sees private fields on detail', detailAsOwner.json.item.descriptionPrivate === 'Serial ends 8821');

    const notOwner = await call('PATCH', `/api/v1/items/${itemId}`, { token: meeraToken, body: { description: 'hijacked description attempt' } });
    check('editing someone else\'s item is 403', notOwner.status === 403);

    const patched = await call('PATCH', `/api/v1/items/${itemId}`, { token, body: { description: 'Updated: silver strap scratch on the lid.' } });
    check('owner can update their item', patched.status === 200 && patched.json.item.description.includes('Updated'));

    /* ----------------------------- claims ----------------------------- */
    const claim = await call('POST', '/api/v1/claims', { token: meeraToken, body: { itemId, message: 'This is my laptop, the blue sticker is mine.', proof: 'Invoice from 2024' } });
    check('POST /claims creates a claim', claim.status === 201);
    const claimId = claim.json.claim._id;

    const claimAgain = await call('POST', '/api/v1/claims', { token: meeraToken, body: { itemId, message: 'trying the same item twice' } });
    check('duplicate claim is 409', claimAgain.status === 409);

    const shortClaim = await call('POST', '/api/v1/claims', { token: meeraToken, body: { itemId, message: 'mine' } });
    check('short claim message is 400', shortClaim.status === 400);

    const received = await call('GET', '/api/v1/claims/received', { token });
    check('owner sees the claim on their listing', received.status === 200 && received.json.claims.length === 1);

    const decidedByWrongUser = await call('PATCH', `/api/v1/claims/${claimId}`, { token: meeraToken, body: { status: 'approved' } });
    check('claimant cannot decide their own claim', decidedByWrongUser.status === 403);

    const askedInfo = await call('PATCH', `/api/v1/claims/${claimId}`, { token, body: { status: 'info_requested', decisionNote: 'Please share the serial number' } });
    check('owner can ask for more information', askedInfo.status === 200 && askedInfo.json.claim.status === 'info_requested');

    const replyShort = await call('PATCH', `/api/v1/claims/${claimId}/reply`, { token: meeraToken, body: { message: 'x' } });
    check('reply shorter than 10 characters is 400', replyShort.status === 400);

    const replyByOwner = await call('PATCH', `/api/v1/claims/${claimId}/reply`, { token, body: { message: 'The owner must not be able to reply as the claimant' } });
    check('only the claimant can reply', replyByOwner.status === 403);

    const reply = await call('PATCH', `/api/v1/claims/${claimId}/reply`, { token: meeraToken, body: { message: 'The serial number ends 8821 and the invoice is dated 12 March 2024.' } });
    check('claimant reply returns the claim to pending', reply.status === 200 && reply.json.claim.status === 'pending');

    const approved = await call('PATCH', `/api/v1/claims/${claimId}`, { token, body: { status: 'approved', decisionNote: 'Verified the invoice' } });
    check('owner approves the claim', approved.status === 200 && approved.json.claim.status === 'approved');

    const resolvedItem = await call('GET', `/api/v1/items/${itemId}`, { token });
    check('approval resolves the item', resolvedItem.json.item.status === 'resolved');

    /* --------------------------- dashboard ---------------------------- */
    const summary = await call('GET', '/api/v1/dashboard/summary', { token });
    check('dashboard summary counts', summary.status === 200 && summary.json.summary.byStatus.resolved === 1);

    const notificationsList = await call('GET', '/api/v1/notifications', { token });
    check('notifications were created by the flow', notificationsList.json.count >= 1);

    /* ----------------------------- admin ------------------------------ */
    const forbidden = await call('GET', '/api/v1/admin/stats', { token });
    check('admin stats with a student token is 403', forbidden.status === 403);

    const stats = await call('GET', '/api/v1/admin/stats', { token: adminToken });
    check('admin stats work with an admin token', stats.status === 200 && stats.json.stats.totals.items === 1);

    const queue = await call('GET', '/api/v1/admin/reports?status=pending', { token: adminToken });
    check('moderation queue endpoint responds', queue.status === 200 && Array.isArray(queue.json.items));

    const hideNoReason = await call('PATCH', `/api/v1/admin/reports/${itemId}`, { token: adminToken, body: { action: 'hide', reason: '' } });
    check('hiding without a reason is 400', hideNoReason.status === 400);

    const hidden = await call('PATCH', `/api/v1/admin/reports/${itemId}`, { token: adminToken, body: { action: 'hide', reason: 'Duplicate report' } });
    check('admin can hide a listing with a reason', hidden.status === 200 && hidden.json.item.status === 'rejected');

    const audit = await call('GET', '/api/v1/admin/audit', { token: adminToken });
    check('audit log recorded the decisions', audit.status === 200 && audit.json.logs.length >= 4, `${audit.json.logs.length} entries`);

    const usersList = await call('GET', '/api/v1/admin/users', { token: adminToken });
    check('user list leaks no password hashes', usersList.status === 200 && !JSON.stringify(usersList.json).includes('$2a$'));

    const suspend = await call('PATCH', `/api/v1/admin/users/${usersList.json.users.find((u) => u.email.includes('meera'))._id}/status`, { token: adminToken, body: { isActive: false } });
    check('admin can suspend an account', suspend.status === 200 && suspend.json.user.isActive === false);

    const suspendedLogin = await call('POST', '/api/v1/auth/login', { body: { email: 'meera@saiuniversity.edu.in', password: 'Password@123' } });
    check('suspended account cannot log in', suspendedLogin.status === 403);

    /* ----------------------------- meta ------------------------------- */
    const meta = await call('GET', '/api/v1/meta');
    check('meta exposes categories, locations and statuses', meta.status === 200 && meta.json.categories.length > 0 && meta.json.statuses.length === 6);

    const health = await call('GET', '/api/v1/health');
    check('health endpoint returns a request id', health.status === 200 && Boolean(health.json.requestId));
    check('X-Request-Id header present', Boolean(health.headers.get('x-request-id')));
  } catch (err) {
    fail += 1;
    console.log(`FAIL  unexpected error: ${err.message}`);
    console.log(err.stack.split('\n').slice(0, 8).join('\n'));
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  server.close(() => process.exit(fail ? 1 : 0));
})();
