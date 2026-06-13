/**
 * DB-backed tool-credential store. The admin registry (tool_registry) holds per-tool
 * policy + env var names; client_tool_credentials holds each client's keys ENCRYPTED at
 * rest (src/credentials/crypto.js). Decrypted values surface only via getClientEnv (used
 * by the resolver at resolution time) — never returned by status/list helpers.
 */
import { query } from '../pool.js';
import { encryptJson, decryptJson } from '../../credentials/crypto.js';

// ── Admin registry ──────────────────────────────────────────────
export async function listRegistry() {
  const { rows } = await query(
    `SELECT token, policy, env_keys, command, args FROM tool_registry ORDER BY token`
  );
  return rows;
}

/** Insert any default tools that aren't already present (idempotent seed). */
export async function seedRegistry(tools = {}) {
  for (const [token, t] of Object.entries(tools)) {
    await query(
      `INSERT INTO tool_registry (token, policy, env_keys, command, args)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       ON CONFLICT (token) DO NOTHING`,
      [token, t.policy || 'shared', t.envKeys || [], t.command || null, JSON.stringify(t.args ?? null)]
    );
  }
}

export async function upsertRegistryTool(token, { policy, envKeys, command, args } = {}, by = null) {
  const { rows } = await query(
    `INSERT INTO tool_registry (token, policy, env_keys, command, args, updated_by)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6)
     ON CONFLICT (token) DO UPDATE SET
       policy     = COALESCE($2, tool_registry.policy),
       env_keys   = COALESCE($3, tool_registry.env_keys),
       command    = $4,
       args       = $5::jsonb,
       updated_by = $6,
       updated_at = now()
     RETURNING token, policy, env_keys, command, args`,
    [token, policy ?? null, envKeys ?? null, command ?? null, JSON.stringify(args ?? null), by]
  );
  return rows[0];
}

// ── Per-client credentials (encrypted) ──────────────────────────
/** Flat decrypted env map for a client across all its tools ({ KEY: value, ... }). */
export async function getClientEnv(clientId) {
  const { rows } = await query(
    `SELECT token, env_encrypted FROM client_tool_credentials WHERE client_id = $1`,
    [clientId]
  );
  const env = {};
  for (const r of rows) {
    try {
      Object.assign(env, decryptJson(r.env_encrypted));
    } catch (err) {
      console.error(`[credentials] failed to decrypt creds for client ${clientId} / ${r.token}: ${err.message}`);
    }
  }
  return env;
}

/** Which tokens a client has connected (no secrets). */
export async function listClientTokens(clientId) {
  const { rows } = await query(`SELECT token FROM client_tool_credentials WHERE client_id = $1 ORDER BY token`, [clientId]);
  return rows.map((r) => r.token);
}

/** Store/replace a client's keys for one tool (encrypted). `env` is { KEY: value, ... }. */
export async function setClientToolEnv(clientId, token, env, by = null) {
  const { rows } = await query(
    `INSERT INTO client_tool_credentials (client_id, token, env_encrypted, updated_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (client_id, token) DO UPDATE SET
       env_encrypted = EXCLUDED.env_encrypted,
       updated_by    = EXCLUDED.updated_by,
       updated_at    = now()
     RETURNING id, client_id, token, updated_at`,
    [clientId, token, encryptJson(env || {}), by]
  );
  return rows[0];
}

export async function deleteClientToolEnv(clientId, token) {
  await query(`DELETE FROM client_tool_credentials WHERE client_id = $1 AND token = $2`, [clientId, token]);
}
