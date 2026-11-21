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
  await users.createUser({ name: 'Rahul Sharma', email: 'rahul@saiuniversity.edu.in', password: hash });
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

    const rahulLogin = await call('POST', '/api/v1/auth/login', { body: { email: 'rahul@saiuniversity.edu.in', password: 'Password@123' } });
    const rahulToken = rahulLogin.json.token;

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
    /* ------------------ negative and security cases ------------------- */
    // malformed ids must be rejected before they reach Postgres
    const badIds = [
      ['GET', '/api/v1/items/not-a-uuid', undefined],
      ['PATCH', '/api/v1/claims/xyz', {}],
      ['PATCH', '/api/v1/notifications/abc/read', {}],
    ];
    for (const [method, path, body] of badIds) {
      const r = await call(method, path, { token: adminToken, body });
      const leaked = JSON.stringify(r.json).toLowerCase().includes('select ');
      check(`malformed id on ${method} ${path} -> 404, no SQL leak`, r.status === 404 && !leaked, `status ${r.status}`);
    }

    const badDate = await call('GET', '/api/v1/items?from=not-a-date');
    check('invalid from date is 400, not 500', badDate.status === 400 && badDate.json.error.code === 'VALIDATION_ERROR');

    // uploads: wrong MIME and oversize are both refused
    const makeForm = (file) => {
      const fd = new FormData();
      fd.set('title', 'Upload probe');
      fd.set('description', 'Probing the upload guard with a deliberately invalid file.');
      fd.set('category', 'Other');
      fd.set('type', 'lost');
      fd.set('location', 'Cafeteria');
      fd.set('dateLostOrFound', '2026-11-15');
      if (file) fd.set('image', file.blob, file.name);
      return fd;
    };

    const badType = await call('POST', '/api/v1/items', {
      token,
      form: makeForm({ blob: new Blob(['%PDF-1.4 fake'], { type: 'application/pdf' }), name: 'evil.html' }),
    });
    check('non-image upload is rejected with 400', badType.status === 400 && /Only JPG/.test(badType.json.error.message));

    const tooBig = await call('POST', '/api/v1/items', {
      token,
      form: makeForm({ blob: new Blob([new Uint8Array(3 * 1024 * 1024)], { type: 'image/png' }), name: 'big.png' }),
    });
    check('oversized image is rejected with 413', tooBig.status === 413);

    const goodUpload = await call('POST', '/api/v1/items', {
      token,
      form: makeForm({ blob: new Blob([new Uint8Array(1024)], { type: 'image/png' }), name: 'photo.png' }),
    });
    check('a valid PNG is stored with a .png filename',
      goodUpload.status === 201 && /\.png$/.test(goodUpload.json.item.imageUrl),
      goodUpload.json.item?.imageUrl);

    // moderation: a hidden listing disappears from the public surface
    const guestHidden = await call('GET', `/api/v1/items/${itemId}`);
    check('hidden listing is 404 for a guest', guestHidden.status === 404);

    const ownerHidden = await call('GET', `/api/v1/items/${itemId}`, { token });
    check('hidden listing is still visible to its owner', ownerHidden.status === 200 && ownerHidden.json.item.status === 'rejected');

    const listAfterHide = await call('GET', '/api/v1/items?limit=50');
    check('hidden listing is absent from public search', !listAfterHide.json.items.some((i) => i._id === itemId));

    // suspension must invalidate a token that was issued earlier
    const staleToken = await call('GET', '/api/v1/auth/me', { token: meeraToken });
    check('a token issued before suspension stops working', staleToken.status === 401 && staleToken.json.error.code === 'UNAUTHENTICATED');

    /* --------------------- claim business rules ----------------------- */
    const ownClaim = await call('POST', '/api/v1/claims', { token, body: { itemId, message: 'claiming my own listing should be refused' } });
    check('cannot claim your own listing', ownClaim.status === 400);

    const closedClaim = await call('POST', '/api/v1/claims', { token: rahulToken, body: { itemId, message: 'claiming a listing that is no longer open' } });
    check('cannot claim a listing that is not open', closedClaim.status === 400);

    // two claimants, one approval: the rival must be auto-rejected
    const item3 = await call('POST', '/api/v1/items', {
      token,
      form: (() => {
        const fd = new FormData();
        fd.set('title', 'Grey Umbrella');
        fd.set('description', 'Found a grey folding umbrella near the auditorium steps after the seminar.');
        fd.set('category', 'Other');
        fd.set('type', 'found');
        fd.set('location', 'Auditorium');
        fd.set('dateLostOrFound', '2026-11-16');
        return fd;
      })(),
    });
    const id3 = item3.json.item._id;
    const claimA = await call('POST', '/api/v1/claims', { token: rahulToken, body: { itemId: id3, message: 'That is my umbrella, it has a broken rib on the left side.' } });
    const claimB = await call('POST', '/api/v1/claims', { token: adminToken, body: { itemId: id3, message: 'I believe this umbrella is mine, the handle has a scratch.' } });
    check('two different users can claim the same item', claimA.status === 201 && claimB.status === 201);

    const approveA = await call('PATCH', `/api/v1/claims/${claimA.json.claim._id}`, { token, body: { status: 'approved' } });
    check('owner approves the first claim', approveA.status === 200 && approveA.json.claim.status === 'approved');

    const receivedAfter = await call('GET', '/api/v1/claims/received', { token });
    const rival = receivedAfter.json.claims.find((c) => c._id === claimB.json.claim._id);
    check('approving one claim auto-rejects the rival', Boolean(rival) && rival.status === 'rejected');

    const ownerReject = await call('PATCH', `/api/v1/items/${id3}/status`, { token, body: { status: 'rejected' } });
    check('an owner cannot hide their own listing (admin-only)', ownerReject.status === 403);

    /* ------------------ password recovery flow ------------------------ */
    const forgotUnknown = await call('POST', '/api/v1/auth/forgot-password', { body: { email: 'nobody@example.com' } });
    check('forgot-password does not reveal whether an account exists',
      forgotUnknown.status === 200 && forgotUnknown.json.devToken === undefined);

    const forgot = await call('POST', '/api/v1/auth/forgot-password', { body: { email: 'rahul@saiuniversity.edu.in' } });
    check('forgot-password issues a single-use token in development',
      forgot.status === 200 && typeof forgot.json.devToken === 'string' && forgot.json.devToken.length === 64);

    const badReset = await call('POST', '/api/v1/auth/reset-password', { body: { token: 'deadbeef', password: 'NewPassword@1' } });
    check('an invalid reset token is rejected with 400', badReset.status === 400);

    const shortReset = await call('POST', '/api/v1/auth/reset-password', { body: { token: forgot.json.devToken, password: 'short' } });
    check('a new password under 8 characters is rejected', shortReset.status === 400);

    const reset = await call('POST', '/api/v1/auth/reset-password', { body: { token: forgot.json.devToken, password: 'NewPassword@1' } });
    check('a valid token updates the password', reset.status === 200);

    const loginNew = await call('POST', '/api/v1/auth/login', { body: { email: 'rahul@saiuniversity.edu.in', password: 'NewPassword@1' } });
    check('the new password works', loginNew.status === 200);

    const reuse = await call('POST', '/api/v1/auth/reset-password', { body: { token: forgot.json.devToken, password: 'Another@1234' } });
    check('a reset token cannot be used twice', reuse.status === 400);

  } catch (err) {
    fail += 1;
    console.log(`FAIL  unexpected error: ${err.message}`);
    console.log(err.stack.split('\n').slice(0, 8).join('\n'));
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  server.close(() => process.exit(fail ? 1 : 0));
})();
