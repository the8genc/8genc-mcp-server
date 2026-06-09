/**
 * Assembles the auth bundle passed to startHttpServer when DATABASE_URL is set:
 * runs migrations, builds the unified bearer verifier (PAT branch in PR1; the
 * OAuth-JWT branch + authorization-server router land in PR3), and the portal
 * REST API router. Returns null when auth is disabled.
 */

import { config } from '../config.js';
import { runMigrations } from '../db/migrate.js';
import { createBearerVerifier } from './bearerVerifier.js';
import { sha256 } from './tokens.js';
import * as users from '../db/repositories/users.js';
import * as pats from '../db/repositories/personalTokens.js';
import { createPortalApiRouter } from '../portal/apiRouter.js';

export async function buildAuth() {
  if (!config.authEnabled) return null;

  await runMigrations();

  const verifier = createBearerVerifier({
    findPatByHash: pats.findByHash,
    findUserById: users.findById,
    touchPat: pats.touchLastUsed,
    sha256
    // verifyAccessJwt: added in PR3 (OAuth access tokens)
  });

  return {
    verifier,
    portalApiRouter: createPortalApiRouter()
  };
}
