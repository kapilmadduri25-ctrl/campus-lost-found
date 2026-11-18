/**
 * Creates the tables, indexes and constraints from db/schema.sql.
 *
 *   npm run db:setup
 *
 * Safe to run more than once — every statement is "create ... if not exists".
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { connectDB, query, closeDB } = require('../src/config/db');

(async () => {
  try {
    await connectDB();
    const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
    await query(sql);
    console.log('[db:setup] schema applied (tables, indexes and constraints are up to date)');
    await closeDB();
  } catch (err) {
    console.error('[db:setup] failed:', err.message);
    await closeDB();
    process.exit(1);
  }
})();
