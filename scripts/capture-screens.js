/**
 * Captures the report screenshots from the real app.
 *
 *   node scripts/capture-screens.js
 *
 * Boots the app over an in-memory Postgres, seeds a realistic board (13 listings,
 * 4 accounts, claims, notifications, a moderation queue), then screenshots each screen
 * at 1440px - the same pages and the same code as the deployed build.
 */
process.env.JWT_SECRET = 'shots_secret';
process.env.NODE_ENV = 'test';
process.env.REQUIRE_MODERATION = 'false';

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { newDb } = require('pg-mem');
const puppeteer = require('puppeteer-core');

const OUT = process.env.SHOT_DIR || '/scratch/work/shots';
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const db = newDb();
  db.public.none(fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8'));
  require('../src/config/db')._setPool(new (db.adapters.createPg()).Pool());

  const users = require('../src/db/users');
  const items = require('../src/db/items');
  const claims = require('../src/db/claims');
  const notifications = require('../src/db/notifications');

  const pw = await bcrypt.hash('Password@123', 10);
  const arjun = await users.createUser({ name: 'Arjun Rao', email: 'arjun@saiuniversity.edu.in', password: pw, department: 'Computer Science' });
  const meera = await users.createUser({ name: 'Meera Iyer', email: 'meera@saiuniversity.edu.in', password: pw, department: 'Design' });
  const rahul = await users.createUser({ name: 'Rahul Menon', email: 'rahul@saiuniversity.edu.in', password: pw, department: 'Mechanical' });
  await users.createUser({ name: 'Rupa Sah', email: 'admin@saiuniversity.edu.in', password: await bcrypt.hash('Admin@12345', 10), role: 'admin', department: 'Administration' });

  const board = [
    ['Black Dell Inspiron Laptop', 'Found a black Dell Inspiron laptop with a blue sticker on the lid, charger in the bag.', 'Electronics', 'found', 'Main Library', '2026-11-15', arjun, 'active'],
    ['Blue Steel Water Bottle', 'Lost my navy blue steel bottle with a dented base during cricket practice.', 'Other', 'lost', 'Sports Complex', '2026-11-14', meera, 'active'],
    ['Data Structures Notes', 'Spiral notebook, Unit 3 to 5, name written inside the cover.', 'Books & Notes', 'lost', 'Block A - Academic', '2026-11-12', rahul, 'active'],
    ['Hostel Room Keys', 'Two keys on a red keyring, found near the hostel gate.', 'Keys', 'found', 'Hostel Block', '2026-11-16', meera, 'active'],
    ['Brown Leather Wallet', 'Brown wallet with a metro card inside, found at the bus stop.', 'Wallet & Cards', 'found', 'Bus Stop', '2026-11-17', arjun, 'active'],
    ['Badminton Racket', 'Yonex racket in a black cover, left in the sports complex.', 'Sports Equipment', 'found', 'Sports Complex', '2026-11-11', rahul, 'active'],
    ['Student ID Card', 'ID card with a blue lanyard, found in the cafeteria queue.', 'ID Card', 'found', 'Cafeteria', '2026-11-18', arjun, 'active'],
    ['Grey Hoodie', 'Medium grey hoodie left on a chair in the computer lab.', 'Clothing', 'found', 'Computer Lab 1', '2026-11-10', meera, 'active'],
    ['Sunglasses', 'Black sunglasses in a hard case, found near the auditorium steps.', 'Accessories', 'found', 'Auditorium', '2026-11-09', rahul, 'active'],
    ['Grey Umbrella', 'Folding umbrella left behind after the seminar.', 'Other', 'lost', 'Auditorium', '2026-11-08', arjun, 'active'],
    ['Physics Lab Manual', 'Lab manual with handwritten notes, lost in Block B.', 'Books & Notes', 'lost', 'Block B - Academic', '2026-11-07', meera, 'active'],
    ['Wireless Mouse', 'Logitech wireless mouse, found in the computer lab.', 'Electronics', 'found', 'Computer Lab 2', '2026-11-06', rahul, 'active'],
    ['Blue Backpack', 'Navy backpack with a laptop sleeve, found at the parking area.', 'Bags', 'found', 'Parking Area', '2026-11-05', arjun, 'active'],
    ['Unverified Silver Wristwatch', 'Silver wristwatch with a scratched strap, awaiting review.', 'Accessories', 'found', 'Main Library', '2026-11-19', meera, 'pending'],
    ['Faded Blue Cap', 'Blue cap found near the sports complex gate.', 'Clothing', 'found', 'Sports Complex', '2026-11-19', rahul, 'pending'],
  ];

  const created = [];
  for (const [title, description, category, type, location, date, reporter, status] of board) {
    created.push(
      await items.createItem({
        title, description, category, type, location,
        dateLostOrFound: new Date(date), reporter: reporter._id, status,
      })
    );
  }

  const laptop = created[0];

  // a pending claim from Meera on Arjun's laptop, so the received tab has something
  await claims.create({
    item: laptop._id,
    claimant: meera._id,
    message: 'This is mine - the serial number ends 8821 and I have the invoice from the Dell store.',
    proof: 'Serial 8821, purchased 12 Aug 2025',
  });
  await items.setStatus(laptop._id, { status: 'claim_requested' });

  await notifications.create({ user: arjun._id, type: 'duplicate', message: 'A possible match for "Grey Umbrella" was posted.', item: laptop._id });
  await notifications.create({ user: arjun._id, type: 'claim', message: 'Meera Iyer submitted a claim on your laptop.', item: laptop._id });

  /* ---------------------------------------------------------------- server */
  const app = require('../src/app');
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;

  const browser = await puppeteer.launch({
    executablePath: '/usr/local/bin/chromium',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  const login = async (email, password) => {
    const res = await fetch(`${base}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    return res.json();
  };

  const shoot = async (file, urlPath, { as = null, full = false, wait = 1400, before = null } = {}) => {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 980, deviceScaleFactor: 2 });

    if (as) {
      const session = await login(as.email, as.password);
      await page.goto(`${base}/index.html`, { waitUntil: 'domcontentloaded' });
      await page.evaluate(
        (t, u) => {
          localStorage.setItem('lostly_token', t);
          localStorage.setItem('lostly_user', JSON.stringify(u));
        },
        session.token, session.user
      );
    }

    await page.goto(`${base}${urlPath}`, { waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, wait));
    if (before) await before(page);
    await page.screenshot({ path: path.join(OUT, file), fullPage: full });
    console.log('  captured', file);
    await page.close();
  };

  console.log('[shots] capturing...');

  await shoot('fig-5-1-home.png', '/index.html');
  await shoot('fig-5-2-item.png', `/item.html?id=${laptop._id}`);
  await shoot('fig-5-3-report.png', '/report.html?type=found', {
    as: { email: 'arjun@saiuniversity.edu.in', password: 'Password@123' },
    before: async (page) => {
      await page.type('#title', 'Grey Folding Umbrella');
      await page.type('#description', 'Found a grey folding umbrella near the auditorium steps after the seminar on Friday.');
      await page.select('#category', 'Other');
      await page.select('#location', 'Auditorium');
      await page.$eval('#dateLostOrFound', (el) => { el.value = '2026-11-16'; });
      await page.click('#accuracy').catch(() => {});
    },
  });
  await shoot('fig-5-4-login.png', '/login.html');
  await shoot('fig-5-5-dashboard.png', '/dashboard.html', { as: { email: 'arjun@saiuniversity.edu.in', password: 'Password@123' } });
  await shoot('fig-5-6-received.png', '/dashboard.html', {
    as: { email: 'arjun@saiuniversity.edu.in', password: 'Password@123' },
    before: async (page) => {
      await page.click('[data-tab="received"]');
      await new Promise((r) => setTimeout(r, 900));
    },
  });
  await shoot('fig-5-7-admin.png', '/admin.html', {
    as: { email: 'admin@saiuniversity.edu.in', password: 'Admin@12345' },
    wait: 2200,
  });
  await shoot('fig-5-8-moderation.png', '/admin.html', {
    as: { email: 'admin@saiuniversity.edu.in', password: 'Admin@12345' },
    wait: 2200,
    full: true,
  });
  await shoot('fig-5-9-dark.png', '/index.html', {
    before: async (page) => {
      await page.click('#theme-toggle');
      await new Promise((r) => setTimeout(r, 600));
    },
  });

  await browser.close();
  server.close();
  console.log(`[shots] done -> ${OUT}`);
  process.exit(0);
})().catch((err) => {
  console.error('[shots] failed:', err);
  process.exit(1);
});
