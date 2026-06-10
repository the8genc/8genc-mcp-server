/**
 * Per-user client data-scope. Holds POINTERS (Coda docs + arbitrary variables +
 * notes) that get injected into a skill/prompt's context at request time — the
 * server never fetches Coda content itself; the agent does so via its own Coda
 * MCP. coda_files is [{ doc_id, url, label }]; variables is free-form key/value.
 */
import { query } from '../pool.js';

const COLS = `id, user_id, coda_files, variables, notes, updated_by, created_at, updated_at`;

export async function get(userId) {
  const { rows } = await query(`SELECT ${COLS} FROM client_contexts WHERE user_id = $1`, [userId]);
  return rows[0] || null;
}

/** Create or replace a user's data-scope. */
export async function upsert(userId, { coda_files = [], variables = {}, notes = null } = {}, updatedBy = null) {
  const { rows } = await query(
    `INSERT INTO client_contexts (user_id, coda_files, variables, notes, updated_by)
     VALUES ($1, $2::jsonb, $3::jsonb, $4, $5)
     ON CONFLICT (user_id) DO UPDATE SET
       coda_files = EXCLUDED.coda_files,
       variables = EXCLUDED.variables,
       notes = EXCLUDED.notes,
       updated_by = EXCLUDED.updated_by,
       updated_at = now()
     RETURNING ${COLS}`,
    [userId, JSON.stringify(coda_files), JSON.stringify(variables), notes, updatedBy]
  );
  return rows[0];
}
