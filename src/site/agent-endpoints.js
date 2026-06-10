/**
 * Agent Experience (AX) endpoints — makes mcp.8genc.com machine-discoverable.
 *
 * Mounted before the static site so these win over express.static (which also
 * ignores dotfiles like /.well-known anyway). Each route sets an explicit,
 * correct Content-Type so agent crawlers parse them as data, not HTML.
 *
 *   /llms.txt                              — LLM-facing site guide (llmstxt.org)
 *   /robots.txt                            — crawl policy + sitemap pointer
 *   /sitemap.xml                           — page index
 *   /openapi.json                          — machine-readable API surface
 *   /.well-known/ai-plugin.json            — OpenAI-style plugin manifest
 *   /.well-known/mcp.json                  — MCP discovery manifest
 */

const BASE = (process.env.PUBLIC_BASE_URL || 'https://mcp.8genc.com').replace(/\/$/, '');

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

export function mountAgentEndpoints(app, { serverName = '8genC MCP', version = '0.0.0' } = {}) {
  // ---- /llms.txt (llmstxt.org) -------------------------------------------
  app.get('/llms.txt', (_req, res) => {
    res.type('text/plain; charset=utf-8').send(
`# 8genC MCP

> The 8genC MCP server — the secure Model Context Protocol channel between your
> AI agents and the 8genC operating playbook: live platform intelligence and a
> vetted, GitHub-backed Agent Skills library.

## Endpoint
- MCP endpoint (Streamable HTTP, POST): ${BASE}/mcp
- Authentication: OAuth 2.1 (PKCE) or Bearer personal access token (8genc_pat_…)
- OAuth metadata: ${BASE}/.well-known/oauth-authorization-server
- MCP discovery manifest: ${BASE}/.well-known/mcp.json
- OpenAPI: ${BASE}/openapi.json

## Docs
- How to connect: ${BASE}/docs
- Tool & capability catalog: ${BASE}/tools
- Request access (admin-gated): ${BASE}/access

## Tools (8)
${TOOLS.map((t) => `- ${t.name} — ${t.description}`).join('\n')}

## Status
- Live status JSON: ${BASE}/api/status
- Health check: ${BASE}/health
`
    );
  });

  // ---- /robots.txt --------------------------------------------------------
  app.get('/robots.txt', (_req, res) => {
    res.type('text/plain; charset=utf-8').send(
`User-agent: *
Allow: /
Disallow: /access/api/

# Machine-readable guides for AI agents
# LLM guide:  ${BASE}/llms.txt
# MCP manifest: ${BASE}/.well-known/mcp.json

Sitemap: ${BASE}/sitemap.xml
`
    );
  });

  // ---- /sitemap.xml -------------------------------------------------------
  app.get('/sitemap.xml', (_req, res) => {
    const urls = ['/', '/docs', '/tools', '/access'];
    res.type('application/xml; charset=utf-8').send(
`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${BASE}${u}</loc></url>`).join('\n')}
</urlset>
`
    );
  });

  // ---- /openapi.json ------------------------------------------------------
  app.get('/openapi.json', (_req, res) => {
    res.type('application/json; charset=utf-8').json({
      openapi: '3.1.0',
      info: {
        title: '8genC MCP — public HTTP surface',
        version,
        description:
          'Public HTTP endpoints for the 8genC MCP server. Agent tools are exposed over the Model Context Protocol at POST /mcp (JSON-RPC 2.0); see /.well-known/mcp.json for MCP discovery.',
        contact: { name: '8genC', url: `${BASE}/docs` }
      },
      servers: [{ url: BASE }],
      components: {
        securitySchemes: {
          oauth2: {
            type: 'oauth2',
            description: 'OAuth 2.1 with PKCE. Metadata at /.well-known/oauth-authorization-server.',
            flows: {
              authorizationCode: {
                authorizationUrl: `${BASE}/authorize`,
                tokenUrl: `${BASE}/token`,
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
            requestBody: {
              required: true,
              content: { 'application/json': { schema: { type: 'object' } } }
            },
            responses: {
              200: { description: 'JSON-RPC result', content: { 'application/json': {} } },
              401: { description: 'Missing/invalid credentials' },
              429: { description: 'Rate limit exceeded' }
            }
          }
        },
        '/api/status': {
          get: {
            summary: 'Live status metrics (uptime, latency, tool/service counts)',
            responses: { 200: { description: 'Status JSON', content: { 'application/json': {} } } }
          }
        },
        '/health': {
          get: {
            summary: 'Health check (verifies DB connectivity when auth is enabled)',
            responses: {
              200: { description: 'Healthy', content: { 'application/json': {} } },
              503: { description: 'Degraded' }
            }
          }
        },
        '/.well-known/mcp.json': {
          get: { summary: 'MCP discovery manifest', responses: { 200: { description: 'OK' } } }
        },
        '/.well-known/oauth-authorization-server': {
          get: { summary: 'OAuth 2.0 Authorization Server Metadata (RFC 8414)', responses: { 200: { description: 'OK' } } }
        }
      }
    });
  });

  // ---- /.well-known/ai-plugin.json (OpenAI-style manifest) ----------------
  app.get('/.well-known/ai-plugin.json', (_req, res) => {
    res.type('application/json; charset=utf-8').json({
      schema_version: 'v1',
      name_for_human: '8genC MCP',
      name_for_model: 'genc_mcp',
      description_for_human:
        'AINative platform discovery and a GitHub-backed Agent Skills library, over MCP.',
      description_for_model:
        'Use to discover AINative services/APIs, suggest a service stack for requirements, and to list/search/fetch GitHub-backed Agent Skills. Connect over the Model Context Protocol at /mcp.',
      auth: {
        type: 'oauth',
        scope: 'mcp:tools',
        authorization_url: `${BASE}/.well-known/oauth-authorization-server`
      },
      api: { type: 'mcp', url: `${BASE}/mcp`, is_user_authenticated: true },
      logo_url: `${BASE}/assets/8genc-logomark-black.png`,
      contact_email: 'ag@getonpace.org',
      legal_info_url: `${BASE}/docs`
    });
  });

  // ---- /.well-known/mcp.json (MCP discovery) ------------------------------
  app.get('/.well-known/mcp.json', (_req, res) => {
    res.type('application/json; charset=utf-8').json({
      name: serverName,
      version,
      description:
        'The secure MCP channel between your AI agents and the 8genC operating playbook.',
      endpoint: `${BASE}/mcp`,
      transport: 'streamable-http',
      protocol: 'mcp',
      authentication: {
        type: 'oauth2',
        bearer: true,
        token_format: '8genc_pat',
        scopes: ['mcp:tools'],
        metadata: `${BASE}/.well-known/oauth-authorization-server`
      },
      capabilities: { tools: true },
      tools: TOOLS,
      documentation: `${BASE}/docs`,
      openapi: `${BASE}/openapi.json`,
      llms_txt: `${BASE}/llms.txt`
    });
  });
}
