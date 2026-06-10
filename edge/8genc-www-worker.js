/**
 * 8genC — www.8genc.com Agent-Experience edge worker (Cloudflare).
 *
 * Fronts the Framer-hosted marketing site. Framer's managed hosting can't serve
 * /.well-known/*, /llms.txt, /openapi.json, JSON 404s, or custom headers — so
 * this Worker does, and transparently proxies every other request to Framer.
 *
 * It fixes the AINative AX audit failures that Framer can't:
 *   • MCP Discovery           → /.well-known/mcp.json + /.well-known/ai-plugin.json
 *   • API Documentation       → /openapi.json
 *   • Machine-Readable        → /llms.txt (+ enriched /robots.txt)
 *   • Authentication Standards→ /.well-known/oauth-protected-resource (RFC 9728)
 *   • Error Handling          → JSON 404 for agents (Accept: */* or json)
 *   • Rate Limiting Headers   → RateLimit-* on every response
 *
 * (Structured Data + the MCP discovery <meta>/<link> tags are added separately
 * via Framer → Site Settings → Custom Code → End of <head>; see edge/README.md.)
 *
 * DEPLOY: see edge/README.md. Set ORIGIN to a hostname Framer serves this site
 * for, WITHOUT routing back through this Worker (avoids a proxy loop).
 */

const SITE = 'https://www.8genc.com';
const MCP = 'https://mcp.8genc.com';

// Framer origin the Worker pulls page HTML/assets from. Must be a hostname that
// (a) Framer serves THIS site's content for, and (b) is NOT behind this Worker.
// Recommended: add a DNS-only (grey-cloud) subdomain in Cloudflare + as a custom
// domain in Framer, e.g. framer-origin.8genc.com → sites.framer.app. As a quick
// start you can use the project's *.framer.app URL. Override via the ORIGIN env var.
const DEFAULT_ORIGIN = 'https://minimum-function-158626.framer.app';

const RATE_LIMIT_PER_MIN = 600;

const TOOLS = [
  { name: 'prd_list_services', description: 'List all AINative products/services with APIs' },
  { name: 'prd_get_api_catalog', description: 'Get API details for a specific service' },
  { name: 'prd_suggest_stack', description: 'Suggest AINative services for given requirements' },
  { name: 'skill_list', description: 'List Agent Skills available in the skills repo' },
  { name: 'skill_get', description: "Get a skill's full SKILL.md body" },
  { name: 'skill_get_reference', description: 'Get a single reference file for a skill' },
  { name: 'skill_search', description: 'Find the right skill for a task (semantic search)' },
  { name: 'skill_sync', description: 'Mirror skills from GitHub into ZeroDB' }
];

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });

const text = (body, type = 'text/plain; charset=utf-8') =>
  new Response(body, { headers: { 'content-type': type } });

// Advertise the rate-limit policy on every response. Enforcement itself should
// be a Cloudflare Rate Limiting rule (see README) — the Worker is stateless.
function withRateHeaders(res) {
  const h = new Headers(res.headers);
  h.set('RateLimit-Limit', String(RATE_LIMIT_PER_MIN));
  h.set('RateLimit-Remaining', String(RATE_LIMIT_PER_MIN - 1));
  h.set('RateLimit-Reset', '60');
  h.set('RateLimit-Policy', `${RATE_LIMIT_PER_MIN};w=60`);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}

// Prefer JSON for agents (Accept: */* or application/json); HTML only when the
// client explicitly ranks text/html highest (browsers).
function prefersHtml(req) {
  const a = (req.headers.get('accept') || '').toLowerCase();
  if (!a || a.includes('*/*')) return false;
  return a.includes('text/html');
}

function routes() {
  return {
    '/llms.txt': () =>
      text(
`# 8genC

> 8genC is a consulting firm: seasoned fractional leadership balanced with
> agentic execution to streamline operations and improve velocity toward
> well-defined goals and growth metrics.

## Agent endpoint
- 8genC operates a Model Context Protocol (MCP) server for consultants and clients.
- MCP endpoint (Streamable HTTP, POST): ${MCP}/mcp
- MCP discovery manifest: ${MCP}/.well-known/mcp.json
- How to connect: ${MCP}/docs
- Request access (admin-gated): ${MCP}/access

## Site
- Home: ${SITE}/
- Services & pricing: ${SITE}/services
- Sitemap: ${SITE}/sitemap.xml

## MCP tools (8)
${TOOLS.map((t) => `- ${t.name} — ${t.description}`).join('\n')}
`
      ),

    '/robots.txt': () =>
      text(
`User-agent: *
Allow: /

# Machine-readable guides for AI agents
# LLM guide:   ${SITE}/llms.txt
# MCP manifest: ${SITE}/.well-known/mcp.json

Sitemap: ${SITE}/sitemap.xml
`
      ),

    '/openapi.json': () =>
      json({
        openapi: '3.1.0',
        info: {
          title: '8genC — agent endpoints',
          version: '1.0.0',
          description:
            'www.8genc.com is a marketing site; agent tools are served over MCP at ' +
            `${MCP}/mcp (JSON-RPC 2.0). Full MCP HTTP surface: ${MCP}/openapi.json.`,
          contact: { name: '8genC', url: `${SITE}` }
        },
        servers: [{ url: MCP }],
        components: {
          securitySchemes: {
            oauth2: {
              type: 'oauth2',
              flows: {
                authorizationCode: {
                  authorizationUrl: `${MCP}/authorize`,
                  tokenUrl: `${MCP}/token`,
                  scopes: { 'mcp:tools': 'Invoke MCP tools' }
                }
              }
            },
            bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: '8genc_pat' }
          }
        },
        paths: {
          '/mcp': {
            post: {
              summary: 'Model Context Protocol endpoint (JSON-RPC 2.0, Streamable HTTP)',
              security: [{ oauth2: ['mcp:tools'] }, { bearerAuth: [] }],
              responses: { 200: { description: 'JSON-RPC result' }, 401: { description: 'Unauthorized' } }
            }
          }
        }
      }),

    '/.well-known/mcp.json': () =>
      json({
        name: '8genC MCP',
        description: 'The secure MCP channel between your AI agents and the 8genC operating playbook.',
        endpoint: `${MCP}/mcp`,
        transport: 'streamable-http',
        protocol: 'mcp',
        authentication: {
          type: 'oauth2',
          bearer: true,
          token_format: '8genc_pat',
          scopes: ['mcp:tools'],
          metadata: `${MCP}/.well-known/oauth-authorization-server`
        },
        capabilities: { tools: true },
        tools: TOOLS,
        documentation: `${MCP}/docs`,
        openapi: `${MCP}/openapi.json`,
        llms_txt: `${SITE}/llms.txt`
      }),

    '/.well-known/ai-plugin.json': () =>
      json({
        schema_version: 'v1',
        name_for_human: '8genC',
        name_for_model: 'genc_mcp',
        description_for_human: 'AINative platform discovery and a GitHub-backed Agent Skills library, over MCP.',
        description_for_model:
          'Discover AINative services/APIs, suggest a service stack, and list/search/fetch GitHub-backed Agent Skills. Connect over MCP.',
        auth: { type: 'oauth', scope: 'mcp:tools', authorization_url: `${MCP}/.well-known/oauth-authorization-server` },
        api: { type: 'mcp', url: `${MCP}/mcp`, is_user_authenticated: true },
        logo_url: `${MCP}/assets/8genc-logomark-black.png`,
        contact_email: 'ag@getonpace.org',
        legal_info_url: `${SITE}`
      }),

    // RFC 9728 Protected Resource Metadata — advertises that the firm's agent
    // surface is OAuth-protected and where the authorization server lives.
    '/.well-known/oauth-protected-resource': () =>
      json({
        resource: `${MCP}/mcp`,
        authorization_servers: [MCP],
        bearer_methods_supported: ['header'],
        scopes_supported: ['mcp:tools'],
        resource_documentation: `${MCP}/docs`
      })
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const handlers = routes();

    // 1) Agent-experience endpoints served directly by the Worker.
    if (handlers[path]) {
      return withRateHeaders(handlers[path]());
    }

    // 2) Everything else → proxy to the Framer origin.
    const origin = (env && env.ORIGIN) || DEFAULT_ORIGIN;
    const originUrl = origin.replace(/\/$/, '') + path + url.search;

    const proxied = new Request(originUrl, request);
    let res;
    try {
      res = await fetch(proxied);
    } catch (e) {
      return withRateHeaders(json({ error: 'bad_gateway', message: 'origin fetch failed' }, 502));
    }

    // 3) JSON 404 for agents; let browsers keep Framer's HTML 404.
    if (res.status === 404 && !prefersHtml(request)) {
      return withRateHeaders(
        json(
          { error: 'not_found', message: `No resource at ${request.method} ${path}`, docs: `${SITE}/openapi.json` },
          404
        )
      );
    }

    return withRateHeaders(res);
  }
};
