import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { encryptJson, decryptJson } from '../src/credentials/crypto.js';
import { makeDbCredentialResolver } from '../src/credentials/resolver.js';

test('crypto: AES-256-GCM round-trip, not plaintext, tamper-detected', () => {
  const ct = encryptJson({ SQUARE_ACCESS_TOKEN: 'super-secret', SQUARE_ENV: 'production' });
  assert.ok(ct.startsWith('v1:'));
  assert.ok(!ct.includes('super-secret'), 'ciphertext is not plaintext');
  assert.deepEqual(decryptJson(ct), { SQUARE_ACCESS_TOKEN: 'super-secret', SQUARE_ENV: 'production' });
  assert.throws(() => decryptJson(ct.slice(0, -6) + 'AAAAAA'), /./); // tampered ct fails the auth tag
  assert.throws(() => decryptJson('garbage'), /unrecognized ciphertext/);
});

// Fake DB repo so the resolver can be tested without Postgres.
const fakeRepo = {
  async listRegistry() {
    return [
      { token: 'dataforseo', policy: 'shared', env_keys: ['DATAFORSEO_USERNAME', 'DATAFORSEO_PASSWORD'], command: null, args: null },
      { token: 'square-sdk', policy: 'client-owned', env_keys: ['SQUARE_ACCESS_TOKEN'], command: null, args: null }
    ];
  },
  async seedRegistry() {},
  async getClientEnv(clientId) {
    return clientId === 'acme' ? { SQUARE_ACCESS_TOKEN: 'acme-sq' } : {};
  }
};
const emptyDir = () => mkdtempSync(join(tmpdir(), 'creds-')); // no .env → adminEnv = process.env only

test('DB resolver: shared keys from process.env; client-owned from the (decrypted) DB; isolation', async () => {
  const prev = { u: process.env.DATAFORSEO_USERNAME, p: process.env.DATAFORSEO_PASSWORD };
  process.env.DATAFORSEO_USERNAME = 'env-user';
  process.env.DATAFORSEO_PASSWORD = 'env-pass';
  try {
    const cr = makeDbCredentialResolver(fakeRepo, emptyDir());

    const shared = await cr.resolveForClient('acme', ['dataforseo']);
    assert.equal(shared.env.DATAFORSEO_USERNAME, 'env-user'); // shared → process.env
    assert.equal(shared.unavailable.length, 0);

    const owned = await cr.resolveForClient('acme', ['square-sdk']);
    assert.equal(owned.env.SQUARE_ACCESS_TOKEN, 'acme-sq'); // client-owned → this client's key
    assert.equal(owned.unavailable.length, 0);

    const ownedNoKey = await cr.resolveForClient('other', ['square-sdk']); // a client with no key
    assert.deepEqual(ownedNoKey.unavailable.map((u) => u.token), ['square-sdk']); // isolation: never the admin key

    const status = Object.fromEntries((await cr.statusForClient('acme')).map((t) => [t.token, t]));
    assert.equal(status.dataforseo.policy, 'shared');
    assert.equal(status.dataforseo.available, true);
    assert.equal(status['square-sdk'].policy, 'client-owned');
    assert.equal(status['square-sdk'].available, true);
    assert.deepEqual(status['square-sdk'].providedKeys, ['SQUARE_ACCESS_TOKEN']);

    assert.deepEqual((await cr.tokens()).sort(), ['dataforseo', 'square-sdk']);
  } finally {
    if (prev.u === undefined) delete process.env.DATAFORSEO_USERNAME; else process.env.DATAFORSEO_USERNAME = prev.u;
    if (prev.p === undefined) delete process.env.DATAFORSEO_PASSWORD; else process.env.DATAFORSEO_PASSWORD = prev.p;
  }
});
