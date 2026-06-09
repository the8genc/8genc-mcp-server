/** OAuth registered clients (dynamic client registration). */
import { query } from '../pool.js';

function toClientInfo(row) {
  if (!row) return null;
  return {
    client_id: row.client_id,
    client_secret: row.client_secret || undefined,
    client_secret_expires_at: row.client_secret_expires_at ? Number(row.client_secret_expires_at) : undefined,
    client_name: row.client_name || undefined,
    redirect_uris: row.redirect_uris,
    grant_types: row.grant_types,
    scope: row.scope || undefined,
    token_endpoint_auth_method: row.token_endpoint_auth_method || undefined,
    client_id_issued_at: row.client_id_issued_at ? Number(row.client_id_issued_at) : undefined
  };
}

export async function getClient(clientId) {
  const { rows } = await query('SELECT * FROM oauth_clients WHERE client_id = $1', [clientId]);
  return toClientInfo(rows[0]);
}

/** Persist a client from dynamic registration. Returns the stored OAuthClientInformationFull. */
export async function registerClient(client) {
  const { rows } = await query(
    `INSERT INTO oauth_clients
       (client_id, client_secret, client_secret_expires_at, client_name, redirect_uris,
        grant_types, scope, token_endpoint_auth_method, client_id_issued_at, metadata)
     VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      client.client_id || null,
      client.client_secret || null,
      client.client_secret_expires_at ?? null,
      client.client_name || null,
      client.redirect_uris || [],
      client.grant_types || ['authorization_code', 'refresh_token'],
      client.scope || null,
      client.token_endpoint_auth_method || 'none',
      client.client_id_issued_at ?? Math.floor(Date.now() / 1000),
      client.metadata ? JSON.stringify(client.metadata) : null
    ]
  );
  return toClientInfo(rows[0]);
}
