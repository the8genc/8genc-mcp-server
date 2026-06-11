import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { executeClientTool } from '../src/tools/client-tools.js';

const fakeZ = {
  isAuthenticated: true,
  async storeClientMemory(id) { return { id: 'mem-1', client_id: id }; },
  async searchClientMemory(id) { return { results: [{ content: 'note', metadata: { client_id: id } }], count: 1 }; }
};
const ctx = { client: fakeZ };
const ok = (clientId) => async () => ({ ok: true, clientId });
const fail = (reason) => async () => ({ ok: false, reason });

describe('executeClientTool — client_list', () => {
  it('returns accessible clients', async () => {
    const r = await executeClientTool('client_list', {}, ctx, {
      clients: [{ id: 'c1', slug: 'acme', name: 'Acme' }],
      resolveClientId: ok('c1')
    });
    assert.equal(r.count, 1);
    assert.deepEqual(r.clients[0], { id: 'c1', slug: 'acme', name: 'Acme' });
  });
  it('notes when the caller has no clients', async () => {
    const r = await executeClientTool('client_list', {}, ctx, { clients: [], resolveClientId: fail('none') });
    assert.equal(r.count, 0);
    assert.match(r.note, /not assigned/i);
  });
});

describe('executeClientTool — memory store/search (membership-gated)', () => {
  it('member can store', async () => {
    const r = await executeClientTool('client_memory_store', { content: 'launch March 1' }, ctx, {
      clients: [{ id: 'c1' }], resolveClientId: ok('c1')
    });
    assert.equal(r.stored, true);
    assert.equal(r.client_id, 'c1');
  });
  it('member can search', async () => {
    const r = await executeClientTool('client_memory_search', { query: 'launch' }, ctx, {
      clients: [{ id: 'c1' }], resolveClientId: ok('c1')
    });
    assert.equal(r.client_id, 'c1');
    assert.equal(r.count, 1);
  });
  it('non-member is denied', async () => {
    const r = await executeClientTool('client_memory_store', { content: 'x', client: 'c9' }, ctx, {
      clients: [], resolveClientId: fail('denied')
    });
    assert.match(r.error, /do not have access/i);
  });
  it('ambiguous requires explicit client + lists options', async () => {
    const r = await executeClientTool('client_memory_search', { query: 'q' }, ctx, {
      clients: [{ id: 'c1', slug: 'a', name: 'A' }, { id: 'c2', slug: 'b', name: 'B' }],
      resolveClientId: fail('ambiguous')
    });
    assert.match(r.error, /multiple clients/i);
    assert.equal(r.options.length, 2);
  });
  it('no clients → error', async () => {
    const r = await executeClientTool('client_memory_store', { content: 'x' }, ctx, {
      clients: [], resolveClientId: fail('none')
    });
    assert.match(r.error, /not assigned/i);
  });
  it('store requires content', async () => {
    const r = await executeClientTool('client_memory_store', { content: '  ' }, ctx, {
      clients: [{ id: 'c1' }], resolveClientId: ok('c1')
    });
    assert.match(r.error, /content is required/i);
  });
});
