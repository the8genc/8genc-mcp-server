/** Email verification / password-reset tokens. Stored hashed; single-use. */
import { query } from '../pool.js';

export async function create({ userId, purpose, tokenHash, expiresAt }) {
  const { rows } = await query(
    `INSERT INTO email_tokens (user_id, purpose, token_hash, expires_at)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [userId, purpose, tokenHash, expiresAt]
  );
  return rows[0];
}

/** Look up an unused, unexpired token by hash + purpose. */
export async function findValid(tokenHash, purpose) {
  const { rows } = await query(
    `SELECT id, user_id FROM email_tokens
     WHERE token_hash = $1 AND purpose = $2 AND used_at IS NULL AND expires_at > now()`,
    [tokenHash, purpose]
  );
  return rows[0] || null;
}

export async function markUsed(id) {
  await query(`UPDATE email_tokens SET used_at = now() WHERE id = $1`, [id]);
}

/** Invalidate any outstanding tokens of a purpose for a user (e.g. before issuing a new one). */
export async function invalidateForUser(userId, purpose) {
  await query(
    `UPDATE email_tokens SET used_at = now()
     WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL`,
    [userId, purpose]
  );
}
