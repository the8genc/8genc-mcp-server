/** OAuth authorization codes (single-use, PKCE, short TTL). */
import { query } from '../pool.js';

export async function create({ code, clientId, userId, redirectUri, codeChallenge, scopes, resource, expiresAt }) {
  await query(
    `INSERT INTO authorization_codes (code, client_id, user_id, redirect_uri, code_challenge, scopes, resource, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [code, clientId, userId, redirectUri, codeChallenge, scopes || [], resource || null, expiresAt]
  );
}

export async function get(code) {
  const { rows } = await query('SELECT * FROM authorization_codes WHERE code = $1', [code]);
  return rows[0] || null;
}

/** Atomically consume a code (single-use). Returns the row if it was valid+unconsumed. */
export async function consume(code) {
  const { rows } = await query(
    `UPDATE authorization_codes SET consumed_at = now()
     WHERE code = $1 AND consumed_at IS NULL AND expires_at > now()
     RETURNING *`,
    [code]
  );
  return rows[0] || null;
}
