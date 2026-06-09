/**
 * Serves the built React portal (web/dist) at /access with an SPA fallback.
 *
 * The fallback is scoped to /access/* so it can never shadow /mcp,
 * /.well-known/*, /auth/*, or /access/api/*. No-ops (with a warning) if the
 * build is missing so the server still runs (e.g. before `npm run build`).
 */

import express from 'express';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, '..', '..', 'web', 'dist');
const INDEX = join(DIST, 'index.html');

export function mountPortalStatic(app) {
  if (!existsSync(INDEX)) {
    console.error('[portal] web/dist not built — /access portal not served (run `npm run build`)');
    return false;
  }
  // Content-hashed assets can be cached long-term; index.html must NOT be cached
  // so clients always pick up the latest bundle after a deploy.
  app.use('/access', express.static(DIST, { index: false, redirect: false }));

  const sendIndex = (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.sendFile(INDEX);
  };
  // SPA fallback for client-side routes, excluding the API namespace.
  app.get('/access', sendIndex);
  app.get('/access/*splat', (req, res, next) => {
    if (req.path.startsWith('/access/api/')) return next();
    sendIndex(req, res);
  });
  return true;
}
