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
  // Static assets (hashed filenames) under /access. redirect:false so a bare
  // /access doesn't 301 to /access/ — the SPA fallback below serves it directly.
  app.use('/access', express.static(DIST, { index: false, redirect: false }));

  // SPA fallback for client-side routes, excluding the API namespace.
  app.get('/access', (_req, res) => res.sendFile(INDEX));
  app.get('/access/*splat', (req, res, next) => {
    if (req.path.startsWith('/access/api/')) return next();
    res.sendFile(INDEX);
  });
  return true;
}
