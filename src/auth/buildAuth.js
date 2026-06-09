/**
 * Assembles the auth bundle for startHttpServer when DATABASE_URL is set:
 *   - runs migrations
 *   - builds the OAuth 2.1 authorization-server provider (Postgres-backed)
 *   - builds the unified bearer verifier (PAT + OAuth access JWT, gated on approved)
 *   - the portal REST API (incl. OAuth consent + social-login start)
 *   - the mcpAuthRouter (/authorize, /token, /register, /revoke, RFC 9728 metadata)
 *   - the social callback router (/auth/:provider/callback)
 * Returns null when auth is disabled.
 */

import { mcpAuthRouter, getOAuthProtectedResourceMetadataUrl } from '@modelcontextprotocol/sdk/server/auth/router.js';

import { config, resourceUrl } from '../config.js';
import { runMigrations } from '../db/migrate.js';
import { createBearerVerifier } from './bearerVerifier.js';
import { createOAuthProvider } from './oauthProvider.js';
import { socialCallbackRoutes } from './social.js';
import { sha256, randomToken, signAccessToken, verifyAccessJwt, signTicket, verifyTicket } from './tokens.js';
import { createPortalApiRouter } from '../portal/apiRouter.js';

import * as users from '../db/repositories/users.js';
import * as pats from '../db/repositories/personalTokens.js';
import * as clients from '../db/repositories/oauthClients.js';
import * as codes from '../db/repositories/authCodes.js';
import * as refresh from '../db/repositories/refreshTokens.js';

export async function buildAuth() {
  if (!config.authEnabled) return null;

  await runMigrations();

  const { provider, mintCodeForApprovedUser, describeTicket } = createOAuthProvider({
    clients, codes, refresh,
    findUserById: users.findById,
    sha256, randomToken, signAccessToken, verifyAccessJwt, signTicket, verifyTicket,
    baseUrl: config.publicBaseUrl,
    accessTtlSeconds: config.accessTokenTtlSeconds,
    scope: config.mcpScope
  });

  // Unified resource-server verifier: PAT branch + OAuth access-JWT branch.
  const verifier = createBearerVerifier({
    findPatByHash: pats.findByHash,
    findUserById: users.findById,
    touchPat: pats.touchLastUsed,
    sha256,
    verifyAccessJwt
  });

  const portalApiRouter = createPortalApiRouter({
    oauth: { mintCodeForApprovedUser, describeTicket, verifyTicket }
  });

  const oauthRouter = mcpAuthRouter({
    provider,
    issuerUrl: new URL(config.publicBaseUrl),
    resourceServerUrl: resourceUrl(),
    scopesSupported: [config.mcpScope],
    resourceName: '8genC MCP'
  });

  return {
    verifier,
    portalApiRouter,
    oauthRouter,
    socialCallbackRouter: socialCallbackRoutes(),
    resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(resourceUrl())
  };
}
