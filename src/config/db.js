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

module.exports = { connectDB, query, withTransaction, closeDB, _setPool, createPool };
