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
import helmet from 'helmet';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { mountPortalStatic } from '../portal/static.js';
import { mountMarketing } from '../site/marketing.js';
import { query } from '../db/pool.js';

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
  app.disable('x-powered-by');

  // Safe security headers globally (HSTS, nosniff, frameguard DENY, no-referrer).
  // CSP/CORP/COOP are disabled globally so cross-origin MCP clients can still
  // fetch /.well-known + /token; a tailored CSP is applied to the /access SPA below.
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: false,
      crossOriginOpenerPolicy: false,
      crossOriginEmbedderPolicy: false,
      frameguard: { action: 'deny' },
      hsts: { maxAge: 31536000, includeSubDomains: true, preload: true }
    })
  );
  app.use(express.json({ limit: '4mb' }));
  app.use(cookieParser());

  // OAuth authorization-server endpoints + RFC 9728 metadata (PR3).
  if (auth?.oauthRouter) app.use(auth.oauthRouter);
  // Social login callbacks (/auth/:provider/callback), mounted at root.
  if (auth?.socialCallbackRouter) app.use(auth.socialCallbackRouter);

  // Portal REST API.
  if (auth?.portalApiRouter) app.use('/access/api', auth.portalApiRouter);

  // GET / serves the marketing home (mounted near the end); this is the JSON
  // fallback used only if the static site bundle is absent.
  const landingFallback = (_req, res) =>
    res.json({ name: serverName, version, transport: 'streamable-http', endpoint: '/mcp', authenticated: !!auth?.verifier, status: 'ok' });

  // Health check — verifies DB connectivity when auth is enabled so the platform
  // returns 503 (and Railway can react) if Postgres is unreachable.
  app.get('/health', async (_req, res) => {
    let db_ok = true;
    if (auth?.verifier) {
      try { await query('SELECT 1'); } catch { db_ok = false; }
    }
    res.status(db_ok ? 200 : 503).json({
      name: serverName,
      version,
      transport: 'streamable-http',
      endpoint: '/mcp',
      authenticated: !!auth?.verifier,
      db_ok,
      status: db_ok ? 'ok' : 'degraded'
    });
  });

  // MCP endpoint — stateless: one Server + transport per request.
  // When auth is enabled, requireBearerAuth runs first and sets req.auth.
  const mcpChain = [];
  if (auth?.verifier) {
    // Auth first (sets req.auth), then a per-credential rate limit keyed on the
    // OAuth client / PAT id (falls back to IP if somehow unset).
    mcpChain.push(
      requireBearerAuth({
        verifier: auth.verifier,
        requiredScopes: ['mcp:tools'],
        ...(auth.resourceMetadataUrl ? { resourceMetadataUrl: auth.resourceMetadataUrl } : {})
      })
    );
    mcpChain.push(
      rateLimit({
        windowMs: 60 * 1000,
        max: parseInt(process.env.MCP_RATE_LIMIT_PER_MIN || '600', 10),
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: (req) => req.auth?.clientId || ipKeyGenerator(req.ip),
        message: { jsonrpc: '2.0', error: { code: -32029, message: 'Rate limit exceeded' }, id: null }
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

  // Tailored CSP for the SPA + portal API (same-origin app; no inline scripts).
  app.use(
    '/access',
    helmet.contentSecurityPolicy({
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"]
      }
    })
  );

  // Static React portal at /access (SPA fallback scoped to /access/* — mounted
  // after /mcp and the well-known/API routes so it cannot shadow them).
  mountPortalStatic(app);

  // Marketing site (home/docs/tools) at the root + design-system assets. Mounted
  // last (before 405/error handlers) so it never shadows /mcp, /.well-known,
  // /access, /access/api, or /health.
  mountMarketing(app, { fallbackInfo: landingFallback });

  // Stateless mode has no server-initiated stream / session to tear down.
  const methodNotAllowed = (_req, res) =>
    res.status(405).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed (server is stateless; use POST /mcp).' },
      id: null
    });
  app.get('/mcp', methodNotAllowed);
  app.delete('/mcp', methodNotAllowed);

  // Final JSON error handler — catches thrown/async errors from the portal API
  // (and any route) so clients get JSON, never an HTML 500 with a stack trace.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(`[${serverName}] unhandled error on ${req.method} ${req.path}:`, err?.message);
    if (res.headersSent) return;
    const status = Number.isInteger(err?.status) ? err.status : 500;
    res.status(status).json({ error: status === 500 ? 'internal_error' : (err.code || 'error') });
  });

  await new Promise((resolve) => app.listen(port, host, resolve));
  return { port, host };
}
