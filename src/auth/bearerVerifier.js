/**
 * Unified bearer-token verifier passed to the SDK's requireBearerAuth().
 *
 * Accepts EITHER:
 *   - a personal access token (PAT, "8genc_pat_…") looked up by sha256 hash, or
 *   - an OAuth access JWT (added in PR3).
 * Both paths load the owning user and REQUIRE status='approved' — this is the
 * single chokepoint enforcing "only approved users can call /mcp".
 *
 * The verifier is dependency-injected with repositories + helpers so it is unit
 * testable without a live database.
 */

import { InvalidTokenError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import { config } from '../config.js';

const FAR_FUTURE = () => Math.floor(Date.now() / 1000) + 10 * 365 * 24 * 3600;

/**
 * @param {object} deps
 * @param {(hash:string)=>Promise<{id,user_id,expires_at,revoked_at}|null>} deps.findPatByHash
 * @param {(id:string)=>Promise<object|null>} deps.findUserById
 * @param {(value:string)=>string} deps.sha256
 * @param {(id:string)=>Promise<void>} [deps.touchPat]
 * @param {(token:string)=>object|null} [deps.verifyAccessJwt]  // PR3
 */
export function createBearerVerifier(deps) {
  const { findPatByHash, findUserById, sha256, touchPat, verifyAccessJwt } = deps;

  async function verifyAccessToken(token) {
    // ── OAuth access JWT branch (PR3) ──
    if (verifyAccessJwt && !token.startsWith(config.patPrefix)) {
      const claims = verifyAccessJwt(token);
      if (claims) {
        const user = await findUserById(claims.sub);
        if (!user || user.status !== 'approved') {
          throw new InvalidTokenError('Account is not approved');
        }
        return {
          token,
          clientId: claims.cid || 'unknown',
          scopes: (claims.scope || '').split(' ').filter(Boolean),
          expiresAt: claims.exp,
          extra: { userId: user.id, role: user.role, status: user.status }
        };
      }
      // fall through — maybe it's a PAT without our prefix is impossible, so reject
      throw new InvalidTokenError('Invalid or expired token');
    }

    // ── Personal access token branch ──
    const pat = await findPatByHash(sha256(token));
    if (!pat || pat.revoked_at) throw new InvalidTokenError('Invalid or revoked token');
    if (pat.expires_at && new Date(pat.expires_at).getTime() <= Date.now()) {
      throw new InvalidTokenError('Token has expired');
    }
    const user = await findUserById(pat.user_id);
    if (!user || user.status !== 'approved') {
      throw new InvalidTokenError('Account is not approved');
    }
    if (touchPat) touchPat(pat.id).catch(() => {});

    const expiresAt = pat.expires_at
      ? Math.floor(new Date(pat.expires_at).getTime() / 1000)
      : FAR_FUTURE();

    return {
      token,
      clientId: `pat:${pat.id}`,
      scopes: [config.mcpScope],
      expiresAt,
      extra: { userId: user.id, role: user.role, status: user.status, pat: true }
    };
  }

  return { verifyAccessToken };
}
