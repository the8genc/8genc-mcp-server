/**
 * Tool-credential status tool — multi-tenant, file-backed (see src/credentials/). Reports, for
 * the caller's resolved client, each tool's policy and whether it's connected. NO secrets are
 * returned. Membership-gated by the server exactly like the client memory tools: the server
 * resolves WHICH client (explicit arg or the caller's sole accessible client) and passes the
 * validated clientId in.
 *
 *   tool_credentials_status — per-tool: shared (agency key) vs client-owned (your key) + connected?
 */
export const CREDENTIALS_TOOLS = [
  {
    name: 'tool_credentials_status',
    description:
      "Show this client's tool-credential status. For each tool: its policy — `shared` (uses the agency's key) or `client-owned` (needs your own key) — and whether it's connected. No secrets are returned. Defaults to your sole client; pass `client` (slug or id) if you belong to several.",
    inputSchema: {
      type: 'object',
      properties: {
        client: { type: 'string', description: 'Client slug or id. Optional when you can access exactly one client.' }
      }
    }
  }
];

/**
 * @param {string} name
 * @param {object} args
 * @param {object} _ctx
 * @param {object} deps  resolved by the server:
 *   - clients: accessible client rows ([{id,slug,name},...])
 *   - resolveClientId(ref): async → { ok, clientId } | { ok:false, reason, options? }
 *   - credentials: a credential resolver (src/credentials/resolver.js)
 */
export async function executeCredentialsTool(name, args = {}, _ctx, deps = {}) {
  if (name !== 'tool_credentials_status') return null;
  const { clients = [], resolveClientId, credentials } = deps;

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

  const tools = credentials.statusForClient(clientId).map((t) => {
    const connected = t.available;
    const status =
      t.policy === 'shared'
        ? 'shared — uses the agency key'
        : connected
          ? `connected — your key (${t.providedKeys.length}/${t.envKeys.length} keys set)`
          : 'not connected — upload your .env for this tool';
    const out = { tool: t.token, policy: t.policy, connected, status };
    if (t.policy === 'client-owned' && !connected) {
      out.missingKeys = t.envKeys.filter((k) => !t.providedKeys.includes(k));
    }
    return out;
  });

  return {
    client_id: clientId,
    tools,
    note: 'client-owned tools require this client’s own keys (uploaded as a .env in the dashboard); the agency key is never used for them.'
  };
}
