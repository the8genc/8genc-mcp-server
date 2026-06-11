import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  canAccessClient,
  accessibleClients,
  resolveClient,
  OWNER
} from '../src/auth/access.js';

const admin = { role: 'admin', owner: false };
const consultant = { role: 'consultant', owner: false };
const ALL = [{ id: 'c1', name: 'Acme' }, { id: 'c2', name: 'Beta' }, { id: 'c3', name: 'Gamma' }];

describe('canAccessClient', () => {
  it('admin and owner access any client', () => {
    assert.equal(canAccessClient(admin, 'c1', []), true);
    assert.equal(canAccessClient(OWNER, 'c9', []), true);
  });
  it('members access only their clients', () => {
    assert.equal(canAccessClient(consultant, 'c1', ['c1', 'c2']), true);
    assert.equal(canAccessClient(consultant, 'c3', ['c1', 'c2']), false);
  });
  it('accepts a Set membership and rejects missing clientId', () => {
    assert.equal(canAccessClient(consultant, 'c2', new Set(['c2'])), true);
    assert.equal(canAccessClient(consultant, null, ['c1']), false);
  });
});

describe('accessibleClients', () => {
  it('admin sees all clients', () => {
    assert.deepEqual(accessibleClients(admin, [], ALL), ALL);
  });
  it('member sees only assigned clients', () => {
    assert.deepEqual(
      accessibleClients(consultant, ['c2'], ALL).map((c) => c.id),
      ['c2']
    );
  });
  it('member with no memberships sees none', () => {
    assert.deepEqual(accessibleClients(consultant, [], ALL), []);
  });
});

describe('resolveClient', () => {
  it('explicit + accessible → ok', () => {
    assert.deepEqual(resolveClient(consultant, 'c1', ['c1', 'c2']), { ok: true, clientId: 'c1' });
    assert.deepEqual(resolveClient(admin, 'c9', []), { ok: true, clientId: 'c9' });
  });
  it('explicit + not a member → denied', () => {
    assert.deepEqual(resolveClient(consultant, 'c3', ['c1']), { ok: false, reason: 'denied' });
  });
  it('no explicit + single accessible → use it', () => {
    assert.deepEqual(resolveClient(consultant, null, ['c2']), { ok: true, clientId: 'c2' });
  });
  it('no explicit + multiple → ambiguous', () => {
    const r = resolveClient(consultant, null, ['c1', 'c2']);
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'ambiguous');
    assert.deepEqual(r.options.sort(), ['c1', 'c2']);
  });
  it('no explicit + none → none', () => {
    assert.deepEqual(resolveClient(consultant, null, []), { ok: false, reason: 'none' });
  });
  it('admin with no explicit + many accessible → ambiguous (must pick)', () => {
    const r = resolveClient(admin, null, ['c1', 'c2']);
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'ambiguous');
  });
});
