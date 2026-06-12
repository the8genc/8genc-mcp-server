import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeCredentialResolver } from '../src/credentials/resolver.js';
import { executeCredentialsTool } from '../src/tools/credentials-tools.js';

function fixtureDir() {
  const dir = mkdtempSync(join(tmpdir(), 'cred-'));
  writeFileSync(
    join(dir, 'orchestrator.mcp.json'),
    JSON.stringify({
      tools: {
        dataforseo: { policy: 'shared', envKeys: ['DATAFORSEO_USERNAME'] },
        'square-sdk': { policy: 'client-owned', envKeys: ['SQUARE_ACCESS_TOKEN'] },
        framer: { policy: 'client-owned', envKeys: ['FRAMER_API_KEY'] }
      }
    })
  );
  writeFileSync(join(dir, '.env'), 'DATAFORSEO_USERNAME=agency\nSQUARE_ACCESS_TOKEN=ADMIN-LEAK\n');
  mkdirSync(join(dir, 'clients'), { recursive: true });
  writeFileSync(join(dir, 'clients', 'acme.env'), 'SQUARE_ACCESS_TOKEN=acme-sq\n');
  return dir;
}

test('statusForClient reports policy + connection per tool', () => {
  const cr = makeCredentialResolver(fixtureDir());
  const byTool = Object.fromEntries(cr.statusForClient('acme').map((t) => [t.token, t]));

  assert.equal(byTool.dataforseo.policy, 'shared');
  assert.equal(byTool.dataforseo.available, true);
  assert.equal(byTool.dataforseo.source, 'admin');

  assert.equal(byTool['square-sdk'].policy, 'client-owned');
  assert.equal(byTool['square-sdk'].available, true); // acme supplied its key
  assert.equal(byTool['square-sdk'].source, 'client');

  assert.equal(byTool.framer.available, false); // acme has no framer key → not connected
});

test('resolveForClient injects client keys, never the admin key for client-owned (isolation)', () => {
  const cr = makeCredentialResolver(fixtureDir());
  const s = cr.resolveForClient('acme', ['dataforseo', 'square-sdk', 'framer']);
  assert.equal(s.env.DATAFORSEO_USERNAME, 'agency'); // shared → admin key
  assert.equal(s.env.SQUARE_ACCESS_TOKEN, 'acme-sq'); // client-owned → client's key, NOT ADMIN-LEAK
  assert.deepEqual(s.unavailable.map((u) => u.token), ['framer']);
});

test('tool_credentials_status returns no secrets and flags missing keys', async () => {
  const credentials = makeCredentialResolver(fixtureDir());
  const out = await executeCredentialsTool(
    'tool_credentials_status',
    { client: 'acme' },
    {},
    {
      clients: [{ id: 'acme', slug: 'acme', name: 'Acme' }],
      resolveClientId: async () => ({ ok: true, clientId: 'acme' }),
      credentials
    }
  );
  assert.equal(out.client_id, 'acme');
  const serialized = JSON.stringify(out);
  assert.ok(!serialized.includes('acme-sq') && !serialized.includes('ADMIN-LEAK'), 'no secrets leak');
  const byTool = Object.fromEntries(out.tools.map((t) => [t.tool, t]));
  assert.equal(byTool['square-sdk'].connected, true);
  assert.equal(byTool.framer.connected, false);
  assert.deepEqual(byTool.framer.missingKeys, ['FRAMER_API_KEY']);
});

test('tool_credentials_status denies an inaccessible client', async () => {
  const credentials = makeCredentialResolver(fixtureDir());
  const out = await executeCredentialsTool(
    'tool_credentials_status',
    { client: 'other' },
    {},
    { clients: [], resolveClientId: async () => ({ ok: false, reason: 'denied' }), credentials }
  );
  assert.match(out.error, /do not have access/);
});
