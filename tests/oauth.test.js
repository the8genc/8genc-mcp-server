import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createOAuthProvider } from '../src/auth/oauthProvider.js';

// Build a provider with in-memory mocks. sha256/ticket are identity-ish for testing.
function build({ codeRow, refreshRow, user } = {}) {
  const calls = { created: [], revoked: [], refreshCreated: [] };
  const deps = {
    clients: { getClient: async (id) => ({ client_id: id, client_name: 'Test', redirect_uris: ['https://c/cb'] }) },
    codes: {
      get: async () => codeRow,
      consume: async () => codeRow && !codeRow._consumed ? ((codeRow._consumed = true), codeRow) : null,
      create: async (row) => { calls.created.push(row); }
    },
    refresh: {
      findValid: async () => refreshRow,
      create: async (row) => { calls.refreshCreated.push(row); },
      revokeByHash: async (h) => { calls.revoked.push(h); }
    },
    findUserById: async () => user,
    sha256: (v) => `h:${v}`,
    randomToken: () => 'RND',
    signAccessToken: ({ userId }) => `AT:${userId}`,
    verifyAccessJwt: (t) => (t.startsWith('AT:') ? { sub: t.slice(3), cid: 'c1', scope: 'mcp:tools', exp: 9999999999 } : null),
    signTicket: (p) => `ticket:${JSON.stringify(p)}`,
    verifyTicket: (t) => (t.startsWith('ticket:') ? JSON.parse(t.slice(7)) : null),
    baseUrl: 'https://mcp.example.com',
    accessTtlSeconds: 3600,
    scope: 'mcp:tools'
  };
  return { ...createOAuthProvider(deps), calls };
}

const approved = { id: 'u1', role: 'user', status: 'approved' };
const client = { client_id: 'c1', redirect_uris: ['https://c/cb'] };

describe('oauthProvider.authorize', () => {
  it('redirects to the portal consent page with a ticket', async () => {
    const { provider } = build({});
    let redirected;
    await provider.authorize(client, { redirectUri: 'https://c/cb', codeChallenge: 'ch', scopes: ['mcp:tools'], state: 's' },
      { redirect: (u) => { redirected = u; } });
    assert.match(redirected, /^https:\/\/mcp\.example\.com\/access\/authorize\?ticket=/);
  });
});

describe('oauthProvider.exchangeAuthorizationCode', () => {
  const codeRow = { client_id: 'c1', user_id: 'u1', redirect_uri: 'https://c/cb', code_challenge: 'ch', scopes: ['mcp:tools'], resource: null };

  it('mints access + refresh tokens for an approved user', async () => {
    const { provider, calls } = build({ codeRow: { ...codeRow }, user: approved });
    const t = await provider.exchangeAuthorizationCode(client, 'CODE', undefined, 'https://c/cb');
    assert.equal(t.access_token, 'AT:u1');
    assert.equal(t.token_type, 'bearer');
    assert.equal(t.refresh_token, 'RND');
    assert.equal(calls.refreshCreated.length, 1);
    assert.equal(calls.refreshCreated[0].tokenHash, 'h:RND'); // stored hashed
  });

  it('rejects a reused/expired code (consume returns null)', async () => {
    const { provider } = build({ codeRow: null, user: approved });
    await assert.rejects(() => provider.exchangeAuthorizationCode(client, 'CODE'), /invalid or expired/i);
  });

  it('rejects a code for a non-approved user', async () => {
    const { provider } = build({ codeRow: { ...codeRow }, user: { ...approved, status: 'pending' } });
    await assert.rejects(() => provider.exchangeAuthorizationCode(client, 'CODE', undefined, 'https://c/cb'), /not approved/i);
  });

  it('rejects a redirect_uri mismatch', async () => {
    const { provider } = build({ codeRow: { ...codeRow }, user: approved });
    await assert.rejects(() => provider.exchangeAuthorizationCode(client, 'CODE', undefined, 'https://evil/cb'), /redirect_uri/i);
  });
});

describe('oauthProvider.exchangeRefreshToken', () => {
  it('rotates: revokes the old token and issues a new pair', async () => {
    const refreshRow = { client_id: 'c1', user_id: 'u1', scopes: ['mcp:tools'], resource: null };
    const { provider, calls } = build({ refreshRow, user: approved });
    const t = await provider.exchangeRefreshToken(client, 'OLDREFRESH');
    assert.equal(t.access_token, 'AT:u1');
    assert.deepEqual(calls.revoked, ['h:OLDREFRESH']); // old token rotated out
    assert.equal(calls.refreshCreated.length, 1);
  });

  it('rejects when the user is no longer approved', async () => {
    const refreshRow = { client_id: 'c1', user_id: 'u1', scopes: ['mcp:tools'] };
    const { provider } = build({ refreshRow, user: { ...approved, status: 'blocked' } });
    await assert.rejects(() => provider.exchangeRefreshToken(client, 'OLDREFRESH'), /not approved/i);
  });
});

describe('oauthProvider.verifyAccessToken', () => {
  it('accepts a valid JWT for an approved user', async () => {
    const { provider } = build({ user: approved });
    const info = await provider.verifyAccessToken('AT:u1');
    assert.equal(info.extra.userId, 'u1');
    assert.deepEqual(info.scopes, ['mcp:tools']);
  });
  it('rejects a non-approved user even with a valid JWT', async () => {
    const { provider } = build({ user: { ...approved, status: 'blocked' } });
    await assert.rejects(() => provider.verifyAccessToken('AT:u1'), /not approved/i);
  });
  it('rejects a bad token', async () => {
    const { provider } = build({ user: approved });
    await assert.rejects(() => provider.verifyAccessToken('garbage'), /invalid/i);
  });
});

describe('oauthProvider.mintCodeForApprovedUser', () => {
  it('creates a single-use code and returns the client redirect with code+state', async () => {
    const { mintCodeForApprovedUser, calls } = build({});
    const url = await mintCodeForApprovedUser(
      { cid: 'c1', redirectUri: 'https://c/cb', codeChallenge: 'ch', scopes: ['mcp:tools'], state: 'xyz' },
      approved
    );
    assert.equal(calls.created.length, 1);
    assert.equal(calls.created[0].code, 'RND');
    const u = new URL(url);
    assert.equal(u.searchParams.get('code'), 'RND');
    assert.equal(u.searchParams.get('state'), 'xyz');
  });
});
