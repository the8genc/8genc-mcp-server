/** OAuth refresh tokens (stored hashed; rotated on use). */
import { query } from '../pool.js';

export async function create({ userId, clientId, tokenHash, scopes, resource, expiresAt }) {
  const { rows } = await query(
    `INSERT INTO refresh_tokens (user_id, client_id, token_hash, scopes, resource, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [userId, clientId, tokenHash, scopes || [], resource || null, expiresAt]
  );
  return rows[0];
}

export async function findValid(tokenHash) {
  const { rows } = await query(
    `SELECT * FROM refresh_tokens WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()`,
    [tokenHash]
  );
  return rows[0] || null;
}

export async function revokeByHash(tokenHash) {
  await query('UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL', [tokenHash]);
}
