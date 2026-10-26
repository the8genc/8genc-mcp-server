import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { canUseTool, canUseSkills, ROLE_TOOL_ALLOW, OWNER } from '../src/auth/access.js';
import { ALL_TOOLS, createMcpServer, responseError } from '../src/server.js';
import { ZeroDBClient } from '../src/client/zerodb-client.js';
import { executeClientTool } from '../src/tools/client-tools.js';
import { buildEvent } from '../src/db/repositories/audit.js';
import { assertSeedPassword } from '../src/db/migrate.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema
} from '@modelcontextprotocol/sdk/types.js';

const TOOL_NAMES = ALL_TOOLS.map((t) => t.name);
const client = { userId: 'u-client', role: 'client', owner: false };
const consultant = { userId: 'u-cons', role: 'consultant', owner: false };
const legacy = { userId: 'u-user', role: 'user', owner: false };

describe('canUseTool: per-role allow list', () => {
  it('a client token can use no current tool', () => {
    for (const t of TOOL_NAMES) assert.equal(canUseTool(client, t), false, `${t} must be closed to clients`);
  });
  it('a legacy user can use no tool', () => {
    for (const t of TOOL_NAMES) assert.equal(canUseTool(legacy, t), false, `${t} must be closed to legacy users`);
  });
  it('consultants get every tool except skill_sync', () => {
    for (const t of TOOL_NAMES) assert.equal(canUseTool(consultant, t), t !== 'skill_sync', t);
  });
  it('admin and owner get everything', () => {
    for (const t of TOOL_NAMES) {
      assert.equal(canUseTool(OWNER, t), true);
      assert.equal(canUseTool({ userId: 'a', role: 'admin', owner: false }, t), true);
    }
  });
  it('unknown roles and tools fail closed', () => {
    assert.equal(canUseTool({ role: 'superuser' }, 'skill_list'), false);
    assert.equal(canUseTool({ role: 'constructor' }, 'skill_list'), false); // prototype key is not a role
    assert.equal(canUseTool({}, 'skill_list'), false);
    assert.equal(canUseTool(consultant, 'not_a_tool'), false);
  });
  it('every allow-listed name is a real tool (catches typos)', () => {
    const real = new Set(TOOL_NAMES);
    for (const [role, set] of Object.entries(ROLE_TOOL_ALLOW)) {
      for (const t of set) assert.ok(real.has(t), `${role} allow list names unknown tool ${t}`);
    }
  });
});

describe('canUseSkills', () => {
  it('only staff see skills', () => {
    assert.equal(canUseSkills(OWNER), true);
    assert.equal(canUseSkills({ role: 'admin' }), true);
    assert.equal(canUseSkills(consultant), true);
    assert.equal(canUseSkills(client), false);
    assert.equal(canUseSkills(legacy), false);
  });
});

// Drive the real MCP request handlers with a client identity. The fake skills
// client throws if touched, which proves a client request never reaches it.
function serverFor() {
  const skills = {
    listSkills: async () => { throw new Error('skills must not be read for this caller'); },
    getSkill: async () => { throw new Error('skills must not be read for this caller'); }
  };
  const server = createMcpServer({ client: { isAuthenticated: false }, skills, serverName: 'test', version: '0' });
  const handler = (schema) => server._requestHandlers.get(schema.shape.method.value);
  return { handler };
}
const authFor = (u) => ({ authInfo: { extra: { userId: u.userId, role: u.role, status: 'approved' } } });

describe('MCP handlers for a client token', () => {
  it('tools/list is empty', async () => {
    const { handler } = serverFor();
    const res = await handler(ListToolsRequestSchema)({ method: 'tools/list', params: {} }, authFor(client));
    assert.deepEqual(res.tools, []);
  });
  it('tools/call by name is refused, with the same reply as a nonexistent tool', async () => {
    const { handler } = serverFor();
    const call = (name) =>
      handler(CallToolRequestSchema)({ method: 'tools/call', params: { name, arguments: {} } }, authFor(client));
    const real = await call('dataforseo_search_volume');
    const fake = await call('no_such_tool');
    assert.equal(real.isError, true);
    assert.equal(JSON.parse(real.content[0].text).error, 'Tool not available: dataforseo_search_volume');
    assert.equal(JSON.parse(fake.content[0].text).error, 'Tool not available: no_such_tool');
  });
  it('prompts/list is empty and prompts/get throws', async () => {
    const { handler } = serverFor();
    const list = await handler(ListPromptsRequestSchema)({ method: 'prompts/list', params: {} }, authFor(client));
    assert.deepEqual(list.prompts, []);
    await assert.rejects(
      handler(GetPromptRequestSchema)({ method: 'prompts/get', params: { name: 'prd-generator' } }, authFor(client)),
      /Prompt not available/
    );
  });
  it('a consultant still lists the staff tools', async () => {
    const { handler } = serverFor();
    const res = await handler(ListToolsRequestSchema)({ method: 'tools/list', params: {} }, authFor(consultant));
    assert.equal(res.tools.length, TOOL_NAMES.length - 1);
  });
});

describe('searchClientMemory tenant filter', () => {
  const rows = [
    { content: 'mine', metadata: { client_id: 'c1' } },
    { content: 'other tenant', metadata: { client_id: 'c2' } },
    { content: 'untagged', metadata: {} }
  ];
  const z = new ZeroDBClient({ apiKey: 'ak_test' });
  z.request = async () => ({ results: rows });

  it('strict by default: drops untagged and foreign rows', async () => {
    const res = await z.searchClientMemory('c1', 'q');
    assert.deepEqual(res.results.map((r) => r.content), ['mine']);
  });
  it('non-strict (admin) keeps untagged rows but still drops foreign ones', async () => {
    const res = await z.searchClientMemory('c1', 'q', 10, { strict: false });
    assert.deepEqual(res.results.map((r) => r.content), ['mine', 'untagged']);
  });
  it('client_memory_search passes strictTenant through, defaulting to strict', async () => {
    const seen = [];
    const fakeZ = { isAuthenticated: true, async searchClientMemory(_id, _q, _l, opts) { seen.push(opts); return { results: [] }; } };
    const deps = { clients: [{ id: 'c1' }], resolveClientId: async () => ({ ok: true, clientId: 'c1' }) };
    await executeClientTool('client_memory_search', { query: 'x' }, { client: fakeZ }, deps);
    await executeClientTool('client_memory_search', { query: 'x' }, { client: fakeZ }, { ...deps, strictTenant: false });
    assert.deepEqual(seen, [{ strict: true }, { strict: false }]);
  });
});

describe('audit event shape', () => {
  it('keeps argument keys, never values', () => {
    const e = buildEvent({ user: client, tool: 'pm_submit_update', outcome: 'ok', args: { text: 'secret budget', sow: 's1' } });
    assert.deepEqual(e.detail.arg_keys, ['text', 'sow']);
    assert.ok(!JSON.stringify(e).includes('secret budget'));
    assert.equal(e.user_id, 'u-client');
    assert.equal(e.role, 'client');
  });
  it('coerces an unknown outcome to error', () => {
    assert.equal(buildEvent({ user: client, tool: 't', outcome: 'weird' }).outcome, 'error');
  });
  it('responseError reads tool-level and transport-level errors', () => {
    const text = (o) => ({ content: [{ type: 'text', text: JSON.stringify(o) }] });
    assert.equal(responseError(text({ ok: 1 })), null);
    assert.equal(responseError(text({ error: 'nope' })), 'nope');
    assert.equal(responseError({ ...text({ error: 'bad' }), isError: true }), 'bad');
    assert.equal(responseError(text([1, 2])), null);
  });
});

describe('assertSeedPassword', () => {
  it('requires a non-default password in production', () => {
    assert.throws(() => assertSeedPassword({ nodeEnv: 'production' }), /ADMIN_SEED_PASSWORD/);
    assert.throws(() => assertSeedPassword({ nodeEnv: 'production', seedPassword: 'admin' }), /ADMIN_SEED_PASSWORD/);
    assert.doesNotThrow(() => assertSeedPassword({ nodeEnv: 'production', seedPassword: 'long-random-value' }));
  });
  it('allows the default outside production', () => {
    assert.doesNotThrow(() => assertSeedPassword({ nodeEnv: 'development' }));
    assert.doesNotThrow(() => assertSeedPassword({}));
  });
});
