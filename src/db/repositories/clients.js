/**
 * Clients repository — client tenants + membership. A client owns a shared
 * data-scope (coda_files/variables/notes) and a ZeroDB memory namespace; members
 * are the users allowed to read/write that context (admins bypass — enforced in
 * the server, not here). Raw SQL via query() (the repo convention).
 */
import { query } from '../pool.js';

const COLS = `id, slug, name, status, coda_files, variables, notes, created_by, updated_by, created_at, updated_at`;

const slugify = (s) =>
  String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'client';

export async function listAll({ includeArchived = false } = {}) {
  const { rows } = includeArchived
    ? await query(`SELECT ${COLS} FROM clients ORDER BY name`)
    : await query(`SELECT ${COLS} FROM clients WHERE status = 'active' ORDER BY name`);
  return rows;
}

export async function getById(id) {
  const { rows } = await query(`SELECT ${COLS} FROM clients WHERE id = $1`, [id]);
  return rows[0] || null;
}

export async function getBySlug(slug) {
  const { rows } = await query(`SELECT ${COLS} FROM clients WHERE slug = $1`, [slug]);
  return rows[0] || null;
}

/** Resolve a slug-or-id reference to a client row (id takes precedence). */
export async function resolveRef(ref) {
  if (!ref) return null;
  if (/^[0-9a-f-]{36}$/i.test(ref)) return getById(ref);
  return getBySlug(ref);
}

export async function createClient({ name, slug, createdBy = null }) {
  const base = slug ? slugify(slug) : slugify(name);
  // ensure unique slug (append -2, -3, … on conflict)
  let candidate = base;
  for (let i = 2; ; i++) {
    const existing = await getBySlug(candidate);
    if (!existing) break;
    candidate = `${base}-${i}`;
    if (i > 50) throw new Error('could not derive a unique client slug');
  }
  const { rows } = await query(
    `INSERT INTO clients (slug, name, created_by, updated_by) VALUES ($1, $2, $3, $3) RETURNING ${COLS}`,
    [candidate, name, createdBy]
  );
  return rows[0];
}

export async function setStatus(id, status, by = null) {
  const { rows } = await query(
    `UPDATE clients SET status = $2, updated_by = $3, updated_at = now() WHERE id = $1 RETURNING ${COLS}`,
    [id, status, by]
  );
  return rows[0] || null;
}

export async function updateScope(id, { name, coda_files, variables, notes } = {}, by = null) {
  const { rows } = await query(
    `UPDATE clients SET
       name        = COALESCE($2, name),
       coda_files  = COALESCE($3::jsonb, coda_files),
       variables   = COALESCE($4::jsonb, variables),
       notes       = COALESCE($5, notes),
       updated_by  = $6,
       updated_at  = now()
     WHERE id = $1 RETURNING ${COLS}`,
    [
      id,
      name ?? null,
      coda_files === undefined ? null : JSON.stringify(coda_files),
      variables === undefined ? null : JSON.stringify(variables),
      notes === undefined ? null : notes,
      by
    ]
  );
  return rows[0] || null;
}

// ── Membership ──────────────────────────────────────────────────
export async function addMember(clientId, userId, by = null) {
  const { rows } = await query(
    `INSERT INTO client_members (client_id, user_id, created_by)
     VALUES ($1, $2, $3)
     ON CONFLICT (client_id, user_id) DO NOTHING
     RETURNING id, client_id, user_id, created_at`,
    [clientId, userId, by]
  );
  return rows[0] || null;
}

export async function removeMember(clientId, userId) {
  await query(`DELETE FROM client_members WHERE client_id = $1 AND user_id = $2`, [clientId, userId]);
}

export async function listMembers(clientId) {
  const { rows } = await query(
    `SELECT u.id, u.username, u.email, u.role
       FROM client_members m JOIN users u ON u.id = m.user_id
      WHERE m.client_id = $1
      ORDER BY u.username`,
    [clientId]
  );
  return rows;
}

/** Active clients a user is a member of (id, slug, name, scope). */
export async function listForUser(userId) {
  const { rows } = await query(
    `SELECT ${COLS.split(', ').map((c) => `c.${c}`).join(', ')}
       FROM client_members m JOIN clients c ON c.id = m.client_id
      WHERE m.user_id = $1 AND c.status = 'active'
      ORDER BY c.name`,
    [userId]
  );
  return rows;
}

/** Just the client ids a user belongs to — the membership set for access checks. */
export async function listMemberClientIds(userId) {
  const { rows } = await query(`SELECT client_id FROM client_members WHERE user_id = $1`, [userId]);
  return rows.map((r) => r.client_id);
}
