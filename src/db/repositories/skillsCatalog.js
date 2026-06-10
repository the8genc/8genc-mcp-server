/**
 * Skills catalog repository — the DB mirror of the GitHub skills repo, plus the
 * per-skill access tier that gates who can use each skill. GitHub stays the
 * source of truth for skill CONTENT; this catalog is the authority for ACCESS.
 */
import { query } from '../pool.js';

const COLS = `id, slug, name, description, tier, enabled, reference_files, source, repo, branch, synced_at, created_at, updated_at`;

export async function listCatalog() {
  const { rows } = await query(`SELECT ${COLS} FROM skills_catalog ORDER BY slug`);
  return rows;
}

export async function getById(id) {
  const { rows } = await query(`SELECT ${COLS} FROM skills_catalog WHERE id = $1`, [id]);
  return rows[0] || null;
}

export async function getBySlug(slug) {
  const { rows } = await query(`SELECT ${COLS} FROM skills_catalog WHERE slug = $1`, [slug]);
  return rows[0] || null;
}

/** Set the access tier ('admin'|'consultant'|'client') or null to unclassify. */
export async function setTier(id, tier) {
  const { rows } = await query(
    `UPDATE skills_catalog SET tier = $2, updated_at = now() WHERE id = $1 RETURNING ${COLS}`,
    [id, tier]
  );
  return rows[0] || null;
}

export async function setEnabled(id, enabled) {
  const { rows } = await query(
    `UPDATE skills_catalog SET enabled = $2, updated_at = now() WHERE id = $1 RETURNING ${COLS}`,
    [id, enabled]
  );
  return rows[0] || null;
}

/**
 * Upsert GitHub skills into the catalog. New rows get `defaultTier`; existing
 * rows preserve their (admin-classified) tier and enabled flag — only the
 * GitHub-derived fields refresh. Returns { upserted, inserted }.
 * @param {Array<{slug:string,name?:string,description?:string,references?:string[],path?:string}>} skills
 * @param {{defaultTier?:string|null, repo?:string, branch?:string}} [opts]
 */
export async function upsertFromGithub(skills, { defaultTier = null, repo = null, branch = null } = {}) {
  let inserted = 0;
  for (const s of skills) {
    const source = s.path && repo && branch
      ? `https://github.com/${repo}/blob/${branch}/${s.path}`
      : null;
    const { rows } = await query(
      `INSERT INTO skills_catalog (slug, name, description, tier, reference_files, source, repo, branch, synced_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
       ON CONFLICT (slug) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         reference_files = EXCLUDED.reference_files,
         source = EXCLUDED.source,
         repo = EXCLUDED.repo,
         branch = EXCLUDED.branch,
         synced_at = now(),
         updated_at = now()
       RETURNING (xmax = 0) AS is_insert`,
      [s.slug, s.name || s.slug, s.description || null, defaultTier, s.references || [], source, repo, branch]
    );
    if (rows[0]?.is_insert) inserted += 1;
  }
  return { upserted: skills.length, inserted };
}
