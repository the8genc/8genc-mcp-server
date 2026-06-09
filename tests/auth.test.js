import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { hashPassword, verifyPassword, validatePasswordStrength } from '../src/auth/passwords.js';
import { generatePat, sha256, signSession, verifySession } from '../src/auth/tokens.js';
import { createBearerVerifier } from '../src/auth/bearerVerifier.js';

describe('passwords', () => {
  it('hashes and verifies', async () => {
    const h = await hashPassword('correct horse battery');
    assert.ok(h && h !== 'correct horse battery');
    assert.equal(await verifyPassword('correct horse battery', h), true);
    assert.equal(await verifyPassword('wrong', h), false);
  });
  it('rejects null hash', async () => {
    assert.equal(await verifyPassword('x', null), false);
  });
  it('enforces minimum strength', () => {
    assert.ok(validatePasswordStrength('short'));      // too short → error message
    assert.equal(validatePasswordStrength('longenough123'), null);
  });
});

describe('tokens', () => {
  it('generates a prefixed PAT with a sha256 hash', () => {
    const { token, hash } = generatePat();
    assert.ok(token.startsWith('8genc_pat_'));
    assert.equal(hash, sha256(token));
    assert.equal(hash.length, 64);
  });
  it('session JWT roundtrips and rejects tampering', () => {
    const t = signSession({ id: 'u1', role: 'admin', status: 'approved' });
    const claims = verifySession(t);
    assert.equal(claims.sub, 'u1');
    assert.equal(claims.role, 'admin');
    assert.equal(verifySession(t + 'x'), null);
    assert.equal(verifySession('garbage'), null);
  });
});

describe('bearerVerifier (PAT branch — the /mcp approval gate)', () => {
  const approved = { id: 'u1', role: 'user', status: 'approved' };
  const pending = { id: 'u2', role: 'user', status: 'pending' };
  const blocked = { id: 'u3', role: 'user', status: 'blocked' };
  const usersById = { u1: approved, u2: pending, u3: blocked };

  function makeVerifier(patRow) {
    return createBearerVerifier({
      sha256,
      findPatByHash: async () => patRow,
      findUserById: async (id) => usersById[id] || null,
      touchPat: async () => {}
    });
  }

  it('accepts a valid PAT for an approved user', async () => {
    const v = makeVerifier({ id: 'p1', user_id: 'u1', expires_at: null, revoked_at: null });
    const info = await v.verifyAccessToken('8genc_pat_abc');
    assert.equal(info.extra.userId, 'u1');
    assert.deepEqual(info.scopes, ['mcp:tools']);
    assert.equal(typeof info.expiresAt, 'number');       // SDK requires a numeric expiry
    assert.ok(info.expiresAt > Math.floor(Date.now() / 1000));
  });

  it('rejects a PAT for a pending user', async () => {
    const v = makeVerifier({ id: 'p2', user_id: 'u2', expires_at: null, revoked_at: null });
    await assert.rejects(() => v.verifyAccessToken('8genc_pat_abc'), /not approved/i);
  });

  it('rejects a PAT for a blocked user', async () => {
    const v = makeVerifier({ id: 'p3', user_id: 'u3', expires_at: null, revoked_at: null });
    await assert.rejects(() => v.verifyAccessToken('8genc_pat_abc'), /not approved/i);
  });

  it('rejects a revoked PAT', async () => {
    const v = makeVerifier({ id: 'p4', user_id: 'u1', expires_at: null, revoked_at: new Date() });
    await assert.rejects(() => v.verifyAccessToken('8genc_pat_abc'), /revoked/i);
  });

  it('rejects an expired PAT', async () => {
    const v = makeVerifier({ id: 'p5', user_id: 'u1', expires_at: new Date(Date.now() - 1000), revoked_at: null });
    await assert.rejects(() => v.verifyAccessToken('8genc_pat_abc'), /expired/i);
  });

  it('rejects an unknown PAT', async () => {
    const v = makeVerifier(null);
    await assert.rejects(() => v.verifyAccessToken('8genc_pat_nope'), /invalid|revoked/i);
  });
});
