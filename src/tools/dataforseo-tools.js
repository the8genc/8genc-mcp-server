/**
 * Sample external-API tool that consumes the credential engine end to end.
 *
 * `dataforseo_search_volume` resolves THIS client's DataForSEO credentials via
 * credentials.resolveForClient(clientId, ['dataforseo']) — the agency's shared key by default,
 * or the client's own key if `dataforseo` is client-owned/overridden — then calls the live
 * DataForSEO Google Ads search-volume endpoint. Membership-gated by the server (same client
 * resolution as the client-memory tools). If the client hasn't connected a client-owned
 * `dataforseo`, the tool reports it as not connected (the admin key is never used).
 */
export const DATAFORSEO_TOOLS = [
  {
    name: 'dataforseo_search_volume',
    description:
      "Google Ads search volume, CPC, and competition for keywords (via DataForSEO), using THIS client's credentials — the agency's shared key, or the client's own if `dataforseo` is client-owned. Defaults to your sole client; pass `client` (slug or id) if you belong to several.",
    inputSchema: {
      type: 'object',
      properties: {
        keywords: { type: 'array', items: { type: 'string' }, description: 'Keywords to size (max 1000).' },
        location_name: { type: 'string', description: 'Location, hierarchical, e.g. "United States". Default: United States.' },
        language_code: { type: 'string', description: 'Language code, e.g. "en". Default: en.' },
        client: { type: 'string', description: 'Client slug or id. Optional when you can access exactly one client.' }
      },
      required: ['keywords']
    }
  }
];

const ENDPOINT = 'https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live';

/**
 * @param {string} name
 * @param {object} args
 * @param {object} _ctx
 * @param {object} deps  resolved by the server:
 *   - clients, resolveClientId  (membership-gated client resolution)
 *   - credentials               (credential resolver, src/credentials/resolver.js)
 *   - fetchImpl                  (defaults to global fetch; injectable for tests)
 */
export async function executeDataForSEOTool(name, args = {}, _ctx, deps = {}) {
  if (name !== 'dataforseo_search_volume') return null;
  const { clients = [], resolveClientId, credentials, fetchImpl = fetch } = deps;

  if (!Array.isArray(args.keywords) || args.keywords.length === 0) {
    return { error: 'keywords (a non-empty array) is required.' };
  }

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

  // ── Resolve credentials for THIS client (the whole point of the integration) ──
  const session = await credentials.resolveForClient(clientId, ['dataforseo']);
  const unavailable = session.unavailable.find((u) => u.token === 'dataforseo');
  if (unavailable) {
    return { error: `DataForSEO is not connected for this client. ${unavailable.reason}` };
  }
  const login = session.env.DATAFORSEO_USERNAME;
  const password = session.env.DATAFORSEO_PASSWORD;
  if (!login || !password) {
    return { error: 'DataForSEO credentials incomplete (need DATAFORSEO_USERNAME and DATAFORSEO_PASSWORD).' };
  }

  const location_name = args.location_name || 'United States';
  const language_code = args.language_code || 'en';
  const body = [{ keywords: args.keywords.slice(0, 1000), location_name, language_code }];
  const auth = Buffer.from(`${login}:${password}`).toString('base64');

  let res;
  try {
    res = await fetchImpl(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch (err) {
    return { error: `DataForSEO request failed: ${err.message}` };
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { error: `DataForSEO ${res.status}: ${text.slice(0, 200)}` };
  }

  const data = await res.json();
  const result = data?.tasks?.[0]?.result || [];
  const keywords = result.map((r) => ({
    keyword: r.keyword,
    search_volume: r.search_volume ?? null,
    cpc: r.cpc ?? null,
    competition: r.competition ?? null,
    competition_index: r.competition_index ?? null
  }));

  return {
    client_id: clientId,
    credential_source: session.sources?.dataforseo || 'admin', // 'admin' (shared) | 'client' (own)
    location: location_name,
    language: language_code,
    count: keywords.length,
    keywords
  };
}
