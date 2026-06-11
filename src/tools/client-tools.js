/**
 * Client memory tools — multi-tenant, ZeroDB-backed context shared across the
 * users assigned to a client. Every call is membership-gated by the server
 * (see src/server.js): a user only reads/writes a client they belong to; admins
 * access all. The server resolves WHICH client (explicit arg or the caller's
 * sole accessible client) and passes the validated clientId in.
 *
 *   client_list          — clients the caller can access (id, slug, name)
 *   client_memory_store  — persist skill-engagement context to a client
 *   client_memory_search — recall a client's context
 */
export const CLIENT_TOOLS = [
  {
    name: 'client_list',
    description:
      'List the client tenants you can access (id, slug, name). Memory tools operate on these; pass a slug/id as `client` when you belong to more than one.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'client_memory_store',
    description:
      "Persist context to a client's shared memory so it carries across sessions for everyone assigned to that client (e.g. decisions, approved outputs, engagement state). Defaults to your sole client; pass `client` (slug or id) if you belong to several.",
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'The context to remember (a fact, decision, summary, or artifact).' },
        client: { type: 'string', description: 'Client slug or id. Optional when you can access exactly one client.' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Optional labels for retrieval.' },
        importance: { type: 'number', description: 'Optional 0–1 importance (default 0.7).', minimum: 0, maximum: 1 }
      },
      required: ['content']
    }
  },
  {
    name: 'client_memory_search',
    description:
      "Recall a client's shared memory by semantic query. Defaults to your sole client; pass `client` (slug or id) if you belong to several.",
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to recall.' },
        client: { type: 'string', description: 'Client slug or id. Optional when you can access exactly one client.' },
        limit: { type: 'integer', description: 'Max results (default 10).', minimum: 1, maximum: 50 }
      },
      required: ['query']
    }
  }
];

/**
 * @param {string} name
 * @param {object} args
 * @param {object} ctx  { client (ZeroDBClient), skills, ... }
 * @param {object} deps resolved by the server:
 *   - clients: the accessible client rows ([{id,slug,name},...])
 *   - resolveClientId(explicitRef): async → { ok, clientId } | { ok:false, reason, options? }
 */
export async function executeClientTool(name, args = {}, ctx, deps = {}) {
  const zerodb = ctx?.client;
  const { clients = [], resolveClientId } = deps;

  if (name === 'client_list') {
    return {
      count: clients.length,
      clients: clients.map((c) => ({ id: c.id, slug: c.slug, name: c.name })),
      note:
        clients.length === 0
          ? 'You are not assigned to any client. Ask an admin to add you to a client tenant.'
          : 'Use a slug/id as `client` on the memory tools when you can access more than one.'
    };
  }

  if (!zerodb?.isAuthenticated) {
    return { error: 'Client memory requires ZeroDB credentials (the server is not authenticated to ZeroDB).' };
  }

  // Both memory tools resolve the target client first (membership-checked).
  const resolved = await resolveClientId(args.client);
  if (!resolved.ok) {
    if (resolved.reason === 'none') return { error: 'You are not assigned to any client.' };
    if (resolved.reason === 'denied') return { error: `You do not have access to client: ${args.client}` };
    if (resolved.reason === 'ambiguous') {
      return {
        error: 'You can access multiple clients — pass `client` (slug or id).',
        options: clients.map((c) => ({ id: c.id, slug: c.slug, name: c.name }))
      };
    }
    return { error: 'Could not resolve client.' };
  }
  const clientId = resolved.clientId;

  switch (name) {
    case 'client_memory_store': {
      if (!args.content || !String(args.content).trim()) return { error: 'content is required.' };
      const meta = {};
      if (typeof args.importance === 'number') meta.importance = args.importance;
      const res = await zerodb.storeClientMemory(clientId, String(args.content), args.tags || [], meta);
      return { stored: true, client_id: clientId, id: res?.id || res?.memory_id || null };
    }
    case 'client_memory_search': {
      const res = await zerodb.searchClientMemory(clientId, String(args.query || ''), args.limit || 10);
      const results = res?.results || res?.memories || (Array.isArray(res) ? res : []);
      return {
        client_id: clientId,
        count: results.length,
        results
      };
    }
    default:
      return null;
  }
}
