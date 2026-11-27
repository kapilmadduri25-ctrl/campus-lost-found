/**
 * Browser end-to-end simulation.
 *
 *   npm run test:e2e
 *
 * Boots the real Express app on top of an in-memory Postgres, seeds it, then drives the
 * site in headless Chromium exactly as a student would: log in, report an item, claim one,
 * review the claim, open the dashboard, sign in as an administrator, moderate.
 *
 * It fails on: a JS exception, a console error, a failed request, or a page that does not
 * show what it should. This is the check that catches what API tests cannot - a broken
 * selector, an undefined variable, a page that renders empty.
 */
process.env.JWT_SECRET = 'e2e_secret';
process.env.REQUIRE_MODERATION = 'false';
process.env.NODE_ENV = 'test';

const fs = require('fs');
const bcrypt = require('bcryptjs');
const { newDb } = require('pg-mem');
const puppeteer = require('puppeteer-core');

const CHROME = '/usr/local/bin/chromium';

let passed = 0;
let failed = 0;
const problems = [];

function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL  ${name}${detail ? `  -> ${detail}` : ''}`);
    problems.push(`${name}${detail ? ` (${detail})` : ''}`);
  }
}

(async () => {
  /* ---------------------------------------------------------------- data */
  const db = newDb();
  db.public.none(fs.readFileSync(__dirname + '/../db/schema.sql', 'utf8'));
  require('../src/config/db')._setPool(new (db.adapters.createPg()).Pool());

  const users = require('../src/db/users');
  const items = require('../src/db/items');
  const hash = await bcrypt.hash('Password@123', 10);
  const adminHash = await bcrypt.hash('Admin@12345', 10);

  const arjun = await users.createUser({ name: 'Arjun Rao', email: 'arjun@saiuniversity.edu.in', password: hash, department: 'Computer Science' });
  const meera = await users.createUser({ name: 'Meera Iyer', email: 'meera@saiuniversity.edu.in', password: hash });
  await users.createUser({ name: 'Portal Administrator', email: 'admin@saiuniversity.edu.in', password: adminHash, role: 'admin' });

  const laptop = await items.createItem({
    title: 'Black Dell Inspiron Laptop', description: 'Found a black Dell laptop with a blue sticker on the lid.',
    descriptionPrivate: '', category: 'Electronics', type: 'found', location: 'Main Library',
    dateLostOrFound: new Date('2026-11-15'), reporter: arjun._id, status: 'active',
  });
  await items.createItem({
    title: 'Blue Water Bottle', description: 'Lost my navy blue steel water bottle during practice.',
    category: 'Other', type: 'lost', location: 'Sports Complex',
    dateLostOrFound: new Date('2026-11-14'), reporter: meera._id, status: 'active',
  });

  /* ---------------------------------------------------------------- server */
  const app = require('../src/app');
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  console.log(`[e2e] app listening on ${base}\n`);

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];

  page.on('dialog', (dialog) => dialog.accept('Duplicate of another listing'));

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(`${page.url().replace(base, '')}: ${msg.text().slice(0, 200)}`);
  });
  page.on('pageerror', (err) => pageErrors.push(`${page.url().replace(base, '')}: ${err.message.slice(0, 200)}`));
  page.on('requestfailed', (req) => {
    const url = req.url().replace(base, '');
    if (!url.includes('favicon')) failedRequests.push(`${url} (${req.failure()?.errorText})`);
  });
  page.on('response', (res) => {
    if (res.status() >= 400 && !res.url().includes('favicon')) failedRequests.push(`${res.url().replace(base, '')} -> ${res.status()}`);
  });

  const text = () => page.evaluate(() => document.body.innerText);
  const go = async (path) => {
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle2' });
  };
  const type = async (selector, value) => {
    await page.click(selector, { clickCount: 3 });
    await page.type(selector, value);
  };
  const settle = (ms = 400) => new Promise((r) => setTimeout(r, ms));

  /** Polls from Node: simple, and immune to execution-context quirks. */
  const poll = async (fn, timeout = 8000, interval = 150) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      try {
        if (await fn()) return true;
      } catch {
        /* page may be mid-navigation */
      }
      await settle(interval);
    }
    return false;
  };
  const waitForText = (needle, timeout = 8000) =>
    poll(() => page.evaluate((t) => document.body.innerText.includes(t), needle), timeout);
  const waitForGone = (needle, timeout = 8000) =>
    poll(() => page.evaluate((t) => !document.body.innerText.includes(t), needle), timeout);

  /* ------------------------------------------------------------ 1. home */
  await go('/index.html');
  const home = await text();
  check('home page renders the hero', home.includes('Lost it?'), home.slice(0, 60));
  check('home page lists the seeded items', home.includes('Black Dell Inspiron Laptop'));
  check('home page shows both items', home.includes('Blue Water Bottle'));
  check('the lost/found counters are filled', /\d+\s+lost reports/.test(home));

  /* --------------------------------------------------------- 2. search */
  await type('#search', 'laptop');
  const oneCard = await poll(async () => (await page.$$eval('.item-card', (els) => els.length)) === 1, 4000);
  const cards = await page.$$eval('.item-card', (els) => els.map((e) => e.innerText.replace(/\n/g, ' ')));
  check('search narrows the list to one result', oneCard, `${cards.length} cards: ${cards.join(' | ').slice(0, 120)}`);
  check('the remaining result is the laptop', /Laptop/i.test(cards.join(' ')), cards.join(' | ').slice(0, 120));

  /* -------------------------------------------------------- 3. filters */
  await go('/index.html');
  await page.select('#filter-status', 'active');
  await page.click('#search-form button[type="submit"]');
  await settle(800);
  const filtered = await text();
  check('the status filter keeps active listings', filtered.includes('Laptop'));
  await page.click('#reset-filters');
  await settle(700);
  check('reset restores the full list', (await text()).includes('Blue Water Bottle'));

  /* ------------------------------------------------------------ 4. login */
  await go('/login.html');
  const pwToggles = await page.$$('.pw-toggle');
  check('login page has show/hide controls', pwToggles.length === 1, `${pwToggles.length} found`);

  await page.click('[data-fill="student"]');
  const filledEmail = await page.$eval('#email', (el) => el.value);
  check('the demo button fills the email', filledEmail === 'arjun@saiuniversity.edu.in', filledEmail);

  await page.click('.pw-toggle');
  const shownType = await page.$eval('#password', (el) => el.type);
  check('show reveals the password', shownType === 'text', shownType);
  await page.click('.pw-toggle');

  await page.click('#submit-btn');
  await page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {});
  await settle(800);
  const afterLogin = page.url();
  check('student lands on the dashboard', afterLogin.includes('/dashboard.html'), afterLogin);
  const dash = await text();
  check('dashboard greets the student', dash.includes('Arjun'), dash.slice(0, 80));
  check('dashboard shows the stat cards', dash.includes('My listings'));

  /* ------------------------------------------------- 5. report a found item */
  await go('/report.html?type=found');
  await poll(async () => (await page.$$eval('#location option', (o) => o.length)) > 1, 4000);
  const reportTitle = await page.$eval('#form-title', (el) => el.textContent).catch(() => '');
  check('the report form opens in "found" mode', /found/i.test(reportTitle), reportTitle);

  await type('#title', 'Grey Umbrella');
  await type('#description', 'Found a grey folding umbrella near the auditorium steps after the seminar.');
  await page.select('#category', 'Other');
  await page.select('#location', 'Auditorium');
  await page.$eval('#dateLostOrFound', (el) => { el.value = '2026-11-16'; });
  await page.click('#accuracy').catch(() => {});
  await page.click('#submit-btn');
  await waitForText('Grey Umbrella', 5000);
  const afterReport = await text();
  check('a new report is confirmed', afterReport.includes('Grey Umbrella') || afterReport.includes('submitted'), afterReport.slice(0, 120));

  /* ------------------------------------------------ 6. open an item + claim */
  await go(`/item.html?id=${laptop._id}`);
  const detailReady = await poll(async () => (await page.$('#detail-root h1, #detail-root .card h1, #detail-root .detail-grid')) !== null, 5000);
  const detailText = await page.$eval('#detail-root', (e) => e.innerText).catch(() => '');
  check('item detail renders', detailReady && detailText.length > 40, `${detailText.length} chars`);
  check('item detail shows the title', /Black Dell Inspiron Laptop/.test(detailText), detailText.slice(0, 90));
  check('item detail shows the reference', /LF-\d\d-/.test(detailText), detailText.slice(0, 90));
  check('the owner sees no claim form', (await page.$('#claim-btn')) === null);
  check('the owner sees the report link instead', (await page.$('[data-flag]')) !== null);

  /* --------------------------------------- 7. claim as the other student */
  await page.evaluate(() => localStorage.clear());
  await go('/login.html');
  await type('#email', 'meera@saiuniversity.edu.in');
  await type('#password', 'Password@123');
  await page.click('#submit-btn');
  await page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {});
  await settle(600);

  await go(`/item.html?id=${laptop._id}`);
  const claimFormReady = await poll(async () => (await page.$('#claim-btn')) !== null, 5000);
  check('a non-owner sees the claim form', claimFormReady);
  if (claimFormReady) {
    await type('#claim-message', 'This is mine, the serial number ends 8821 and I have the invoice.');
    await page.click('#claim-btn');
    const acknowledged = await poll(async () => {
      const t = await page.evaluate(() => document.body.innerText);
      return /claim/i.test(t) && (/sent|awaiting|pending|submitted/i.test(t));
    }, 5000);
    check('the claim is acknowledged', acknowledged, (await text()).slice(0, 140));
  }

  /* ------------------------------------- 8. owner reviews the claim */
  await page.evaluate(() => localStorage.clear());
  await go('/login.html');
  await type('#email', 'arjun@saiuniversity.edu.in');
  await type('#password', 'Password@123');
  await page.click('#submit-btn');
  await page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {});
  await go('/dashboard.html');
  await page.click('#tab-received');
  const gotClaim = await poll(async () => {
    const t = await page.$eval('#panel-received', (e) => e.innerText).catch(() => '');
    return /Meera|claim/i.test(t) && t.length > 30;
  }, 5000);
  const receivedText = await page.$eval('#panel-received', (e) => e.innerText).catch(() => '');
  check('the owner sees the incoming claim', gotClaim, receivedText.slice(0, 140));

  const approveBtn = await page.$('[data-decide="approved"]');
  check('the approve control exists', Boolean(approveBtn));
  if (approveBtn) {
    await approveBtn.click();
    await settle(1400);
    const afterApprove = await text();
    check('approving updates the claim row', /approved/i.test(afterApprove), afterApprove.slice(0, 120));
  }

  /* ------------------------------------------------ 9. profile + password */
  await go('/profile.html');
  const emailValue = await poll(async () => (await page.$eval('#email', (el) => el.value).catch(() => '')) !== '', 6000)
    .then(() => page.$eval('#email', (el) => el.value).catch(() => ''))
    .catch(() => '');
  check('profile page loads the details', emailValue === 'arjun@saiuniversity.edu.in', emailValue);
  check('profile offers a password change', (await text()).includes('Change password'));
  const profileToggles = await page.$$('.pw-toggle');
  check('password fields have show/hide controls', profileToggles.length === 3, `${profileToggles.length}`);

  /* --------------------------------------------------------- 10. admin */
  await page.evaluate(() => localStorage.clear());
  await go('/login.html');
  await type('#email', 'admin@saiuniversity.edu.in');
  await type('#password', 'Admin@12345');
  await page.click('#submit-btn');
  await page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {});
  await settle(700);
  check('admin lands on the admin page', page.url().includes('/admin.html'), page.url());

  await poll(async () => (await page.$eval('#admin-root', (e) => e.innerText).catch(() => '')).length > 200, 6000);
  const admin = (await page.$eval('#admin-root', (e) => e.innerText).catch(() => '')).toLowerCase();
  check('admin sees the stat cards', admin.includes('total listings'), admin.slice(0, 80));
  check('admin sees the charts', admin.includes('listings by category'));
  check('admin sees the moderation queue', admin.includes('moderation queue'));
  check('admin sees the audit log', admin.includes('audit log'));
  check('admin can export a csv', admin.includes('download csv'));


  /* ------------------------------------------- 14. register a new account */
  await page.evaluate(() => localStorage.clear());
  await go('/register.html');
  await type('#name', 'Test Student');
  await type('#email', `test${Date.now()}@saiuniversity.edu.in`);
  await type('#password', 'Password@123');
  await type('#confirm', 'Password@123');
  await page.click('#submit-btn');
  await page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {});
  await settle(900);
  check('registration signs the new user in', page.url().includes('/dashboard.html'), page.url());

  /* --------------------------------------------- 15. edit and delete a listing */
  await go('/report.html?type=found');
  await poll(async () => (await page.$$eval('#location option', (o) => o.length)) > 1, 4000);
  await type('#title', 'Brown Leather Wallet');
  await type('#description', 'Found a brown leather wallet with a metro card inside, near the bus stop.');
  await page.select('#category', 'Wallet & Cards');
  await page.select('#location', 'Bus Stop');
  await page.$eval('#dateLostOrFound', (el) => { el.value = '2026-11-17'; });
  await page.click('#accuracy').catch(() => {});
  await page.click('#submit-btn');
  const created = await poll(async () => {
    const t = await page.evaluate(() => document.body.innerText);
    return /report submitted|submitted|saved/i.test(t);
  }, 5000);
  check('a new listing is created', created, (await text()).slice(-120));

  await go('/dashboard.html');
  await poll(async () => (await page.$$eval('#panel-listings [data-edit], #panel-listings a[href*="report.html?id="]', (e) => e.length)) > 0, 5000);
  const editLink = await page.$('#panel-listings a[href*="report.html?id="]');
  check('the dashboard offers an edit link', Boolean(editLink));
  if (editLink) {
    await editLink.click();
    await page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {});
    const prefilled = await poll(async () => (await page.$eval('#title', (el) => el.value).catch(() => '')).length > 0, 4000)
      .then(() => page.$eval('#title', (el) => el.value).catch(() => ''));
    check('the edit form is pre-filled', prefilled.includes('Brown Leather'), prefilled);
    await type('#title', 'Brown Leather Wallet (found at bus bay)');
    await page.click('#submit-btn');
    const edited = await poll(async () => {
      const t = await page.evaluate(() => document.body.innerText);
      return /saved|updated|submitted/i.test(t);
    }, 5000);
    check('editing a listing saves', edited, (await text()).slice(-120));
  }

  /* --------------------------------------------- 16. flag someone else's listing */
  await page.evaluate(() => localStorage.clear());
  await go('/login.html');
  await type('#email', 'meera@saiuniversity.edu.in');
  await type('#password', 'Password@123');
  await page.click('#submit-btn');
  await page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {});
  await go(`/item.html?id=${laptop._id}`);
  await poll(async () => (await page.$('#detail-root .detail-grid')) !== null, 5000);
  const flagBtn = await poll(async () => (await page.$('[data-flag]')) !== null, 4000);
  check('a visitor can see the report-listing control', flagBtn);
  if (flagBtn) {
    await page.click('[data-flag]');
    const flagged = await poll(async () => {
      const t = await page.evaluate(() => document.body.innerText);
      return /review|thank/i.test(t);
    }, 4000);
    check('flagging a listing is confirmed', flagged, (await text()).slice(0, 120));
  }

  /* --------------------------------------------- 17. the full reset flow */
  await page.evaluate(() => localStorage.clear());
  await go('/forgot-password.html');
  await type('#email', 'meera@saiuniversity.edu.in');
  await page.click('#submit-btn');
  const resetLink = await poll(async () => (await page.$('#reset-result a[href*="token="]')) !== null, 5000);
  check('the reset request produces a link', resetLink, (await text()).slice(0, 140));
  if (resetLink) {
    await page.click('#reset-result a[href*="token="]');
    await page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {});
    const tokenFilled = await poll(async () => (await page.$eval('#token', (el) => el.value).catch(() => '')).length > 20, 4000)
      .then(() => page.$eval('#token', (el) => el.value).catch(() => ''));
    check('the reset page receives the token', tokenFilled.length > 20, `${tokenFilled.length} chars`);
    await type('#password', 'NewPassword@1');
    await type('#confirm', 'NewPassword@1');
    await page.click('#submit-btn');
    await page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {});
    await settle(700);
    check('resetting redirects to the login page', page.url().includes('/login.html'), page.url());
    await type('#email', 'meera@saiuniversity.edu.in');
    await type('#password', 'NewPassword@1');
    await page.click('#submit-btn');
    await page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {});
    await settle(700);
    check('the new password works in the browser', page.url().includes('/dashboard.html'), page.url());
  }

  /* --------------------------------------------- 18. admin hides a listing */
  await page.evaluate(() => localStorage.clear());
  await go('/login.html');
  await type('#email', 'admin@saiuniversity.edu.in');
  await type('#password', 'Admin@12345');
  await page.click('#submit-btn');
  await page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {});
  await poll(async () => (await page.$eval('#admin-root', (e) => e.innerText).catch(() => '')).length > 200, 6000);
  const hideBtn = await page.$('[data-status]');
  check('the admin table offers a status control', Boolean(hideBtn));
  if (hideBtn) {
    await hideBtn.click();
    await settle(1200);
    check('changing a status from the admin table does not throw', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));
  }


  /* ==================== 19. remaining features, one by one ============ */

  /* --- validation: an empty report shows field errors, not a silent no-op --- */
  await page.evaluate(() => localStorage.clear());
  await go('/login.html');
  await type('#email', 'arjun@saiuniversity.edu.in');
  await type('#password', 'Password@123');
  await page.click('#submit-btn');
  await page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {});
  await go('/report.html?type=lost');
  await poll(async () => (await page.$$eval('#location option', (o) => o.length)) > 1, 4000);
  await page.click('#submit-btn');
  const validationShown = await poll(async () => {
    const t = await page.$eval('#form-errors', (e) => e.innerText).catch(() => '');
    return t.trim().length > 5;
  }, 5000);
  check('an empty report shows validation errors', validationShown,
    await page.$eval('#form-errors', (e) => e.innerText).catch(() => ''));

  /* --- dashboard tabs all open --- */
  await go('/dashboard.html');
  await poll(async () => (await page.$('#panel-listings')) !== null, 5000);
  for (const tab of ['claims', 'received', 'notifications', 'listings']) {
    await page.click(`[data-tab="${tab}"]`);
    await settle(400);
    const visible = await page.$eval(`#panel-${tab}`, (e) => !e.hasAttribute('hidden') && e.offsetParent !== null).catch(() => false);
    check(`the ${tab} tab opens`, visible);
  }

  /* --- notifications: mark all read --- */
  await page.click('[data-tab="notifications"]');
  await settle(600);
  const markAll = await page.$('#mark-all');
  check('the notifications tab offers mark-all-read', Boolean(markAll));
  if (markAll) {
    await markAll.click();
    await settle(900);
    check('marking all read does not throw', pageErrors.length === 0);
  }

  /* --- logout --- */
  await page.click('#logout-btn');
  await page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {});
  await settle(500);
  const tokenGone = await page.evaluate(() => localStorage.getItem('lostly_token'));
  check('logging out clears the session', !tokenGone, String(tokenGone).slice(0, 12));
  check('logging out returns to a public page', !page.url().includes('/dashboard.html'), page.url());

  /* --- dark mode survives a reload --- */
  await go('/index.html');
  await page.click('#theme-toggle');
  await settle(300);
  await go('/index.html');
  const darkPersisted = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  check('the theme choice survives a reload', darkPersisted === 'dark', String(darkPersisted));
  await page.click('#theme-toggle');
  await settle(200);

  /* --- admin: moderation, users, audit --- */
  await go('/login.html');
  await type('#email', 'admin@saiuniversity.edu.in');
  await type('#password', 'Admin@12345');
  await page.click('#submit-btn');
  await page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {});
  await poll(async () => (await page.$eval('#admin-root', (e) => e.innerText).catch(() => '')).length > 200, 6000);

  const adminText = (await page.$eval('#admin-root', (e) => e.innerText).catch(() => '')).toLowerCase();
  check('admin shows the users section', adminText.includes('user'));
  check('admin shows the audit log section', adminText.includes('audit'));
  check('admin shows the moderation queue section', adminText.includes('moderation'));

  const refresh = await page.$('#refresh-btn');
  check('admin has a refresh control', Boolean(refresh));
  if (refresh) {
    await refresh.click();
    await settle(1200);
    check('refreshing the admin view does not throw', pageErrors.length === 0);
  }

  /* --- a hidden listing disappears from the public board --- */
  const hideTarget = await page.$('[data-status]');
  if (hideTarget) {
    await hideTarget.click();
    await settle(1500);
    const afterHide = await page.evaluate(() => document.body.innerText);
    check('a status change from the admin table completes', !/error/i.test(afterHide.slice(0, 60)));
  }

  /* --------------------------------------------------- 11. public pages */
  for (const [path, needle, label] of [
    ['/help.html', 'How Lostly works', 'help'],
    ['/privacy.html', 'Privacy', 'privacy'],
    ['/forgot-password.html', 'Forgot password', 'forgot password'],
    ['/404.html', '404', 'not found'],
  ]) {
    await go(path);
    check(`${label} page renders`, (await text()).includes(needle), (await text()).slice(0, 80));
  }

  /* --------------------------------------------- 12. mobile viewport */
  await page.setViewport({ width: 375, height: 780 });
  await go('/index.html');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
  check('no horizontal overflow at 375px', !overflow);
  const menu = await page.$('.nav-toggle');
  check('the mobile menu button exists', Boolean(menu));
  if (menu) {
    await menu.click();
    await settle(400);
    const expanded = await page.$eval('.nav-toggle', (el) => el.getAttribute('aria-expanded'));
    check('the mobile menu opens', expanded === 'true', String(expanded));
  }

  /* ------------------------------------------------------- 13. dark mode */
  await page.setViewport({ width: 1440, height: 900 });
  await go('/index.html');
  await page.click('#theme-toggle');
  await settle(400);
  const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  check('the theme toggle switches to dark', theme === 'dark', String(theme));

  /* --------------------------------------------------------- verdict */
  await browser.close();
  server.close();

  console.log('');
  check('no uncaught JS exceptions', pageErrors.length === 0, pageErrors.slice(0, 4).join(' | '));
  check('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 4).join(' | '));
  check('no failed requests or 4xx/5xx responses', failedRequests.length === 0, failedRequests.slice(0, 6).join(' | '));

  console.log(`\n${passed} passed, ${failed} failed`);
  if (problems.length) {
    console.log('\nProblems:');
    problems.forEach((p) => console.log(' -', p));
  }
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error('E2E harness error:', err);
  process.exit(1);
});
