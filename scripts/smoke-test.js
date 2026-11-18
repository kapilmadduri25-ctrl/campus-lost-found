/**
 * Minimal smoke test that does not need a database.
 * It boots the Express app and checks routing, validation and auth guards
 * on the versioned API (/api/v1) plus the backwards-compatible alias (/api).
 *
 *   node scripts/smoke-test.js
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'smoke_test_secret';

const app = require('../src/app');

const server = app.listen(0, async () => {
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  let passed = 0;
  let failed = 0;

  const check = async (name, path, options, expected) => {
    try {
      const res = await fetch(base + path, options);
      const ok = res.status === expected;
      console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  -> ${res.status} (expected ${expected})`);
      ok ? passed++ : failed++;
      return res;
    } catch (err) {
      console.log(`FAIL  ${name}  -> ${err.message}`);
      failed++;
      return null;
    }
  };

  const json = { 'Content-Type': 'application/json' };

  const health = await check('health endpoint (v1)', '/api/v1/health', {}, 200);
  if (health) {
    const body = await health.json();
    console.log(`      requestId present: ${Boolean(body.requestId)}`);
  }
  await check('health alias (/api)', '/api/health', {}, 200);
  await check('meta endpoint', '/api/v1/meta', {}, 200);
  await check('home page served', '/', {}, 200);
  await check('404 page served', '/no-such-page', {}, 404);
  await check('unknown api route', '/api/v1/does-not-exist', {}, 404);
  await check('register with bad email', '/api/v1/auth/register', { method: 'POST', headers: json, body: JSON.stringify({ name: 'A', email: 'bad', password: '123' }) }, 400);
  await check('create item without token', '/api/v1/items', { method: 'POST', headers: json, body: JSON.stringify({ title: 'x' }) }, 401);
  await check('my items without token', '/api/v1/items/user/mine', {}, 401);
  await check('dashboard summary without token', '/api/v1/dashboard/summary', {}, 401);
  await check('admin stats as guest', '/api/v1/admin/stats', {}, 401);
  await check('moderation queue as guest', '/api/v1/admin/reports', {}, 401);
  await check('audit log as guest', '/api/v1/admin/audit', {}, 401);
  await check('notifications as guest', '/api/v1/notifications', {}, 401);


  /* ---- wiring guards: catch import mistakes the HTTP checks cannot see ---- */
  const dbModule = require('../src/config/db');
  const fs = require('fs');
  const pathMod = require('path');
  const serverSource = fs.readFileSync(pathMod.join(__dirname, '..', 'server.js'), 'utf8');

  [
    ['config/db exports connectDB()', typeof dbModule.connectDB === 'function'],
    ['config/db exports query()', typeof dbModule.query === 'function'],
    ['config/db exports withTransaction()', typeof dbModule.withTransaction === 'function'],
    ['server.js destructures connectDB', /\{\s*connectDB/.test(serverSource)],
  ].forEach(([name, ok]) => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
    ok ? passed++ : failed++;
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  server.close(() => process.exit(failed ? 1 : 0));
});
