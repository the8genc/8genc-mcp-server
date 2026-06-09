/**
 * OAuthServerProvider backed by Postgres, for the SDK's mcpAuthRouter.
 *
 * Flow: an MCP client hits /authorize → authorize() redirects the browser to the
 * portal consent page carrying a signed "ticket" (authorize() receives no req, so
 * it can't read the session). After the user logs in (email/pw or Google/GitHub)
 * the portal posts the ticket to /access/api/oauth/consent, which (with the
 * session cookie) calls mintCodeForApprovedUser() to create a single-use PKCE
 * code and returns the redirect back to the client. /token then exchanges it.
 *
 * Factory injects repos + helpers so the exchange/refresh logic is unit-testable.
 */

import { InvalidGrantError, InvalidTokenError } from '@modelcontextprotocol/sdk/server/auth/errors.js';

export function createOAuthProvider(deps) {
  const {
    clients, codes, refresh, findUserById,
    sha256, randomToken, signAccessToken, verifyAccessJwt, signTicket, verifyTicket,
    baseUrl, accessTtlSeconds, refreshTtlSeconds = 30 * 24 * 3600, scope = 'mcp:tools'
  } = deps;

  function mintTokens({ userId, clientId, scopes, resource }) {
    const access_token = signAccessToken({ userId, clientId, scopes, resource });
    const raw = randomToken(32);
    return refresh
      .create({
        userId, clientId, tokenHash: sha256(raw), scopes, resource,
        expiresAt: new Date(Date.now() + refreshTtlSeconds * 1000)
      })
      .then(() => ({
        access_token,
        token_type: 'bearer',
        expires_in: accessTtlSeconds,
        scope: scopes.join(' '),
        refresh_token: raw
      }));
  }

  const provider = {
    clientsStore: {
      getClient: (id) => clients.getClient(id),
      registerClient: (c) => clients.registerClient(c)
    },

    async authorize(client, params, res) {
      const ticket = signTicket({
        cid: client.client_id,
        redirectUri: params.redirectUri,
        codeChallenge: params.codeChallenge,
        scopes: params.scopes?.length ? params.scopes : [scope],
        state: params.state,
        resource: params.resource?.toString()
      });
      res.redirect(`${baseUrl}/access/authorize?ticket=${encodeURIComponent(ticket)}`);
    },

    async challengeForAuthorizationCode(client, authorizationCode) {
      const row = await codes.get(authorizationCode);
      if (!row || row.client_id !== client.client_id) throw new InvalidGrantError('Invalid authorization code');
      return row.code_challenge;
    },

    async exchangeAuthorizationCode(client, authorizationCode, _verifier, redirectUri) {
      const row = await codes.consume(authorizationCode); // single-use + expiry enforced
      if (!row || row.client_id !== client.client_id) throw new InvalidGrantError('Invalid or expired authorization code');
      if (redirectUri && redirectUri !== row.redirect_uri) throw new InvalidGrantError('redirect_uri mismatch');
      const user = await findUserById(row.user_id);
      if (!user || user.status !== 'approved') throw new InvalidGrantError('Account is not approved');
      return mintTokens({ userId: user.id, clientId: client.client_id, scopes: row.scopes, resource: row.resource });
    },

    async exchangeRefreshToken(client, refreshToken, scopes) {
      const hash = sha256(refreshToken);
      const row = await refresh.findValid(hash);
      if (!row || row.client_id !== client.client_id) throw new InvalidGrantError('Invalid refresh token');
      const user = await findUserById(row.user_id);
      if (!user || user.status !== 'approved') throw new InvalidGrantError('Account is not approved');
      await refresh.revokeByHash(hash); // rotation
      const grantScopes = scopes?.length ? scopes : row.scopes;
      return mintTokens({ userId: user.id, clientId: client.client_id, scopes: grantScopes, resource: row.resource });
    },

    async verifyAccessToken(token) {
      const claims = verifyAccessJwt(token);
      if (!claims) throw new InvalidTokenError('Invalid or expired token');
      const user = await findUserById(claims.sub);
      if (!user || user.status !== 'approved') throw new InvalidTokenError('Account is not approved');
      return {
        token,
        clientId: claims.cid || 'unknown',
        scopes: (claims.scope || '').split(' ').filter(Boolean),
        expiresAt: claims.exp,
        extra: { userId: user.id, role: user.role, status: user.status }
      };
    },

    async revokeToken(_client, request) {
      const t = request.token;
      if (t) await refresh.revokeByHash(sha256(t));
    }
  };

  // Called by the consent endpoint once the user is authenticated + approved.
  async function mintCodeForApprovedUser(ticketClaims, user) {
    const code = randomToken(32);
    await codes.create({
      code,
      clientId: ticketClaims.cid,
      userId: user.id,
      redirectUri: ticketClaims.redirectUri,
      codeChallenge: ticketClaims.codeChallenge,
      scopes: ticketClaims.scopes || [scope],
      resource: ticketClaims.resource,
      expiresAt: new Date(Date.now() + 60 * 1000)
    });
    const url = new URL(ticketClaims.redirectUri);
    url.searchParams.set('code', code);
    if (ticketClaims.state) url.searchParams.set('state', ticketClaims.state);
    return url.toString();
  }

  async function describeTicket(ticket) {
    const claims = verifyTicket(ticket);
    if (!claims) return null;
    const client = await clients.getClient(claims.cid);
    return { clientId: claims.cid, clientName: client?.client_name || claims.cid, scopes: claims.scopes || [scope] };
  }

  return { provider, mintCodeForApprovedUser, describeTicket, verifyTicket };
}
