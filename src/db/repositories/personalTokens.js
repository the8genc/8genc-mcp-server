/** Personal access tokens (PATs) repository. Tokens are stored hashed only. */
import { query } from '../pool.js';

export async function createToken({ userId, name, tokenHash, expiresAt = null }) {
  const { rows } = await query(
    `INSERT INTO personal_access_tokens (user_id, name, token_hash, expires_at)
     VALUES ($1, $2, $3, $4)
     RETURNING id, user_id, name, last_used_at, expires_at, revoked_at, created_at`,
    [userId, name, tokenHash, expiresAt]
  );
  return rows[0];
}

export async function findByHash(tokenHash) {
  const { rows } = await query(
    `SELECT id, user_id, name, expires_at, revoked_at FROM personal_access_tokens WHERE token_hash = $1`,
    [tokenHash]
  );
  return rows[0] || null;
}

export async function listForUser(userId) {
  const { rows } = await query(
    `SELECT id, name, last_used_at, expires_at, revoked_at, created_at
     FROM personal_access_tokens WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );
  return rows;
}

export async function revoke(id, userId) {
  const { rowCount } = await query(
    `UPDATE personal_access_tokens SET revoked_at = now()
     WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL`,
    [id, userId]
  );
  return rowCount > 0;
}

export async function touchLastUsed(id) {
  await query(`UPDATE personal_access_tokens SET last_used_at = now() WHERE id = $1`, [id]);
}
