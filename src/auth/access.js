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

/**
 * Decide access for a skill by slug against a loaded access set (Map<slug,meta>
 * from skillAccess.loadAccessSet). admin/owner → true; a null access set (DB
 * error) → deny (fail-closed); a slug absent from the catalog falls back to
 * `defaultTier`.
 */
export function decideSlug(user, slug, accessSet, defaultTier) {
  if (isAdmin(user)) return true;
  if (!accessSet) return false; // fail-closed
  const meta = accessSet.get(slug) || { tier: defaultTier, enabled: true };
  return canUserAccess(user, meta);
}

/** Filter a skill_list / skill_search result object down to accessible skills. */
export function filterSkillResult(result, user, accessSet, defaultTier) {
  if (!result || typeof result !== 'object') return result;
  if (Array.isArray(result.skills)) {
    const skills = result.skills.filter((s) => decideSlug(user, s.slug, accessSet, defaultTier));
    return { ...result, skills, count: skills.length };
  }
  if (Array.isArray(result.results)) {
    const results = result.results.filter((r) => decideSlug(user, r.slug, accessSet, defaultTier));
    return { ...result, results, count: results.length };
  }
  return result;
}

// ── Client tenants (multi-tenant memory/scope) ──────────────────────────────
// Membership is the wall: a user may read/write a client's context only if
// they're a member; admin/owner bypass. `memberClientIds` is the set the repo
// loaded for this user (kept out of this pure module).

/** Can this user access this client tenant? admin/owner → always. */
export function canAccessClient(user, clientId, memberClientIds = []) {
  if (isAdmin(user)) return true;
  if (!clientId) return false;
  return (memberClientIds instanceof Set ? memberClientIds.has(clientId) : memberClientIds.includes(clientId));
}

/** The clients this user may access: admin/owner → all; else only memberships. */
export function accessibleClients(user, memberClientIds = [], allClients = []) {
  if (isAdmin(user)) return allClients;
  const ids = memberClientIds instanceof Set ? memberClientIds : new Set(memberClientIds);
  return allClients.filter((c) => ids.has(c.id));
}

/**
 * Resolve which client a request targets, given an explicit ref (already
 * resolved to a client id or null) and the user's accessible clients.
 * Returns one of:
 *   { ok:true, clientId }
 *   { ok:false, reason:'none' }       — user has no accessible clients
 *   { ok:false, reason:'ambiguous', options:[ids] } — must pass an explicit client
 *   { ok:false, reason:'denied' }     — explicit client not accessible
 */
export function resolveClient(user, explicitClientId, accessibleIds = []) {
  const ids = accessibleIds instanceof Set ? [...accessibleIds] : accessibleIds;
  if (explicitClientId) {
    if (canAccessClient(user, explicitClientId, ids)) return { ok: true, clientId: explicitClientId };
    return { ok: false, reason: 'denied' };
  }
  if (isAdmin(user)) {
    // admin without an explicit client + a single accessible → use it; else ambiguous
    if (ids.length === 1) return { ok: true, clientId: ids[0] };
    return { ok: false, reason: ids.length === 0 ? 'none' : 'ambiguous', options: ids };
  }
  if (ids.length === 0) return { ok: false, reason: 'none' };
  if (ids.length === 1) return { ok: true, clientId: ids[0] };
  return { ok: false, reason: 'ambiguous', options: ids };
}

/**
 * Render a client_contexts / clients-tenant scope row into the injected
 * "## Client Context" block, or null when there's nothing to inject. Pure;
 * values are size-capped. Works on any row with coda_files/variables/notes.
 */
export function buildClientContextBlock(row) {
  if (!row) return null;
  const files = Array.isArray(row.coda_files) ? row.coda_files : [];
  const vars = row.variables && typeof row.variables === 'object' ? row.variables : {};
  const varEntries = Object.entries(vars);
  if (!files.length && !varEntries.length && !row.notes) return null;

  let b =
    `\n\n---\n\n## Client Context\n\nScoped knowledge for this engagement. Treat these as the authoritative data sources for this client; fetch their contents via your Coda MCP.\n`;
  if (files.length) {
    b += `\n**Coda files:**\n`;
    for (const f of files.slice(0, 50)) {
      const label = f.label || f.doc_id || f.url || 'document';
      const ref = f.url || f.doc_id || '';
      b += `- ${label}${ref ? ` — ${ref}` : ''}\n`;
    }
  }
  if (varEntries.length) {
    b += `\n**Variables:**\n`;
    for (const [k, v] of varEntries.slice(0, 50)) {
      b += `- ${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}\n`;
    }
  }
  if (row.notes) b += `\n**Notes:** ${String(row.notes).slice(0, 2000)}\n`;
  return b;
}
