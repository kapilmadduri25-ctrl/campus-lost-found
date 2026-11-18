/**
 * Seed script — fills the Postgres database with demo data.
 *
 *   npm run seed              -> adds demo data only if the database is empty
 *   npm run seed -- --reset   -> deletes all rows, then re-seeds
 *
 * Demo logins (password for all students: Password@123)
 *   admin@saiuniversity.edu.in   (admin)
 *   arjun@saiuniversity.edu.in   (student)
 *   meera@saiuniversity.edu.in   (student)
 *   rahul@saiuniversity.edu.in   (student)
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { connectDB, query, closeDB } = require('./config/db');
const users = require('./db/users');
const items = require('./db/items');
const claims = require('./db/claims');
const notifications = require('./db/notifications');
const auditLogs = require('./db/auditLogs');

const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

const ITEMS = [
  { title: 'Black Dell Inspiron Laptop', category: 'Electronics', type: 'found', location: 'Main Library', description: 'Found a black Dell laptop with a blue sticker on the lid, left on the second floor reading table near the windows.', private: 'Serial number ends 8821; login screen shows a photo wallpaper.', days: 1, status: 'active' },
  { title: 'Student ID Card - R. Sharma', category: 'ID Card', type: 'found', location: 'Cafeteria', description: 'Found a student ID card near the payment counter. Card number ends with 4471.', private: 'Full card number kept private for verification.', days: 2, status: 'active' },
  { title: 'Blue Water Bottle', category: 'Other', type: 'lost', location: 'Sports Complex', description: 'Lost my navy blue steel water bottle during basketball practice. It has a dent on the base.', private: 'Name sticker inside the cap reads "A. Rao".', days: 3, status: 'active' },
  { title: 'Scientific Calculator FX-991', category: 'Electronics', type: 'lost', location: 'Block A - Academic', description: 'Lost a Casio FX-991 calculator in the second-floor classroom. Name written inside the battery cover.', private: '', days: 4, status: 'active' },
  { title: 'Brown Leather Wallet', category: 'Wallet & Cards', type: 'found', location: 'Bus Stop', description: 'Brown wallet found near the college bus stop. Contains a metro card and some cash. Owner must describe the contents.', private: 'Also contains a library card in the name of a second-year student.', days: 5, status: 'active' },
  { title: 'Data Structures Textbook', category: 'Books & Notes', type: 'found', location: 'Computer Lab 1', description: 'Found a copy of Cormen "Introduction to Algorithms" left in Computer Lab 1 after the afternoon practical.', private: '', days: 6, status: 'resolved' },
  { title: 'Hostel Room Keys', category: 'Keys', type: 'lost', location: 'Hostel Block', description: 'Lost my hostel room key ring with two keys and a small red tag somewhere between the mess and Block B.', private: 'Room number is on the tag - please do not publish it.', days: 7, status: 'active' },
  { title: 'Navy Blue Hoodie', category: 'Clothing', type: 'lost', location: 'Auditorium', description: 'Left a navy blue hoodie on a seat after the tech fest closing ceremony. Has a small tear on the left cuff.', private: '', days: 8, status: 'active' },
  { title: 'Wireless Earbuds Case', category: 'Accessories', type: 'found', location: 'Parking Area', description: 'Found a white earbuds charging case near the two-wheeler parking rows. No earbuds inside.', private: 'Case has a scratch on the hinge.', days: 9, status: 'claim_requested' },
  { title: 'Badminton Racket', category: 'Sports Equipment', type: 'found', location: 'Sports Complex', description: 'Yonex badminton racket with a black grip left on the court side bench after the evening slot.', private: '', days: 10, status: 'active' },
  { title: 'Spectacles with Brown Frame', category: 'Accessories', type: 'lost', location: 'Block B - Academic', description: 'Lost my prescription spectacles with a brown rectangular frame, probably in the seminar hall.', private: 'Left lens has a small chip near the nose bridge.', days: 12, status: 'active' },
  { title: 'Pen Drive 64 GB', category: 'Electronics', type: 'lost', location: 'Computer Lab 2', description: 'Lost a SanDisk 64 GB pen drive with a green lanyard. Contains my semester project files.', private: 'Folder name on the drive is "sem5-project-final".', days: 14, status: 'active' },
  { title: 'Blue School Bag', category: 'Bags', type: 'found', location: 'Cafeteria', description: 'Found a blue backpack with a broken zip on the left strap, left under a table near the juice counter.', private: 'Contains a notebook with a student name on the cover.', days: 15, status: 'pending' },
];

async function run() {
  const reset = process.argv.includes('--reset');
  await connectDB();

  const { rows } = await query('select count(*)::int as count from items');
  if (rows[0].count > 0 && !reset) {
    console.log(`[seed] Database already has ${rows[0].count} items. Re-run with: npm run seed -- --reset`);
    await closeDB();
    return;
  }

  if (reset) {
    console.log('[seed] --reset given: clearing every table...');
    await query('delete from audit_logs');
    await query('delete from notifications');
    await query('delete from claims');
    await query('delete from items');
    await query('delete from users');
  }

  const adminEmail = process.env.ADMIN_EMAIL || 'admin@saiuniversity.edu.in';
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@12345';
  const hash = (pwd) => bcrypt.hash(pwd, 10);

  let admin = await users.findUserForLogin(adminEmail);
  if (!admin) {
    await users.createUser({
      name: 'Portal Administrator',
      email: adminEmail,
      password: await hash(adminPassword),
      role: 'admin',
      department: 'School of Computing and Data Science',
    });
    console.log(`[seed] admin created: ${adminEmail}`);
  }
  admin = await users.findUserForLogin(adminEmail);

  const studentSeed = [
    { name: 'Arjun Rao', email: 'arjun@saiuniversity.edu.in', department: 'B.Tech CSE - Year 3', phone: '9876500001' },
    { name: 'Meera Iyer', email: 'meera@saiuniversity.edu.in', department: 'B.Tech CSE - Year 2', phone: '9876500002' },
    { name: 'Rahul Sharma', email: 'rahul@saiuniversity.edu.in', department: 'B.Tech CSE - Year 2', phone: '9876500003' },
  ];

  const students = [];
  for (const s of studentSeed) {
    let existing = await users.findUserForLogin(s.email);
    if (!existing) {
      const created = await users.createUser({ ...s, password: await hash('Password@123'), role: 'student' });
      existing = { id: created._id };
    }
    students.push(existing);
  }
  console.log(`[seed] ${students.length} student accounts ready (password: Password@123)`);

  const created = [];
  for (let index = 0; index < ITEMS.length; index += 1) {
    const spec = ITEMS[index];
    const item = await items.createItem({
      title: spec.title,
      description: spec.description,
      descriptionPrivate: spec.private,
      category: spec.category,
      type: spec.type,
      location: spec.location,
      dateLostOrFound: daysAgo(spec.days),
      contactInfo: 'Reach me on the college WhatsApp group or use the claim form',
      status: spec.status,
      reporter: students[index % students.length].id,
    });
    // back-date the rows so the home page has a natural spread
    await query('update items set created_at = $2, updated_at = $2 where id = $1', [item._id, daysAgo(spec.days)]);
    if (spec.status === 'resolved') {
      await query('update items set resolved_at = $2 where id = $1', [item._id, daysAgo(Math.max(spec.days - 1, 1))]);
    }
    created.push(item);
  }
  console.log(`[seed] ${created.length} sample items inserted`);

  /* ---- claim + notification -------------------------------------------- */
  const found = created.find((i) => i.type === 'found' && i.status === 'active');
  if (found) {
    const claimant = students.find((s) => String(s.id) !== String(found.reporter._id));
    await claims.create({
      item: found._id,
      claimant: claimant.id,
      message: 'This looks like my laptop. I can describe the sticker and the login screen wallpaper.',
      proof: 'Purchase invoice from 2024 and the serial number ending 8821.',
    });
    await notifications.create({
      user: found.reporter._id,
      type: 'claim',
      message: `${claimant.name || 'A student'} submitted a claim on your listing "${found.title}"`,
      item: found._id,
    });
    console.log('[seed] 1 pending claim created');
  }

  /* ---- audit trail sample ---------------------------------------------- */
  await auditLogs.create({
    actor: admin.id,
    actorName: 'Portal Administrator',
    action: 'item.moderated',
    entityType: 'item',
    entityId: created[created.length - 1]._id,
    reason: 'Awaiting owner details before publishing',
    metadata: { moderation: 'pending', to: 'pending', title: created[created.length - 1].title },
  });
  await auditLogs.create({
    actor: students[0].id,
    actorName: 'Arjun Rao',
    action: 'item.created',
    entityType: 'item',
    entityId: created[0]._id,
    metadata: { title: created[0].title, type: created[0].type, status: created[0].status },
  });
  console.log('[seed] 2 audit log entries created');

  console.log('\n[seed] Done. Demo logins:');
  console.log(`  admin   : ${adminEmail} / ${adminPassword}`);
  console.log('  student : arjun@saiuniversity.edu.in / Password@123');
  console.log('  student : meera@saiuniversity.edu.in / Password@123\n');

  await closeDB();
}

run().catch(async (err) => {
  console.error('[seed] failed:', err.message);
  await closeDB();
  process.exit(1);
});
