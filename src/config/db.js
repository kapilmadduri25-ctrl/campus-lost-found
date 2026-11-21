const { Pool } = require('pg');

let pool = null;

/** Supabase (and most hosted Postgres) require SSL; local Postgres usually does not. */
function sslOption(connectionString = '') {
  if (/sslmode=disable/.test(connectionString)) return false;
  if (/supabase\.co|supabase\.com|sslmode=require|render\.com/.test(connectionString)) {
    return { rejectUnauthorized: false };
  }
  return process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false;
}

function createPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is missing. Copy .env.example to .env and paste your Supabase connection string.');
  }
  return new Pool({
    connectionString,
    ssl: sslOption(connectionString),
    max: Number(process.env.PG_POOL_MAX || 5),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
}

/** Connects and verifies the database with a trivial query. */
async function connectDB() {
  if (!pool) pool = createPool();
  const { rows } = await pool.query('select now() as now');
  console.log(`[db] PostgreSQL connected (server time ${rows[0].now.toISOString()})`);
  return pool;
}

/** Run one parameterised query. Never interpolate user input into SQL. */
async function query(text, params = []) {
  if (!pool) pool = createPool();
  return pool.query(text, params);
}

/** Run several statements inside a transaction; rolls back on any error. */
async function withTransaction(fn) {
  if (!pool) pool = createPool();
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Applies db/schema.sql on boot. Every statement is CREATE ... IF NOT EXISTS, so it is
 * safe on every deploy and means a new table never depends on someone remembering to run
 * a command - which matters because Render's Shell is a paid feature.
 * Set AUTO_MIGRATE=false to skip it.
 */
async function migrate() {
  if (process.env.AUTO_MIGRATE === 'false') return false;
  const fs = require('fs');
  const path = require('path');
  const file = path.join(__dirname, '..', '..', 'db', 'schema.sql');
  if (!fs.existsSync(file)) return false;

  // Statement by statement, so one object that already exists cannot abort the rest.
  const sql = fs.readFileSync(file, 'utf8');
  const statements = sql
    .split(/;\s*(?:\r?\n|$)/)
    .map((chunk) => chunk.split('\n').filter((line) => !line.trim().startsWith('--')).join('\n').trim())
    .filter(Boolean);

  let applied = 0;
  for (const statement of statements) {
    try {
      await query(statement);
      applied += 1;
    } catch (err) {
      if (!/already exists/i.test(err.message)) throw err;
    }
  }

  console.log(`[db] schema up to date (${applied} statements checked)`);
  return true;
}

async function closeDB() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/** Used by the pg-mem test harness to inject an in-memory database. */
function _setPool(customPool) {
  pool = customPool;
}

module.exports = {
  connectDB,
  migrate, query, withTransaction, closeDB, _setPool, createPool };
