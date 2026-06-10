/**
 * Per-user skill access overrides + the combined access set used by the MCP
 * enforcement layer. An override ('allow'|'deny') wins over the skill's tier.
 */
import { query } from '../pool.js';

/**
 * Load this user's access set in one round-trip: every catalog skill joined
 * with the user's override (if any). Returns a Map keyed by slug →
 * { tier, enabled, override }. Pass into canUserAccess() from src/auth/access.js.
 */
export async function loadAccessSet(userId) {
  const { rows } = await query(
    `SELECT c.slug, c.tier, c.enabled, o.effect AS override
       FROM skills_catalog c
       LEFT JOIN skill_access_overrides o
         ON o.skill_id = c.id AND o.user_id = $1`,
    [userId]
  );
  const map = new Map();
  for (const r of rows) {
    map.set(r.slug, { tier: r.tier, enabled: r.enabled, override: r.override });
  }
  return map;
}

/** List a user's overrides with the skill slug joined in (for the dashboard). */
export async function listOverrides(userId) {
  const { rows } = await query(
    `SELECT o.id, o.skill_id, o.effect, c.slug
       FROM skill_access_overrides o
       JOIN skills_catalog c ON c.id = o.skill_id
      WHERE o.user_id = $1
      ORDER BY c.slug`,
    [userId]
  );
  return rows;
}

/**
 * Set (allow/deny) or clear (effect = null) a user's override for one skill.
 * Returns the override row, or null when cleared.
 */
export async function setOverride(userId, skillId, effect, createdBy = null) {
  if (effect === null || effect === undefined) {
    await query(`DELETE FROM skill_access_overrides WHERE user_id = $1 AND skill_id = $2`, [userId, skillId]);
    return null;
  }
  const { rows } = await query(
    `INSERT INTO skill_access_overrides (user_id, skill_id, effect, created_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, skill_id) DO UPDATE SET
       effect = EXCLUDED.effect,
       created_by = EXCLUDED.created_by,
       created_at = now()
     RETURNING id, user_id, skill_id, effect, created_at`,
    [userId, skillId, effect, createdBy]
  );
  return rows[0];
}
