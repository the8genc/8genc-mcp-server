/**
 * Streamable HTTP transport for the MCP server (stateless mode).
 *
 * Railway sets $PORT and routes the public domain to it. We bind to 0.0.0.0
 * and serve MCP at POST /mcp using a fresh Server + transport per request
 * (stateless: sessionIdGenerator = undefined). GET/DELETE /mcp return 405
 * since there is no long-lived session to stream over.
 *
 * Note: we use WebStandardStreamableHTTPServerTransport directly and do the
 * Node<->Web conversion ourselves. The SDK's Node-flavored
 * StreamableHTTPServerTransport routes through @hono/node-server's
 * getRequestListener, which returns a bare 400 in this setup. The web-standard
 * transport works correctly when handed a real Request, so we build one.
 *
 * Also serves GET / and GET /health for Railway health checks and humans.
 */

import express from 'express';
import cookieParser from 'cookie-parser';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { mountPortalStatic } from '../portal/static.js';

function toWebRequest(req) {
  const proto = req.headers['x-forwarded-proto'] || (req.socket?.encrypted ? 'https' : 'http');
  const host = req.headers.host || 'localhost';
  const url = `${proto}://${host}${req.originalUrl || req.url}`;

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value == null) continue;
    if (Array.isArray(value)) value.forEach((v) => headers.append(key, v));
    else headers.set(key, value);
  }
  // Body is supplied separately via parsedBody; build a bodyless Request so the
  // transport reads method/url/headers from here without touching the stream.
  return new Request(url, { method: req.method, headers });
}

async function writeWebResponse(webRes, res) {
  res.statusCode = webRes.status;
  webRes.headers.forEach((value, key) => res.setHeader(key, value));

  if (!webRes.body) {
    res.end();
    return;
  }

  const reader = webRes.body.getReader();
  res.on('close', () => reader.cancel().catch(() => {}));
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
  } finally {
    res.end();
  }
}

/**
 * @param {object} opts
 * @param {object} [opts.auth]  When present, enables authentication:
 *   { verifier, portalApiRouter, oauthRouter?, resourceMetadataUrl?, mountStatic? }
 *   When absent, /mcp is unauthenticated (local/stdio parity, tests).
 */
export async function startHttpServer({ createServer, port, host = '0.0.0.0', serverName, version, auth = null }) {
  const app = express();
  app.set('trust proxy', 1); // Railway terminates TLS; needed for secure cookies + rate-limit IPs
  app.use(express.json({ limit: '4mb' }));
  app.use(cookieParser());

  // OAuth authorization-server endpoints + RFC 9728 metadata (PR3).
  if (auth?.oauthRouter) app.use(auth.oauthRouter);

  // Portal REST API.
  if (auth?.portalApiRouter) app.use('/access/api', auth.portalApiRouter);

  // Health / landing (always public — Railway healthcheck).
  const info = (_req, res) =>
    res.json({
      name: serverName,
      version,
      transport: 'streamable-http',
      endpoint: '/mcp',
      authenticated: !!auth?.verifier,
      status: 'ok'
    });
  app.get('/', info);
  app.get('/health', info);

  // MCP endpoint — stateless: one Server + transport per request.
  // When auth is enabled, requireBearerAuth runs first and sets req.auth.
  const mcpChain = [];
  if (auth?.verifier) {
    mcpChain.push(
      requireBearerAuth({
        verifier: auth.verifier,
        requiredScopes: ['mcp:tools'],
        ...(auth.resourceMetadataUrl ? { resourceMetadataUrl: auth.resourceMetadataUrl } : {})
      })
    );
  }
  mcpChain.push(async (req, res) => {
    const server = createServer();
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined });

    res.on('close', () => {
      transport.close().catch(() => {});
      server.close().catch(() => {});
    });

    try {
      await server.connect(transport);
      const webRes = await transport.handleRequest(toWebRequest(req), {
        parsedBody: req.body,
        authInfo: req.auth
      });
      await writeWebResponse(webRes, res);
    } catch (err) {
      console.error(`[${serverName}] HTTP request error:`, err.message);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null
        });
      }
    }
  });
  app.post('/mcp', ...mcpChain);

  // Static React portal at /access (SPA fallback scoped to /access/* — mounted
  // after /mcp and the well-known/API routes so it cannot shadow them).
  mountPortalStatic(app);

  // Stateless mode has no server-initiated stream / session to tear down.
  const methodNotAllowed = (_req, res) =>
    res.status(405).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed (server is stateless; use POST /mcp).' },
      id: null
    });
  app.get('/mcp', methodNotAllowed);
  app.delete('/mcp', methodNotAllowed);

  await new Promise((resolve) => app.listen(port, host, resolve));
  return { port, host };
}
