/** Users repository. */
import { query } from '../pool.js';

const COLS = `id, username, email, password_hash, role, status, email_verified, must_change_password, created_at, updated_at`;

export async function findById(id) {
  const { rows } = await query(`SELECT ${COLS} FROM users WHERE id = $1`, [id]);
  return rows[0] || null;
}

export async function findByUsername(username) {
  const { rows } = await query(`SELECT ${COLS} FROM users WHERE username = $1`, [username]);
  return rows[0] || null;
}

export async function findByEmail(email) {
  if (!email) return null;
  const { rows } = await query(`SELECT ${COLS} FROM users WHERE lower(email) = lower($1)`, [email]);
  return rows[0] || null;
}

/** Find by username OR email (login identifier). */
export async function findByIdentifier(identifier) {
  const { rows } = await query(
    `SELECT ${COLS} FROM users WHERE username = $1 OR lower(email) = lower($1) LIMIT 1`,
    [identifier]
  );
  return rows[0] || null;
}

export async function createUser({ username, email = null, passwordHash = null, status = 'pending', role = 'user', emailVerified = false }) {
  const { rows } = await query(
    `INSERT INTO users (username, email, password_hash, role, status, email_verified)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${COLS}`,
    [username, email, passwordHash, role, status, emailVerified]
  );
  return rows[0];
}

export async function setPassword(id, passwordHash, { clearMustChange = true } = {}) {
  const { rows } = await query(
    `UPDATE users SET password_hash = $2,
        must_change_password = CASE WHEN $3 THEN false ELSE must_change_password END,
        updated_at = now()
     WHERE id = $1 RETURNING ${COLS}`,
    [id, passwordHash, clearMustChange]
  );
  return rows[0] || null;
}

export async function setStatus(id, status) {
  const { rows } = await query(
    `UPDATE users SET status = $2, updated_at = now() WHERE id = $1 RETURNING ${COLS}`,
    [id, status]
  );
  return rows[0] || null;
}

export async function setRole(id, role) {
  const { rows } = await query(
    `UPDATE users SET role = $2, updated_at = now() WHERE id = $1 RETURNING ${COLS}`,
    [id, role]
  );
  return rows[0] || null;
}

export async function setEmailVerified(id, verified = true) {
  const { rows } = await query(
    `UPDATE users SET email_verified = $2, updated_at = now() WHERE id = $1 RETURNING ${COLS}`,
    [id, verified]
  );
  return rows[0] || null;
}

export async function listUsers({ status = null, limit = 200 } = {}) {
  const { rows } = status
    ? await query(`SELECT ${COLS} FROM users WHERE status = $1 ORDER BY created_at DESC LIMIT $2`, [status, limit])
    : await query(`SELECT ${COLS} FROM users ORDER BY created_at DESC LIMIT $1`, [limit]);
  return rows;
}

/** Strip sensitive fields before sending to a client. */
export function publicUser(u) {
  if (!u) return null;
  const { password_hash, ...safe } = u;
  return safe;
}
