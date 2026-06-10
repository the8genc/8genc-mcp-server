/**
 * Role-based access — the PURE decision core (no I/O, fully unit-testable).
 *
 * Three access classes plus a legacy/unclassified role:
 *   admin       — every skill + tool
 *   consultant  — skills tiered consultant or client (the working default)
 *   client      — only skills explicitly allow-listed (or tiered 'client')
 *   user        — legacy/unclassified: platform discovery only, no tiered skills
 *
 * A skill's `tier` is the default gate; a per-user `override` ('allow'|'deny')
 * wins over it. NULL tier = unclassified = admin-only until classified.
 *
 * Identity arrives from the bearer verifier as authInfo.extra = { userId, role,
 * status, pat? } (see src/auth/bearerVerifier.js). When there is no authInfo
 * (local stdio / no-auth HTTP), the caller is the operator → OWNER (full access).
 */

export const ROLE_RANK = { admin: 3, consultant: 2, client: 1, user: 0 };
export const TIER_RANK = { admin: 3, consultant: 2, client: 1 };

/** Assignable roles + skill tiers (for validation / dashboard dropdowns). */
export const ROLES = ['admin', 'consultant', 'client', 'user'];
export const TIERS = ['admin', 'consultant', 'client'];

/** Tools available to any authenticated user; everything else here is admin-only. */
const ADMIN_ONLY_TOOLS = new Set(['skill_sync']);

/** Full-access sentinel for the local operator (stdio / no-auth). */
export const OWNER = Object.freeze({ userId: null, role: 'admin', owner: true });

/**
 * Resolve the MCP request's identity from the SDK handler's `extra.authInfo`.
 * Returns OWNER when there is no authenticated user (stdio / auth-disabled HTTP).
 * @param {{extra?:{userId?:string, role?:string}}|undefined} authInfo
 * @returns {{userId:string|null, role:string, owner:boolean}}
 */
export function resolveUser(authInfo) {
  const extra = authInfo?.extra;
  if (!extra || !extra.userId) return OWNER;
  return { userId: extra.userId, role: extra.role || 'user', owner: false };
}

export function isAdmin(user) {
  return user?.owner === true || user?.role === 'admin';
}

/** Can this user invoke this tool by name? */
export function canUseTool(user, toolName) {
  if (isAdmin(user)) return true;
  return !ADMIN_ONLY_TOOLS.has(toolName);
}

/**
 * Pure access decision for one skill given the user's role and the skill's
 * resolved access metadata.
 * @param {object} a
 * @param {string} [a.role]                 user role
 * @param {boolean} [a.owner]               local operator → always allowed
 * @param {'allow'|'deny'|null} [a.override] per-user override
 * @param {string|null} [a.tier]            skill tier (null = unclassified → admin-only)
 * @param {boolean} [a.enabled]             defaults true
 * @returns {boolean}
 */
export function canAccessSkill({ role, owner = false, override = null, tier = null, enabled = true }) {
  if (owner || role === 'admin') return true;
  if (enabled === false) return false;
  if (override === 'deny') return false;
  if (override === 'allow') return true;
  if (!tier) return false; // unclassified → admin-only
  return (ROLE_RANK[role] ?? -1) >= (TIER_RANK[tier] ?? Infinity);
}

/**
 * Convenience: decide access for a resolved user against a skill's access-set
 * entry ({ tier, enabled, override }). Used by the MCP enforcement layer.
 */
export function canUserAccess(user, meta = {}) {
  return canAccessSkill({
    role: user?.role,
    owner: user?.owner === true,
    override: meta.override ?? null,
    tier: meta.tier ?? null,
    enabled: meta.enabled !== false
  });
}
