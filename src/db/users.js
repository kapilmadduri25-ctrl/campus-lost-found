const crypto = require('crypto');
const { query } = require('../config/db');
const { mapUser } = require('./mappers');

const COLUMNS = 'id, name, email, role, department, phone, is_active, created_at, updated_at';

async function createUser({ name, email, password, role = 'student', department = null, phone = null }) {
  const { rows } = await query(
    `insert into users (id, name, email, password, role, department, phone)
     values ($1, $2, lower($3), $4, $5, $6, $7)
     returning ${COLUMNS}`,
    [crypto.randomUUID(), name, email, password, role, department, phone]
  );
  return mapUser(rows[0]);
}

/** Returns the row including the bcrypt hash — only for the login flow. */
async function findUserForLogin(email) {
  const { rows } = await query(
    `select ${COLUMNS}, password from users where lower(email) = lower($1)`,
    [email]
  );
  return rows[0] || null;
}

async function findUserById(id, { includePrivate = false } = {}) {
  const { rows } = await query(`select ${COLUMNS} from users where id = $1`, [id]);
  return rows[0] ? mapUser(rows[0], { includePrivate }) : null;
}

async function updateUser(id, fields) {
  const allowed = { name: 'name', department: 'department', phone: 'phone' };
  const sets = [];
  const params = [];
  Object.entries(fields).forEach(([key, value]) => {
    if (allowed[key] && value !== undefined) {
      params.push(value);
      sets.push(`${allowed[key]} = $${params.length}`);
    }
  });
  if (!sets.length) return findUserById(id);

  params.push(id);
  const { rows } = await query(
    `update users set ${sets.join(', ')}, updated_at = now() where id = $${params.length} returning ${COLUMNS}`,
    params
  );
  return rows[0] ? mapUser(rows[0]) : null;
}

async function updatePassword(id, passwordHash) {
  await query('update users set password = $2, updated_at = now() where id = $1', [id, passwordHash]);
}

async function listUsers() {
  const { rows } = await query(`select ${COLUMNS} from users order by created_at desc`);
  return rows.map((row) => mapUser(row));
}

async function setRole(id, role) {
  const { rows } = await query(
    `update users set role = $2, updated_at = now() where id = $1 returning ${COLUMNS}`,
    [id, role]
  );
  return rows[0] ? mapUser(rows[0]) : null;
}

async function setActive(id, isActive) {
  const { rows } = await query(
    `update users set is_active = $2, updated_at = now() where id = $1 returning ${COLUMNS}`,
    [id, isActive]
  );
  return rows[0] ? mapUser(rows[0]) : null;
}

async function countUsers() {
  const { rows } = await query('select count(*)::int as count from users');
  return rows[0].count;
}

module.exports = { createUser, findUserForLogin, findUserById, updateUser, updatePassword, listUsers, setRole, setActive, countUsers };
