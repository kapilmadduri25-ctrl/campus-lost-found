/**
 * Runs the Postman collection with Newman against a live instance.
 *
 *   npm run test:postman
 *
 * Boots the real Express app on an in-memory Postgres, seeds the demo accounts the
 * collection expects, then executes every request exactly as the Postman runner would.
 * This proves the collection works, so the screenshots taken in Postman show a run that
 * is known to pass.
 */
process.env.JWT_SECRET = 'postman_secret';
process.env.REQUIRE_MODERATION = 'false';
process.env.NODE_ENV = 'test';

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { newDb } = require('pg-mem');
const newman = require('newman');

(async () => {
  const db = newDb();
  db.public.none(fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8'));
  require('../src/config/db')._setPool(new (db.adapters.createPg()).Pool());

  const users = require('../src/db/users');
  const items = require('../src/db/items');

  const studentHash = await bcrypt.hash('Password@123', 10);
  const adminHash = await bcrypt.hash('Admin@12345', 10);

  const arjun = await users.createUser({
    name: 'Arjun Rao', email: 'arjun@saiuniversity.edu.in', password: studentHash, department: 'Computer Science',
  });
  await users.createUser({
    name: 'Meera Iyer', email: 'meera@saiuniversity.edu.in', password: studentHash, department: 'Design',
  });
  await users.createUser({
    name: 'Rahul Menon', email: 'rahul@saiuniversity.edu.in', password: studentHash, department: 'Mechanical',
  });
  await users.createUser({
    name: 'Portal Administrator', email: 'admin@saiuniversity.edu.in', password: adminHash, role: 'admin',
  });

  // Arjun's active listing: other students claim this one
  const arjunItem = await items.createItem({
    title: 'Black Dell Inspiron Laptop',
    description: 'Found a black Dell laptop with a blue sticker on the lid, near the library entrance.',
    category: 'Electronics', type: 'found', location: 'Main Library',
    dateLostOrFound: new Date('2026-11-15'), reporter: arjun._id, status: 'active',
  });

  // a second listing so the search and filter requests have something to find
  await items.createItem({
    title: 'Blue Water Bottle',
    description: 'Lost my navy blue steel water bottle during cricket practice on the main ground.',
    category: 'Other', type: 'lost', location: 'Sports Complex',
    dateLostOrFound: new Date('2026-11-14'), reporter: arjun._id, status: 'active',
  });

  // a pending listing for the moderation requests to act on
  const pendingItem = await items.createItem({
    title: 'Unverified Silver Wristwatch',
    description: 'Found a silver wristwatch with a scratched strap near the library entrance.',
    category: 'Other', type: 'found', location: 'Main Library',
    dateLostOrFound: new Date('2026-11-16'), reporter: arjun._id, status: 'pending',
  });

  const app = require('../src/app');
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  console.log(`[postman] app listening on ${baseUrl}\n`);

  const summary = await new Promise((resolve, reject) => {
    newman.run(
      {
        collection: path.join(__dirname, '..', 'postman', 'LOSTLY.postman_collection.json'),
        environment: path.join(__dirname, '..', 'postman', 'LOSTLY.postman_environment.json'),
        envVar: [
          { key: 'baseUrl', value: baseUrl },
          { key: 'itemId', value: arjunItem._id },
          { key: 'pendingItemId', value: pendingItem._id },
        ],
        reporters: ['cli'],
        insecure: true,
        timeoutRequest: 8000,
      },
      (err, run) => (err ? reject(err) : resolve(run))
    );
  });

  const stats = summary.run.stats;
  const assertions = stats.assertions || { total: 0, failed: 0 };
  const requests = stats.requests || { total: 0, failed: 0 };

  const failures = [];
  summary.run.executions.forEach((exec) => {
    const failed = (exec.assertions || []).filter((a) => a.error);
    if (failed.length) {
      const body = (exec.response && exec.response.stream)
        ? Buffer.from(exec.response.stream).toString().slice(0, 180)
        : '(no body)';
      failures.push(`\n  ${exec.item.name}  [${exec.response ? exec.response.code : 'no response'}]`);
      failed.forEach((a) => failures.push(`      ${a.assertion}`));
      failures.push(`      body: ${body}`);
    }
    if (exec.requestError) failures.push(`\n  ${exec.item.name} -> ${exec.requestError.message}`);
  });

  console.log('');
  console.log(`[postman] requests:   ${requests.total - (requests.failed || 0)}/${requests.total} passed`);
  console.log(`[postman] assertions: ${assertions.total - (assertions.failed || 0)}/${assertions.total} passed`);

  if (failures.length) {
    console.log('\n[postman] failures:');
    [...new Set(failures)].forEach((f) => console.log(f));
  }

  const ok = !(requests.failed > 0) && !(assertions.failed > 0);
  console.log(ok ? '\n[postman] collection passed' : '\n[postman] collection FAILED');

  server.close();
  process.exit(ok ? 0 : 1);
})().catch((err) => {
  console.error('[postman] harness error:', err.message);
  process.exit(1);
});
